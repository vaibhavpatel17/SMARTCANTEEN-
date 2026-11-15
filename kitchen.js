/* Kitchen dashboard, core: sign-in, shell, polling, Live Orders and Pickup Counter.
   The other pages (history, menu, forecast, inventory, settings) live in kitchen-pages.js and register here. */
(function () {
  'use strict';
  const { $, $$, esc, fmt, mins, rs, I, stk, clock, poller, theme, store } = CC;
  const API = () => window.CanteenAPI;
  const root = () => document.getElementById('kitchenRoot');

  const NAV = [
    ['live', 'Live Orders', 'Orders', 'orders'], ['pickup', 'Pickup Counter', 'Pickup', 'mega'], ['payments', 'Payments', 'Payments', 'cash'], ['history', 'Order History', 'History', 'clock'],
    ['menu', 'Menu Management', 'Menu', 'menu'], ['forecast', 'Demand Forecast', 'Forecast', 'chart'], ['inventory', 'Inventory', 'Stock', 'box'], ['settings', 'Settings', 'Settings', 'sliders'],
  ];
  const ACT = { new: ['preparing', 'Start preparing', 'prep'], preparing: ['ready', 'Mark ready', 'rdy'], ready: ['picked_up', 'Mark picked up', 'pick'] };
  const BACK = { preparing: ['new', 'Back to New'], ready: ['preparing', 'Back to Preparing'] };
  const STAT_NAME = { verifying: 'Confirm payment', new: 'New', preparing: 'Preparing', ready: 'Ready', picked_up: 'Picked up', cancelled: 'Cancelled', expired: 'Expired' };
  const STATS = [['new', 'New Orders', 'bag'], ['preparing', 'Preparing', 'flame'], ['ready', 'Ready for Pickup', 'bell'], ['delayed', 'Delayed', 'alert']];

  const K = {
    cfg: null, authed: false, page: store.get('sc-kpage', 'live'), snap: null, menu: [], menuMap: {}, online: true, rev: -1,
    filter: 'all', sort: 'slot', sel: null, detailOpen: false, confirm: null, announced: new Set(), called: null, vres: null, vform: { token: '', pin: '' },
    sound: store.get('sc-ksound', true), seen: null, seenPay: null, lastHtml: '', lastPage: null, dirty: false, lastMin: -1, toastT: 0, chrome: '', started: false,
  };
  const Pages = {};
  let stopPoll = null, tickId = 0, audio = null;

  /* ------------------------------------------------------------ helpers */
  const pill = s => `<span class="k-pill ${s}">${STAT_NAME[s] || s}</span>`;
  const itemsText = o => o.items.map(i => `${esc(i.name)} × ${i.qty}`).join(', ');
  const qty = o => o.items.reduce((a, i) => a + i.qty, 0);
  const art = id => K.menuMap[id] || { art: 'chai', tint: '#FFE9A8' };
  const orders = () => (K.snap ? K.snap.orders : []);
  const findOrder = id => orders().find(o => o.id === id);
  const isWide = () => (root() ? root().clientWidth >= 1240 : false);
  function withDelay(list) { const t = clock.now(); return list.map(o => ({ ...o, delayed: (o.status === 'new' || o.status === 'preparing') && o.slot < t })); }
  function slotInfo(o, t) {
    if (o.status === 'ready') { const w = Math.max(0, Math.round(t - (o.ready_at ?? t))); return { text: w ? `waiting ${mins(w)}` : 'just ready', late: false }; }
    const d = Math.round(o.slot - t);
    return d > 0 ? { text: `in ${mins(d)}`, late: false } : d === 0 ? { text: 'due now', late: false } : { text: `${mins(-d)} late`, late: true };
  }
  function toast(msg) {
    const el = $('.k-toast', root()); if (!el) return;
    el.textContent = msg; el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(K.toastT); K.toastT = setTimeout(() => { el.hidden = true; }, 3400);
  }
  function setOnline(v) { if (K.online === v) return; K.online = v; render(); }
  function beep() {
    if (!K.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const t = audio.currentTime;
      [[880, 0], [1175, .17], [880, .34]].forEach(([f, d]) => {
        const o = audio.createOscillator(), g = audio.createGain(); o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(.28, t + d + .02); g.gain.exponentialRampToValueAtTime(.001, t + d + .15);
        o.connect(g); g.connect(audio.destination); o.start(t + d); o.stop(t + d + .17);
      });
    } catch (e) { /* audio blocked until the first tap */ }
  }
  function speak(text) {
    try { if (!('speechSynthesis' in window)) return false; speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = .92; speechSynthesis.speak(u); return true; } catch (e) { return false; }
  }

  /* ------------------------------------------------------------ data */
  async function loadSnap() {
    try {
      const [snap, menu] = await Promise.all([API().kSnapshot(), API().menu()]);
      K.snap = snap; K.menu = menu.items; K.menuMap = Object.fromEntries(menu.items.map(m => [m.id, m]));
      const fresh = snap.orders.filter(o => o.status === 'new').map(o => o.id);
      if (K.seen) {
        const added = fresh.filter(id => !K.seen.has(id));
        if (added.length) {
          const first = findOrder(added[0]);
          toast(added.length === 1 ? `New order ${first.token}: ${first.items.map(i => `${i.name} × ${i.qty}`).join(', ')}` : `${added.length} new orders just came in`);
          if (root() && root().offsetParent !== null) beep();
        }
      }
      K.seen = new Set(fresh); snap.orders.forEach(o => K.seen.add(o.id));
      const vf = (snap.verifying || []).map(o => o.id);
      if (K.seenPay) {
        const addedPay = (snap.verifying || []).filter(o => !K.seenPay.has(o.id));
        if (addedPay.length) {
          toast(addedPay.length === 1 ? `${addedPay[0].token} says they paid ${rs(addedPay[0].total)}. Check your UPI app and confirm.` : `${addedPay.length} payments to confirm`);
          if (root() && root().offsetParent !== null) beep();
        }
      }
      K.seenPay = new Set(vf);
      if (K.sel && !findOrder(K.sel)) { K.sel = null; K.detailOpen = false; }
      if (K.called && !snap.orders.some(o => o.id === K.called && o.status === 'ready')) K.called = null;
      if (!K.online) K.online = true;
      render();
    } catch (e) {
      if (e.status === 401) return signedOut();
      if (e.offline) setOnline(false); else toast(e.message);
    }
  }
  function loadAll() { loadSnap(); const pg = Pages[K.page]; if (pg && pg.load) pg.load(); }
  async function poll() {
    try {
      const r = await API().rev();
      clock.sync(r.now, r.running, r.sec_per_min, r.demo);
      if (!K.online) { K.online = true; render(); }
      if (r.rev !== K.rev) { K.rev = r.rev; loadAll(); }
    } catch (e) { if (e.offline) setOnline(false); }
  }
  function tick() {
    if (!K.authed) return;
    const c = $('[data-live="clock"]', root()); if (c) c.textContent = fmt(clock.now()).toUpperCase();
    const m = Math.floor(clock.now());
    if (m !== K.lastMin) { K.lastMin = m; const pg = Pages[K.page]; if (pg && pg.minute) pg.minute(m); render(); }
  }

  /* ------------------------------------------------------------ mount, sign in, sign out */
  async function mount() {
    K.cfg = await API().config();
    let ok = false;
    try { ok = (await API().kMe()).ok; } catch (e) { /* offline: show sign in */ }
    if (ok) start(); else renderAuth();
  }
  function unmount() { stop(); const el = root(); if (el) el.innerHTML = ''; }
  function stop() { if (stopPoll) stopPoll(); clearInterval(tickId); stopPoll = null; K.started = false; }
  function signedOut() { K.authed = false; stop(); renderAuth(); }
  function renderAuth(msg = '') {
    K.authed = false; K.chrome = ''; K.lastHtml = '';
    root().innerHTML = `<div class="k-auth"><form class="k-card k-login" data-form="login" autocomplete="off">
      <div class="logo"><svg viewBox="0 0 100 100" aria-hidden="true"><use href="#s-samosa"/></svg></div>
      <div><h1>Kitchen sign in</h1><p class="k-sub">Enter the kitchen PIN to see live orders.</p></div>
      <label class="k-field"><span class="sr">Kitchen PIN</span><input id="kPin" type="password" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="PIN" autofocus></label>
      <p class="err" id="kErr" role="alert">${esc(msg)}</p>
      <button type="submit" class="k-btn big block">Sign in</button>
      ${K.cfg && K.cfg.pin_hint ? `<p class="k-sub">Demo PIN: <b>${esc(K.cfg.pin_hint)}</b></p>` : ''}
      ${window.Shell && K.cfg && K.cfg.demo ? '<button type="button" class="k-btn ghost" data-act="student">Open student view</button>' : ''}
    </form></div>`;
  }
  async function login(form) {
    const pin = $('#kPin', form).value.trim(); if (!pin) return;
    const btn = $('button[type="submit"]', form); btn.disabled = true;
    try { await API().kLogin(pin); start(); } catch (e) { renderAuth(e.message); const i = $('#kPin', root()); if (i) i.focus(); }
  }
  function start() {
    K.authed = true; K.seen = null; K.seenPay = null; K.rev = -1; K.started = true; K.chrome = ''; K.lastHtml = ''; K.lastPage = null;
    if (!Pages[K.page]) K.page = 'live';
    root().innerHTML = `<div class="k-shell">
      <aside class="k-side"><div class="k-brand"><span class="logo"><svg viewBox="0 0 100 100" aria-hidden="true"><use href="#s-samosa"/></svg></span><span class="bt">Smart Canteen<small>Kitchen Dashboard</small></span></div>
        <nav class="k-navw" aria-label="Kitchen pages"><ul class="k-nav" id="kNav"></ul></nav>
        <div class="k-foot">${window.Shell && K.cfg.demo ? `<button type="button" data-act="student">${I.phone}<span>Student view</span></button>` : ''}<button type="button" data-act="logout">${I.out}<span>Logout</span></button></div></aside>
      <main class="k-main"><header class="k-head" id="kHead"></header><div class="k-page" id="kPage" tabindex="-1"></div><div class="k-toast" role="status" hidden></div></main></div>`;
    loadAll();
    stopPoll = poller(poll, 2000); tickId = setInterval(tick, 1000);
    render();
  }

  /* ------------------------------------------------------------ chrome (nav + header) and page */
  function render() {
    if (!K.authed || !K.started) return;
    renderChrome(); renderPage();
  }
  function renderChrome() {
    const list = withDelay(orders()), cook = list.filter(o => o.status === 'new' || o.status === 'preparing').length, ready = list.filter(o => o.status === 'ready').length;
    const payN = K.snap ? (K.snap.verifying || []).length + (K.snap.refunds || []).length : 0;
    const pg = Pages[K.page] || {}, accepting = K.snap ? K.snap.accepting : true;
    const day = K.snap && K.snap.day ? new Date(K.snap.day + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '';
    const ts = theme.get();
    const html = `<ul>${NAV.map(([id, l, s, ic]) => `<li data-id="${id}">${id === K.page ? 'cur' : ''}${id === 'live' ? cook : id === 'pickup' ? ready : id === 'payments' ? payN : ''}</li>`).join('')}</ul>${pg.title}${pg.sub}${K.online}${accepting}${ts}${K.sound}${day}`;
    if (html === K.chrome) return;
    K.chrome = html;
    $('#kNav', root()).innerHTML = NAV.map(([id, l, s, ic]) => {
      const n = id === 'live' ? cook : id === 'pickup' ? ready : id === 'payments' ? payN : 0;
      return `<li><button type="button" data-act="nav" data-page="${id}" ${id === K.page ? 'aria-current="page"' : ''}>${I[ic]}<span class="lbl-l">${l}</span><span class="lbl-s">${s}</span>${n ? `<span class="badge ${id === 'pickup' ? 'g' : id === 'payments' ? 'r' : ''}" aria-label="${n} ${id === 'payments' ? 'payments to handle' : 'orders'}">${n}</span>` : ''}</button></li>`;
    }).join('');
    const st = !K.online ? ['offline', 'Offline, retrying'] : accepting ? ['', 'Kitchen online'] : ['paused', 'Orders paused'];
    $('#kHead', root()).innerHTML = `<div class="k-title"><h1>${esc(pg.title || '')}</h1><p>${esc(pg.sub || '')}</p></div>
      <div class="k-clock"><b data-live="clock">${fmt(clock.now()).toUpperCase()}</b><span>${esc(day)} · IST</span></div>
      <button type="button" class="k-pill-btn ${st[0]}" data-act="toggle-accept" title="Tap to ${accepting ? 'pause' : 'resume'} new orders"><i></i>${st[1]}</button>
      <button type="button" class="k-ibtn" data-act="sound" aria-label="Sound alerts ${K.sound ? 'on' : 'off'}" title="Sound alerts ${K.sound ? 'on' : 'off'}">${K.sound ? I.sound : I.mute}</button>
      <button type="button" class="k-ibtn" data-act="theme" aria-label="Theme: ${ts}" title="Theme: ${ts}">${ts === 'dark' ? I.moon : ts === 'light' ? I.sun : '<b aria-hidden="true">A</b>'}</button>`;
  }
  function renderPage(force) {
    const el = $('#kPage', root()), pg = Pages[K.page]; if (!el || !pg) return;
    const same = K.lastPage === K.page;
    const html = pg.html();
    if (!force && same && html === K.lastHtml) return;
    const a = document.activeElement;
    if (!force && same && a && el.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) { K.dirty = true; return; }
    const top = same ? el.scrollTop : 0;
    el.innerHTML = html; el.scrollTop = top; K.lastHtml = html; K.lastPage = K.page; K.dirty = false;
    if (pg.after) pg.after(el);
  }
  function go(id) {
    if (!Pages[id]) return;
    K.page = id; store.set('sc-kpage', id); K.detailOpen = false; K.lastPage = null; K.chrome = '';
    const pg = Pages[id]; if (pg.load) pg.load();
    render(); const el = $('#kPage', root()); if (el) el.scrollTop = 0;
  }

  /* ------------------------------------------------------------ Live Orders */
  function visible(list) {
    let l = list.slice();
    if (K.filter === 'delayed') l = l.filter(o => o.delayed); else if (K.filter !== 'all') l = l.filter(o => o.status === K.filter);
    const rank = { new: 0, preparing: 0, ready: 1 };
    if (K.sort === 'slot') l.sort((a, b) => rank[a.status] - rank[b.status] || a.slot - b.slot || a.placed - b.placed || a.token_no - b.token_no);
    else if (K.sort === 'oldest') l.sort((a, b) => a.placed - b.placed || a.token_no - b.token_no);
    else l.sort((a, b) => b.placed - a.placed || b.token_no - a.token_no);
    return l;
  }
  function statCaption(key, list, t) {
    if (key === 'new') { const n = list.filter(o => o.status === 'new'); return n.length ? `next slot ${fmt(Math.min(...n.map(o => o.slot)))}` : 'nothing waiting'; }
    if (key === 'preparing') { const n = list.filter(o => o.status === 'preparing'); return n.length ? `${n.reduce((a, o) => a + qty(o), 0)} items cooking` : 'stoves are free'; }
    if (key === 'ready') { const n = list.filter(o => o.status === 'ready'); return n.length ? `oldest waiting ${mins(Math.max(...n.map(o => t - (o.ready_at ?? t))))}` : 'counter is clear'; }
    const n = list.filter(o => o.delayed); return n.length ? `worst ${mins(Math.max(...n.map(o => t - o.slot)))} late` : 'all on time';
  }
  function rowHtml(o, t) {
    const a = ACT[o.status], si = slotInfo(o, t);
    return `<li class="k-row ${K.sel === o.id ? 'is-sel' : ''}">
      <button type="button" class="k-sel" data-act="select" data-id="${o.id}" aria-label="Order ${o.token}, ${esc(o.name)}. Show details.">
        <span class="k-tok"><b>${o.token}</b><span>${esc(o.name)}</span></span>
        <span class="k-its">${itemsText(o)}</span>
        <span class="k-st">${pill(o.status)}${o.delayed ? '<span class="k-pill late">Delayed</span>' : ''}</span>
        <span class="k-slot"><b>${fmt(o.slot)}</b><span class="${si.late ? 'late' : ''}">${si.text}</span></span>
      </button>
      <div class="k-act"><button type="button" class="k-btn ${a[2]}" data-act="advance" data-id="${o.id}" data-to="${a[0]}">${a[1]}</button></div></li>`;
  }
  function detailHtml(o, t) {
    if (!o) return `<div class="k-dcard k-card k-dempty k-empty"><b>No order selected</b><span>Tap an order to see what to cook and who it is for.</span></div>`;
    const a = ACT[o.status], b = BACK[o.status], si = slotInfo(o, t), pay = o.payment;
    const idx = { new: 0, preparing: 1, ready: 2, picked_up: 3 }[o.status];
    const steps = [['Order received', o.paid_at ?? o.placed, 'Payment confirmed'], ['Preparing', o.prep_at, 'Cooking started'], ['Ready for pickup', o.ready_at, 'Waiting at the counter'], ['Picked up', o.picked_at, 'Handed to the student']];
    const sure = K.confirm === o.id;
    return `<div class="k-dcard k-card">
      <div class="k-dh"><h2>${o.token}</h2>${pill(o.status)}${o.delayed ? '<span class="k-pill late">Delayed</span>' : ''}
        <span class="when">Order time<br><b>${fmt(o.paid_at ?? o.placed)}</b></span><button type="button" class="k-dx" data-act="close-detail" aria-label="Close details">${I.x}</button></div>
      <section class="k-sec"><h3>Order items <span class="k-sub">· ${qty(o)} item${qty(o) > 1 ? 's' : ''}</span></h3><ul class="k-oi">${o.items.map(i => { const m = art(i.id);
        return `<li><span class="k-thumb" style="--tint:${m.tint}">${stk(m.art)}</span><div><b>${esc(i.name)}</b><small>${rs(i.price)} each</small></div><span class="amt">× ${i.qty} · ${rs(i.qty * i.price)}</span></li>`; }).join('')}</ul></section>
      <section class="k-sec"><h3>Student details</h3><dl class="k-kv">
        <dt>Pickup token</dt><dd>${o.token}</dd><dt>Pickup slot</dt><dd>${fmt(o.slot)} <span class="k-sub">(${si.text})</span></dd>
        <dt>Name</dt><dd>${esc(o.name)}</dd>${o.phone ? `<dt>Phone</dt><dd>${esc(o.phone)}</dd>` : ''}${o.section_label ? `<dt>Class</dt><dd>${esc(o.section_label)}</dd>` : ''}
        <dt>Payment</dt><dd>${pay ? `${esc(pay.label)}${pay.test ? '<span class="k-tag">Test</span>' : ''}` : 'n/a'}</dd><dt>Paid</dt><dd>${rs(o.total)}</dd></dl></section>
      <section class="k-sec"><h3>Preparation status</h3><ol class="k-steps">${steps.map(([n, ts, sub], i) => `<li class="${i < idx ? 'done' : i === idx ? `now at-${o.status}` : ''}"><div>${n}${i === idx ? `<small>${sub}</small>` : ''}</div><time>${ts != null && i <= idx ? fmt(ts) : ''}</time></li>`).join('')}</ol></section>
      <div class="k-dact"><button type="button" class="k-btn big block ${a[2]}" data-act="advance" data-id="${o.id}" data-to="${a[0]}">${a[1] === 'Start preparing' ? 'Mark as Preparing' : a[1] === 'Mark ready' ? 'Mark as Ready' : 'Mark as Picked Up'}</button>
        <div class="two">${b ? `<button type="button" class="k-btn ghost" data-act="advance" data-id="${o.id}" data-to="${b[0]}">${b[1]}</button>` : '<span></span>'}
        <button type="button" class="k-btn danger ${sure ? 'sure' : ''}" data-act="cancel" data-id="${o.id}">${sure ? `Tap again to refund ${rs(o.total)}` : 'Cancel and refund'}</button></div></div></div>`;
  }
  Pages.live = {
    title: 'Live Orders', sub: 'Soonest pickup slot first',
    html() {
      if (!K.snap) return '<div class="k-empty"><b>Loading orders…</b></div>';
      const t = clock.now(), all = withDelay(orders());
      if (K.sel == null && isWide()) { const f = visible(all)[0]; if (f) K.sel = f.id; }
      const cnt = { new: 0, preparing: 0, ready: 0, delayed: 0 }; all.forEach(o => { cnt[o.status]++; if (o.delayed) cnt.delayed++; });
      const list = visible(all), sel = all.find(o => o.id === K.sel);
      const wait = (K.snap.verifying || []).length, due = (K.snap.refunds || []).length;
      const payBar = wait || due ? `<button type="button" class="k-alertbar" data-act="go-pay">${I.cash}<span><b>${wait ? `${wait} payment${wait > 1 ? 's' : ''} to confirm` : ''}${wait && due ? ' · ' : ''}${due ? `${due} refund${due > 1 ? 's' : ''} to send` : ''}</b><small>Open your UPI app, match the payment, then tap Payment received.</small></span>${I.arrow}</button>` : '';
      return `${K.online ? '' : '<p class="k-offline" role="status">Cannot reach the canteen server. Retrying…</p>'}${payBar}
      <div class="k-live"><div style="display:grid;gap:16px;min-width:0">
        <div class="k-stats">${STATS.map(([k, l, ic]) => `<button type="button" class="k-stat s-${k}" data-act="stat" data-key="${k}" aria-pressed="${K.filter === k}"><span class="ic">${I[ic]}</span><span class="num">${cnt[k]}</span><span class="lbl">${l}</span><span class="cap">${statCaption(k, all, t)}</span></button>`).join('')}</div>
        <section class="k-card k-orders"><div class="k-tools">
          <div class="k-filters" role="group" aria-label="Filter orders">${[['all', 'All', all.length], ['new', 'New', cnt.new], ['preparing', 'Preparing', cnt.preparing], ['ready', 'Ready', cnt.ready], ['delayed', 'Delayed', cnt.delayed]].map(([k, l, n]) => `<button type="button" class="k-fbtn" data-act="filter" data-key="${k}" aria-pressed="${K.filter === k}">${l}<span class="n">${n}</span></button>`).join('')}</div>
          <label class="k-sort"><span class="k-sub">Sort</span><select class="k-input" data-sort aria-label="Sort orders"><option value="slot" ${K.sort === 'slot' ? 'selected' : ''}>Pickup slot first</option><option value="oldest" ${K.sort === 'oldest' ? 'selected' : ''}>Oldest first</option><option value="newest" ${K.sort === 'newest' ? 'selected' : ''}>Newest first</option></select></label></div>
          ${list.length ? `<div class="k-th" aria-hidden="true"><div class="cols"><span>Token</span><span>Items</span><span>Status</span><span>Pickup slot</span></div><span></span></div><ul class="k-rows">${list.map(o => rowHtml(o, t)).join('')}</ul>`
            : `<div class="k-empty"><b>${all.length ? 'No orders match this filter' : 'No live orders right now'}</b><span>${all.length ? 'Try another filter above.' : 'New paid orders appear here the moment a student pays.'}</span></div>`}</section></div>
        <aside class="k-detail ${K.detailOpen && sel ? 'open' : ''}" aria-label="Order details">${detailHtml(sel, t)}</aside></div>`;
    },
    click(act, b) {
      const id = b.dataset.id;
      if (act === 'stat') { K.filter = K.filter === b.dataset.key ? 'all' : b.dataset.key; renderPage(true); return true; }
      if (act === 'filter') { K.filter = b.dataset.key; renderPage(true); return true; }
      if (act === 'select') { K.sel = id; K.detailOpen = true; renderPage(true); return true; }
      if (act === 'close-detail') { K.detailOpen = false; renderPage(true); return true; }
      if (act === 'cancel') { cancelOrder(id); return true; }
      if (act === 'go-pay') { go('payments'); return true; }
      return false;
    },
    change(el) { if (el.dataset.sort !== undefined) { K.sort = el.value; renderPage(true); return true; } return false; },
  };

  async function advance(id, to, btn) {
    if (btn) btn.disabled = true;
    const o = findOrder(id);
    try {
      await API().kStatus(id, to);
      K.confirm = null;
      if (K.vres && K.vres.order && K.vres.order.id === id) K.vres.order = { ...K.vres.order, status: to };
      toast(to === 'preparing' ? `${o.token} is cooking now` : to === 'ready' ? `${o.token} is ready. The student's e-token turns green.` : to === 'picked_up' ? `${o.token} handed over` : `${o.token} moved back to ${STAT_NAME[to]}`);
      if (to === 'picked_up' && K.sel === id) { K.sel = null; K.detailOpen = false; }
    } catch (e) { toast(e.message); }
    await loadSnap();
  }
  async function cancelOrder(id) {
    if (K.confirm !== id) { K.confirm = id; renderPage(true); setTimeout(() => { if (K.confirm === id) { K.confirm = null; renderPage(true); } }, 4000); return; }
    const o = findOrder(id);
    try {
      const r = await API().kCancel(id, 'Cancelled by the kitchen'); K.confirm = null;
      toast(r.order.payment && r.order.payment.status === 'refund_due' ? `${o ? o.token : 'Order'} cancelled. Send ${rs(o ? o.total : 0)} back by UPI, then tap Mark refunded under Payments.` : `${o ? o.token : 'Order'} cancelled. ${rs(o ? o.total : 0)} refunded to the student.`); if (K.sel === id) { K.sel = null; K.detailOpen = false; }
    } catch (e) { K.confirm = null; toast(e.message); }
    await loadSnap();
  }

  /* ------------------------------------------------------------ Pickup Counter */
  function announce(o) {
    K.announced.add(o.id); K.called = o.id;
    const ok = speak(`Token ${String(o.token_no).split('').join(' ')}. ${o.name}, your order is ready. Please collect it from the counter.`);
    toast(`Announced ${o.token}${ok ? '' : ' (this device has no voice, so it is shown on the queue display)'}`);
    renderPage(true);
  }
  function readyList() { return withDelay(orders()).filter(o => o.status === 'ready').sort((a, b) => (a.ready_at ?? 0) - (b.ready_at ?? 0) || a.token_no - b.token_no); }
  Pages.pickup = {
    title: 'Pickup Counter', sub: 'Hand over ready orders and call students',
    html() {
      if (!K.snap) return '<div class="k-empty"><b>Loading…</b></div>';
      const t = clock.now(), ready = readyList(), next = ready.find(o => !K.announced.has(o.id)) || ready[0];
      const vr = K.vres;
      return `<div class="k-pick"><div class="k-pick-h"><h2><span class="ic">${I.check}</span>Ready for Pickup</h2><span class="k-pill ready">${ready.length} order${ready.length === 1 ? '' : 's'} ready</span>
        <button type="button" class="k-btn sp" data-act="announce" ${next ? '' : 'disabled'}>${I.mega}Announce next${next ? ` ${next.token}` : ''}</button></div>
        ${ready.length ? `<div class="k-rgrid">${ready.map(o => { const m = art(o.items[0].id), si = slotInfo(o, t);
          return `<article class="k-rcard ${K.called === o.id ? 'called' : ''}"><div class="k-rart" style="--tint:${m.tint}">${stk(m.art)}${o.items.length > 1 ? `<span class="more">+${o.items.length - 1} more</span>` : ''}</div>
            <h3>${o.token}<span>${esc(o.name)}</span></h3><p class="its">${itemsText(o)}</p><p class="since">Ready since ${fmt(o.ready_at ?? t)} · ${si.text}${K.called === o.id ? ' · called' : ''}</p>
            <button type="button" class="k-btn pick block" data-act="advance" data-id="${o.id}" data-to="picked_up">Mark picked up</button></article>`; }).join('')}</div>`
          : `<div class="k-card k-empty"><b>Nothing is waiting</b><span>Orders you mark Ready show up here for pickup.</span></div>`}
        <section class="k-card k-verify"><div><h3 style="font:800 1.05rem var(--f-body)">Check an e-token</h3><p class="k-sub">Ask for the token number and the 4 digit PIN shown on the student's e-token.</p></div>
          <form data-form="verify" autocomplete="off"><label class="k-field"><span>Token number</span><input name="token" inputmode="numeric" placeholder="1043" value="${esc(K.vform.token)}" data-vf="token"></label>
          <label class="k-field"><span>PIN</span><input name="pin" inputmode="numeric" maxlength="4" placeholder="0000" value="${esc(K.vform.pin)}" data-vf="pin"></label><button type="submit" class="k-btn">Verify</button></form>
          ${vr ? (vr.error ? `<div class="k-vres bad" role="alert"><b>${esc(vr.error)}</b></div>` : vrHtml(vr.order)) : ''}</section>
        <section class="k-queue" id="kQueue" aria-label="Pickup queue display"><div class="k-qh"><div><h3><span class="ic">${I.mega}</span>Ready for Pickup</h3><p>Please collect your order from the counter</p></div>
          <button type="button" class="k-btn ghost" data-act="fullscreen" style="color:#fff;border-color:rgba(255,255,255,.3)">Full screen</button></div>
          ${ready.length ? `<div class="k-tiles">${ready.map(o => `<span class="k-tile ${K.called === o.id ? 'called' : ''}">${o.token}</span>`).join('')}</div>` : '<p class="none">No orders waiting. Put this screen near the counter so students can see their number.</p>'}</section></div>`;
    },
    click(act, b) {
      if (act === 'announce') { const ready = readyList(), next = ready.find(o => !K.announced.has(o.id)) || ready[0]; if (next) announce(next); return true; }
      if (act === 'fullscreen') { try { const q = $('#kQueue', root()); if (document.fullscreenElement) document.exitFullscreen(); else if (q.requestFullscreen) q.requestFullscreen(); else toast('Full screen is not available on this browser.'); } catch (e) { toast('Full screen is not available on this browser.'); } return true; }
      if (act === 'dismiss-vres') { K.vres = null; renderPage(true); return true; }
      return false;
    },
    input(el) { if (el.dataset.vf) { K.vform[el.dataset.vf] = el.value.replace(/\D/g, ''); if (el.value !== K.vform[el.dataset.vf]) el.value = K.vform[el.dataset.vf]; return true; } return false; },
    async submit(name, form) {
      if (name !== 'verify') return false;
      const token = K.vform.token, pin = K.vform.pin; if (!token || !pin) { K.vres = { error: 'Enter both the token number and the PIN.' }; renderPage(true); return true; }
      try { const r = await API().kVerify(token, pin); K.vres = { order: r.order }; K.vform.pin = ''; } catch (e) { K.vres = { error: e.message }; }
      renderPage(true); return true;
    },
  };
  function vrHtml(o) {
    const live = findOrder(o.id) || o, st = live.status, a = ACT[st];
    return `<div class="k-vres"><div><b>${o.token} · ${esc(o.name)}${o.section_label ? ` · ${esc(o.section_label)}` : ''}</b></div><div>${itemsText(o)}</div>
      <div>${pill(st)} <span class="k-sub">Paid ${rs(o.total)}</span></div>
      ${st === 'ready' ? `<button type="button" class="k-btn pick" data-act="advance" data-id="${o.id}" data-to="picked_up">Mark picked up</button>`
        : st === 'picked_up' ? '<div><b>Already picked up.</b> Do not hand it over twice.</div>'
        : a ? `<div>This order is still <b>${STAT_NAME[st].toLowerCase()}</b>. It is not ready to hand over yet.</div>` : ''}
      <button type="button" class="k-btn ghost" data-act="dismiss-vres">Clear</button></div>`;
  }

  /* ------------------------------------------------------------ events (attached once; the root element never changes) */
  document.addEventListener('DOMContentLoaded', () => {
    const el = root(); if (!el) return;
    el.addEventListener('pointerdown', () => { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch (e) { /* no audio */ } }, { once: true });
    el.addEventListener('click', async e => {
      const b = e.target.closest('[data-act]'); if (!b || !el.contains(b)) return;
      const act = b.dataset.act;
      if (act === 'nav') return go(b.dataset.page);
      if (act === 'advance') return advance(b.dataset.id, b.dataset.to, b);
      if (act === 'logout') { try { await API().kLogout(); } catch (err) { /* already signed out */ } K.authed = false; stop(); renderAuth(); return; }
      if (act === 'student') return window.Shell && Shell.goStudent();
      if (act === 'toggle-accept') { try { const r = await API().kSettings({ accepting: !(K.snap && K.snap.accepting) }); toast(r.accepting ? 'Taking orders again' : 'New orders paused. Students see a notice.'); } catch (err) { toast(err.message); } return loadSnap(); }
      if (act === 'sound') { K.sound = !K.sound; store.set('sc-ksound', K.sound); if (K.sound) beep(); render(); return; }
      if (act === 'theme') { theme.set({ auto: 'light', light: 'dark', dark: 'auto' }[theme.get()]); return; }
      const pg = Pages[K.page]; if (pg && pg.click) await pg.click(act, b, e);
    });
    el.addEventListener('submit', async e => {
      e.preventDefault(); const f = e.target, name = f.dataset.form; if (!name) return;
      if (name === 'login') return login(f);
      const pg = Pages[K.page]; if (pg && pg.submit) await pg.submit(name, f, e);
    });
    el.addEventListener('input', e => { const pg = Pages[K.page]; if (K.authed && pg && pg.input) pg.input(e.target, e); });
    el.addEventListener('change', e => { const pg = Pages[K.page]; if (K.authed && pg && pg.change) pg.change(e.target, e); });
    el.addEventListener('focusout', () => { if (K.dirty) setTimeout(() => { if (!el.contains(document.activeElement) || !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) renderPage(); }, 0); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && K.detailOpen) { K.detailOpen = false; renderPage(true); } });
    document.addEventListener('sc-theme', () => { K.chrome = ''; if (K.authed) { renderChrome(); renderPage(true); } });
  });

  window.Kitchen = { mount, unmount, K, Pages, register: (id, p) => { Pages[id] = p; }, render, renderPage, toast, loadSnap, loadAll, withDelay, pill, art, itemsText, go, beep };
})();
