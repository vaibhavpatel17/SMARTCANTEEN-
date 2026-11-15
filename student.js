/* Student app: sign up / sign in, timetable, hero, menu, cart, slot picker, checkout (real UPI, or the demo gateway) and the e-token. */
(function () {
  'use strict';
  const { $, $$, esc, clamp, sleep, reduceMotion, fmt, fmtS, mins, mmss, rs, I, stk, clock, qrSvg, confetti, poller, store } = CC;
  const API = () => window.CanteenAPI;
  const root = () => document.getElementById('studentRoot');

  let mounted = false, cfg = null, toastT = 0, stopPoll = null, tickId = 0, lastMin = -1, slotReq = 0;
  const last = { grid: '', sheet: '', kind: '' };
  const S = {
    cat: 'All', cart: {}, menu: [], accepting: true, user: null, day: null, auth: null, tt: null, payReady: true,
    sug: null, slot: null, sheet: null, pay: null, viewing: null, orders: {}, seen: {}, stamped: {}, rev: -1, online: true,
  };
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], DAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  /* ------------------------------------------------------------ small helpers */
  const cartItems = () => Object.entries(S.cart).filter(([, q]) => q > 0).map(([id, qty]) => ({ id, qty }));
  const qtyOf = items => items.reduce((a, i) => a + i.qty, 0);
  const item = id => S.menu.find(m => m.id === id);
  const totalOf = items => items.reduce((a, i) => a + (item(i.id)?.price || 0) * i.qty, 0);
  const myOrders = () => Object.values(S.orders).sort((a, b) => (b.placed - a.placed) || (b.token_no - a.token_no));
  const activeOrder = () => myOrders().find(o => ['pending_payment', 'verifying', 'new', 'preparing', 'ready'].includes(o.status));
  const STATUS_TXT = { pending_payment: 'Waiting for payment', verifying: 'Confirming payment', new: 'Received', preparing: 'Cooking', ready: 'Ready', picked_up: 'Picked up', cancelled: 'Cancelled', expired: 'Expired' };
  const m2t = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const t2m = v => { const m = /^(\d{1,2}):(\d{2})/.exec(v || ''); return m ? +m[1] * 60 + +m[2] : null; };
  const clean = (v, n) => String(v || '').replace(/\D/g, '').slice(0, n);

  /* The canteen day and weekday come from the server (India time), so a phone set to another timezone still agrees with the kitchen. */
  const weekday = () => (new Date((S.day || new Date().toISOString().slice(0, 10)) + 'T12:00:00').getDay() + 6) % 7;
  // Same rule as the server: your own gaps for today's weekday, else the canteen's general breaks.
  function windowsToday() {
    const gaps = (S.user && S.user.timetable && S.user.timetable[String(weekday())]) || [];
    const own = gaps.map(([a, b]) => [Math.max(a, cfg.day_start), Math.min(b, cfg.day_end)]).filter(([a, b]) => b - a >= 5);
    if (own.length) return { source: 'timetable', list: own.map(([a, b]) => ({ session: { label: 'Your break' }, start: a, end: b })) };
    return { source: 'canteen', list: cfg.sessions.map(x => ({ session: x, start: x.from, end: x.to })) };
  }
  const nextWindow = t => windowsToday().list.find(w => w.end > t) || null;
  function breakText() {
    const t = clock.now(), w = nextWindow(t);
    if (!w) return 'Canteen is closed for today';
    return t >= w.start ? `${w.session.label} is on · ${mins(w.end - t)} left` : `${w.session.label} in ${mins(w.start - t)}`;
  }
  function requireUser(msg) {
    if (S.user) return true;
    if (msg) toast(msg);
    openAuth('signup'); return false;
  }
  function dueText(o, t = clock.now()) {
    if (o.status === 'pending_payment') return 'Waiting for payment';
    if (o.status === 'verifying') return 'Confirming payment';
    if (o.status === 'ready') return 'Ready · waiting';
    if (o.status === 'picked_up') return 'Picked up';
    if (o.status === 'cancelled') return 'Cancelled';
    if (o.status === 'expired') return 'Expired';
    const d = Math.round(o.slot - t);
    return d > 0 ? `in ${mins(d)}` : d === 0 ? 'due now' : `${mins(-d)} late`;
  }
  function toast(msg) {
    const el = $('#sToast', root()); if (!el) return;
    el.textContent = msg; el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 3600);
  }
  const holdLeft = () => S.pay ? Math.max(0, Math.round((S.pay.heldUntil - performance.now()) / 1000)) : 0;

  /* ------------------------------------------------------------ hero (static markup) */
  const HERO = () => `
  <section class="hero" id="hero">
    <div class="fl fl-a">${stk('chai', 'sticker die')}</div>
    <div class="fl fl-b">${stk('vada', 'sticker die')}</div>
    <div class="fl fl-c">${stk('dosa', 'sticker die')}</div>
    <div class="fl fl-d">${stk('maggi', 'sticker die')}</div>
    <div class="fl fl-e">${stk('coffee', 'sticker die')}</div>
    <div class="hero-in">
      <div class="hero-copy">
        <span class="live"><i></i><span data-live="breakin">${esc(cfg ? breakText() : '')}</span></span>
        <h1>
          <span class="ln"><span class="w" style="--i:0">Skip</span> <span class="w" style="--i:1">the</span> <span class="w q" style="--i:2">queue.</span></span>
          <span class="ln"><span class="w" style="--i:3">Not</span> <span class="w" style="--i:4">the</span> <span class="w" style="--i:5">samosa.</span>${stk('samosa', 'ih die')}</span>
        </h1>
        <p class="lead">Order from your phone, pay online, and get an e-token with a QR code. Pick up in your break. No paper slips, no pushing at the counter.</p>
        <div class="cta">
          <button type="button" class="btn" data-act="to-menu">Order for next break ${I.arrow}</button>
          ${cfg.demo ? '<button type="button" class="btn white" data-act="to-kitchen">See the kitchen side</button>' : ''}
        </div>
        <ul class="perks">
          <li>${I.check}Slots follow your timetable</li>
          <li>${I.check}${cfg.gateway.kind === 'upi' ? 'Pay with any UPI app' : 'UPI, card or netbanking'}</li>
          <li>${I.check}E-token, no paper</li>
        </ul>
      </div>
      <div class="ticket-wrap" aria-hidden="true">
        <div class="ticket">
          <div class="tk-top"><span>E-token</span><span class="paid-b">PAID</span></div>
          <div class="tk-row"><div class="tk-qr">${qrSvg('SCANTEEN|1043|0000|sample', { label: 'Sample QR code' })}</div>
            <div class="tk-token"><small>Token</small><b>#1043</b><span class="tk-pin">PIN 4821</span></div></div>
          <div class="tk-meta"><span>Pickup</span><b>1:05 pm</b><span>Order</span><b>2 samosa, 1 chai</b></div>
          <ol class="tk-track"><li>Received</li><li>Cooking</li><li>Ready</li></ol>
          <div class="tk-stamp">READY!</div>
        </div>
        <div class="notif"><span class="bi"><svg viewBox="0 0 24 24"><use href="#s-bell"/></svg></span><span>#1043 is ready. Come grab it!<small>Smart Canteen · now</small></span></div>
      </div>
    </div>
    <div class="tapes" aria-hidden="true">
      <div class="tape tape-a">${[0, 1].map(() => `<div class="run">${['No queue', 'No paper slips', 'Hot chai on time', 'Pick your slot', 'Pay from your phone'].map(t => `<span>${t}</span><svg viewBox="0 0 24 24"><use href="#s-star"/></svg>`).join('')}</div>`).join('')}</div>
      <div class="tape tape-b">${[0, 1].map(() => `<div class="run">${['Fresh samosas', 'Skip the rush', 'Order before the bell', 'E-token in your pocket', 'Eat on time'].map(t => `<span>${t}</span><svg viewBox="0 0 24 24"><use href="#s-star"/></svg>`).join('')}</div>`).join('')}</div>
    </div>
  </section>`;

  const TEMPLATE = () => `
  <div class="screen" id="sScreen">
    <header class="s-top">
      <div class="brand"><svg class="brand-mark" viewBox="0 0 100 100" aria-hidden="true"><use href="#s-samosa"/></svg><span>Smart Canteen</span></div>
      <span class="ist" title="India Standard Time"><b data-live="ist">${fmt(clock.now())}</b><i>IST</i></span>
      <button type="button" class="acct" id="acctBtn" data-act="open-acct" aria-label="Account"></button>
      <button type="button" class="tokchip" id="tokChip" data-act="open-chip" hidden></button>
    </header>
    <p class="offline" id="offline" role="status" hidden>Reconnecting to the canteen…</p>
    ${HERO()}
    <section class="menu" id="menu">
      <div class="menu-head"><h2>Pick your food</h2><span class="win" id="winChip"></span></div>
      <div id="banner"></div>
      <div id="ttNudge"></div>
      <div class="chips" id="chips" role="group" aria-label="Filter menu"></div>
      <div class="grid" id="grid"></div>
    </section>
    <section class="how">
      <h2>How it works</h2>
      <ol>
        <li><b>Pick your food</b><span>Add what you want. Items running low say so.</span></li>
        <li><b>Take a slot and pay</b><span>We match the breaks in your timetable with how busy the kitchen is. ${cfg.gateway.kind === 'upi' ? 'Pay with any UPI app.' : 'Pay with UPI, card or netbanking.'}</span></li>
        <li><b>Show your e-token</b><span>It turns green when your order is ready. Show the QR or the PIN at the counter.</span></li>
      </ol>
    </section>
    <footer class="s-foot">${cfg.gateway.kind === 'test' ? 'Prototype. Payments here are simulated and no real money moves.' : cfg.gateway.kind === 'upi' ? 'Payments go by UPI straight to the canteen. All times are India time (IST).' : 'Payments are processed by Razorpay. All times are India time (IST).'}</footer>
  </div>
  <div class="cartbar" id="cartbar" hidden></div>
  <div class="sheet-wrap" id="sheetWrap" hidden><div class="scrim" data-act="close-sheet"></div><div class="sheet" id="sheet" role="dialog" aria-modal="true" aria-label="Order"></div></div>
  <div class="toast" id="sToast" role="status" hidden></div>
  <canvas class="confetti" aria-hidden="true"></canvas>`;

  /* ------------------------------------------------------------ data refresh */
  async function refresh() {
    let mine = { orders: [] };
    const [m, o] = await Promise.all([API().menu(), S.user ? API().myOrders().catch(e => { if (e.status === 401) { S.user = null; return { orders: [] }; } throw e; }) : Promise.resolve(mine)]);
    mine = o; S.menu = m.items; S.accepting = m.accepting; S.payReady = !m.pay || m.pay.ready;
    // remember when each hold countdown was measured so the header chip can count down locally
    const at = performance.now();
    S.orders = {}; mine.orders.forEach(x => { x._at = at; S.orders[x.id] = x; });
    render();
    if (S.sheet === 'cart') loadSlots();
    if (S.sheet === 'pay' && S.pay) followPayment();
  }
  // keep the pay sheet in step with what the kitchen does to the order
  function followPayment() {
    const p = S.pay, o = S.orders[p.orderId]; if (!o) return;
    if (o.status === 'new' && p.step !== 'success') { paid(o); return; }
    if (o.status === 'verifying' && p.step !== 'verifying') { p.step = 'verifying'; renderSheet(true); return; }
    if (o.status === 'pending_payment' && p.step === 'verifying') {   // the kitchen could not find the payment
      p.step = 'method'; p.error = (o.payment && o.payment.error) || 'The canteen could not find this payment.'; p.heldUntil = performance.now() + (o.hold_left || 0) * 1000; p.upi = o.upi || p.upi; renderSheet(true); return;
    }
    if (['expired', 'cancelled'].includes(o.status) && !['success', 'processing'].includes(p.step)) { p.step = 'expired'; p.error = o.cancel_reason || ''; renderSheet(true); }
  }
  async function poll() {
    try {
      const r = await API().rev();
      clock.sync(r.now, r.running, r.sec_per_min, r.demo); S.day = r.day || S.day;
      setOnline(true);
      if (r.rev !== S.rev) { S.rev = r.rev; await refresh(); }
    } catch (e) { if (e.offline) setOnline(false); }
  }
  function setOnline(v) { if (S.online === v) return; S.online = v; const el = $('#offline', root()); if (el) el.hidden = v; }

  /* ------------------------------------------------------------ mount */
  async function mount() {
    cfg = await API().config();
    const r = await API().rev(); clock.sync(r.now, r.running, r.sec_per_min, r.demo); S.rev = r.rev; S.day = r.day;
    try { S.user = (await API().me()).user; } catch (e) { S.user = null; }
    const el = root(); el.innerHTML = TEMPLATE(); mounted = true; last.grid = ''; last.sheet = '';
    const scr = $('#sScreen', el), hero = $('#hero', el);
    let raf = 0;
    scr.addEventListener('scroll', () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; hero.style.setProperty('--sy', clamp(scr.scrollTop / 160, 0, 3).toFixed(2)); }); }, { passive: true });
    renderChips();
    await refresh().catch(() => {});
    if (!S.user) openAuth('signup');              // first thing a new student sees
    stopPoll = poller(poll, 2000);
    tickId = setInterval(tick, 1000);
  }
  function unmount() {
    mounted = false; if (stopPoll) stopPoll(); clearInterval(tickId);
    const el = root(); if (el) el.innerHTML = '';
  }

  // listeners live on the root element, which never changes, so they are added once
  const wire = () => {
    const el = root(); if (!el) return;
    el.addEventListener('click', onClick);
    el.addEventListener('change', e => {
      if (e.target.dataset.f === 'bank') { S.pay.form.bank = e.target.value; }
      if (e.target.dataset.tt) onTimeChange(e.target);
    });
    el.addEventListener('input', onInput);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset?.enter) { e.preventDefault(); const b = $(`[data-act="${e.target.dataset.enter}"]`, el); if (b && !b.disabled) b.click(); } });
    el.addEventListener('pointermove', e => {
      const hero = $('#hero', el); if (e.pointerType !== 'mouse' || !hero) return;
      const r = hero.getBoundingClientRect(); hero.style.setProperty('--px', ((e.clientX - r.left) / r.width - .5).toFixed(3)); hero.style.setProperty('--py', ((e.clientY - r.top) / r.height - .5).toFixed(3));
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();

  function onInput(e) {
    const t = e.target;
    if (t.dataset?.a && S.auth) {                      // sign up / sign in form
      const k = t.dataset.a; let v = t.value;
      if (k === 'phone') { v = clean(v, 10); t.value = v; }
      S.auth.form[k] = v; return;
    }
    const f = t.dataset?.f; if (!f || !S.pay) return;
    if (f === 'utr') { const v = clean(t.value, 12); t.value = v; S.pay.form.utr = v; const bt = $('[data-act="send-utr"]', root()); if (bt) bt.disabled = v.length !== 12; return; }
    let v = t.value;
    if (f === 'card') { v = v.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim(); t.value = v; }
    if (f === 'exp') { v = v.replace(/\D/g, '').slice(0, 4); if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2); t.value = v; }
    if (f === 'cvv') { v = v.replace(/\D/g, '').slice(0, 4); t.value = v; }
    S.pay.form[f] = v;
  }

  /* ------------------------------------------------------------ clicks */
  async function onClick(e) {
    const b = e.target.closest('[data-act]'); if (!b || !root().contains(b)) return;
    const act = b.dataset.act, id = b.dataset.id;
    if (act === 'to-menu') { $('#menu', root()).scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }); return; }
    if (act === 'to-kitchen') { if (window.Shell) Shell.goKitchen(); return; }
    if (act === 'cat') { S.cat = b.dataset.cat; last.grid = ''; renderChips(); renderMenu(); return; }
    if (act === 'add') {
      if (!requireUser('Sign up first, then add your food.')) return;
      const m = item(id), max = m && m.orderable ? m.left : 0;
      if ((S.cart[id] || 0) < max) S.cart[id] = (S.cart[id] || 0) + 1; else toast(max ? 'That is all we have today.' : 'Sorry, that just sold out.');
      render(); if (S.sheet === 'cart') { renderSheet(true); loadSlots(); } return;
    }
    if (act === 'dec') { S.cart[id] = Math.max(0, (S.cart[id] || 0) - 1); if (!S.cart[id]) delete S.cart[id]; render(); if (S.sheet === 'cart') { if (!cartItems().length) S.sheet = null; renderSheet(true); loadSlots(); } return; }
    if (act === 'open-cart') { if (!requireUser()) return; S.sheet = 'cart'; S.slot = null; S.sug = null; renderSheet(true); render(); loadSlots(); return; }
    if (act === 'open-acct') { if (!S.user) openAuth('login'); else { S.sheet = 'acct'; renderSheet(true); render(); } return; }
    if (act === 'auth-tab') { S.auth.mode = b.dataset.m; S.auth.error = ''; renderSheet(true); return; }
    if (act === 'do-auth') { doAuth(); return; }
    if (act === 'signout') { signOut(); return; }
    if (act === 'edit-tt') { openTimetable(false); return; }
    if (act === 'tt-day') { S.tt.day = +b.dataset.d; S.tt.error = ''; renderSheet(true); return; }
    if (act === 'tt-add') { ttAdd(); return; }
    if (act === 'tt-del') { S.tt.data[S.tt.day].splice(+b.dataset.i, 1); S.tt.error = ''; renderSheet(true); return; }
    if (act === 'tt-preset') { ttAdd([+b.dataset.s, +b.dataset.e]); return; }
    if (act === 'tt-copy') { const src = S.tt.data[S.tt.day]; for (let d = 0; d < 5; d++) if (d !== S.tt.day) S.tt.data[d] = src.map(w => w.slice()); S.tt.error = ''; renderSheet(true); toast('Copied to Monday to Friday. Change any day you like.'); return; }
    if (act === 'tt-save') { saveTimetable(); return; }
    if (act === 'send-utr') { sendUtr(); return; }
    if (act === 'copy') { copyText(b.dataset.v); return; }
    if (act === 'open-chip') { const o = activeOrder(); if (!o) return; if (o.status === 'pending_payment' || o.status === 'verifying') resumePay(o.id); else { S.viewing = o.id; S.sheet = 'token'; renderSheet(true); render(); } return; }
    if (act === 'close-sheet') { closeSheet(); return; }
    if (act === 'pick-slot') { S.slot = +b.dataset.s; renderSheet(true); return; }
    if (act === 'view') { S.viewing = id; renderSheet(true); return; }
    if (act === 'start-pay') { startPayment(); return; }
    if (act === 'pm') { S.pay.method = b.dataset.m; S.pay.error = ''; renderSheet(true); return; }
    if (act === 'do-pay') { beginMethod(); return; }
    if (act === 'app-pay') { S.pay.method = 'upi'; S.pay.via = b.dataset.app; submitPay('upi', { app: b.dataset.app }); return; }
    if (act === 'pay-back') { S.pay.step = 'method'; S.pay.error = ''; renderSheet(true); return; }
    if (act === 'rz-open') { if (S.pay && S.pay.step === 'failed') { S.pay.step = 'method'; } razorpayPay(); return; }
    if (act === 'rz-check') { if (S.pay && S.pay.rzResp) confirmRazorpay(S.pay, S.pay.rzResp); return; }
    if (act === 'show-token') { S.viewing = S.pay.orderId; S.pay = null; S.sheet = 'token'; renderSheet(true); render(); return; }
    if (act === 'restart') {   // put the same items back in the cart so the student only has to pick a new slot
      const o = S.pay && S.orders[S.pay.orderId]; S.cart = {};
      if (o) o.items.forEach(i => { const it = S.menu.find(m => m.id === i.id); if (it && it.orderable) S.cart[i.id] = Math.min(i.qty, it.left); });
      S.pay = null; S.sheet = Object.keys(S.cart).length ? 'cart' : null; S.slot = null; renderSheet(true); render(); loadSlots(); return;
    }
    if (act === 'cancel') {
      b.disabled = true;
      try { const r = await API().cancel(id); S.orders[id] = r.order; toast(r.order.payment && r.order.payment.status === 'refund_due' ? `Order cancelled. The canteen will send ${rs(r.order.total)} back to you by UPI.` : `Order cancelled. Refund of ${rs(r.order.total)} started.`); }
      catch (err) { toast(err.message); }
      render(); renderSheet(true); return;
    }
  }
  function closeSheet() {
    if (S.sheet === 'pay' && S.pay && S.pay.step === 'method' && holdLeft() > 0) toast('Your order is held. Tap the green chip at the top to finish paying.');
    if (S.sheet === 'pay' && S.pay && S.pay.step === 'rzwait') toast('Razorpay has your payment. Your e-token appears on the home screen as soon as it is confirmed.');
    if (S.sheet === 'pay' && S.pay && S.pay.step === 'verifying') toast('The canteen is checking your payment. Your e-token appears when they confirm it.');
    if (S.sheet === 'tt') S.tt = null;
    if (S.sheet === 'pay' && S.pay && ['success'].includes(S.pay.step)) { S.viewing = S.pay.orderId; S.pay = null; S.sheet = 'token'; renderSheet(true); render(); return; }
    S.sheet = null; renderSheet(true); render();
  }

  /* ------------------------------------------------------------ slots */
  async function loadSlots() {
    const items = cartItems(); if (!items.length) return;
    const req = ++slotReq;
    try {
      const s = await API().slots(items);
      if (req !== slotReq) return;
      S.sug = s;
      if (!s.closed && !s.slots.some(x => x.start === S.slot && !x.full)) S.slot = s.best ? s.best.start : null;
      if (S.sheet === 'cart') renderSheet(true);
    } catch (e) { if (S.sheet === 'cart') toast(e.message); }
  }

  /* ------------------------------------------------------------ checkout */
  const newForm = () => ({ vpa: '', card: '', exp: '', cvv: '', cname: S.user ? S.user.name : '', bank: '', otp: '', utr: '' });
  async function startPayment() {
    const items = cartItems(); if (!items.length || S.slot == null) return;
    const btn = $('[data-act="start-pay"]', root()); if (btn) { btn.disabled = true; btn.textContent = 'Holding your slot…'; }
    try {
      const r = await API().createOrder({ items, slot: S.slot });
      r.order._at = performance.now(); S.orders[r.order.id] = r.order; S.cart = {};
      S.pay = { orderId: r.order.id, paymentId: r.payment.id, gateway: r.payment.gateway, rp: r.payment, upi: r.payment.upi || null, step: 'method', method: r.payment.gateway === 'test' ? '' : 'upi', error: '',
        heldUntil: performance.now() + r.hold_seconds * 1000, form: newForm() };
      S.sheet = 'pay'; renderSheet(true); render(); refresh().catch(() => {});
      if (r.payment.gateway === 'razorpay') { const p = S.pay; setTimeout(() => { if (S.pay === p && p.step === 'method') razorpayPay(); }, reduceMotion ? 0 : 250); }
    } catch (e) {
      if (e.status === 401) { S.user = null; openAuth('login'); toast('Please sign in again.'); return; }
      toast(e.message); S.slot = null; renderSheet(true); loadSlots(); refresh().catch(() => {});
    }
  }
  function resumePay(orderId) {
    const o = S.orders[orderId]; if (!o || !o.payment) return;
    S.pay = { orderId, paymentId: o.payment.id, gateway: o.payment.gateway, rp: o.rp ? { key_id: cfg.gateway.key_id, rp_order_id: o.rp.rp_order_id } : null, upi: o.upi || null, step: o.status === 'verifying' ? 'verifying' : 'method', method: o.payment.gateway === 'test' ? '' : 'upi',
      error: (o.payment.status === 'failed' && o.payment.error) || '', heldUntil: performance.now() + (o.hold_left || 0) * 1000, form: newForm() };
    S.sheet = 'pay'; renderSheet(true);
  }
  // real UPI: the student typed the 12 digit transaction ID from their payment app
  async function sendUtr() {
    const p = S.pay; if (!p || !/^\d{12}$/.test(p.form.utr || '')) return;
    p.step = 'processing'; p.error = ''; renderSheet(true);
    try {
      const [res] = await Promise.all([API().submitUtr(p.paymentId, p.form.utr), sleep(reduceMotion ? 100 : 700)]);
      // the kitchen may already have answered while we waited; only move to "verifying" if nothing newer has arrived
      if (p.step === 'processing') { res.order._at = performance.now(); S.orders[res.order.id] = res.order; p.step = 'verifying'; }
    } catch (e) { if (p.step === 'processing') { p.step = e.status === 410 ? 'expired' : 'method'; p.error = e.message; } }
    if (S.pay === p) { renderSheet(true); render(); }
  }
  async function copyText(v) {
    try { await navigator.clipboard.writeText(v); toast('UPI ID copied.'); }
    catch (e) { const t = document.createElement('textarea'); t.value = v; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); toast('UPI ID copied.'); } catch (err) { toast('Press and hold the ID to copy it.'); } t.remove(); }
  }
  const luhn = n => { let s = 0, alt = false; for (let i = n.length - 1; i >= 0; i--) { let d = +n[i]; if (alt) { d *= 2; if (d > 9) d -= 9; } s += d; alt = !alt; } return s % 10 === 0; };
  // The simulated bank always accepts this one-time code; a real gateway shows its own OTP page instead.
  const SIM_OTP = '123456';
  function beginMethod() {
    const p = S.pay, f = p.form; p.error = ''; p.via = null;
    if (p.method === 'upi') {
      if (!/^[a-z0-9._-]{2,}@[a-z]{2,}$/i.test(f.vpa.trim())) { p.error = 'Enter a valid UPI ID, like name@bank.'; return renderSheet(true); }
      f.vpa = f.vpa.trim(); return submitPay('upi', { vpa: f.vpa, approve: true });
    }
    if (p.method === 'card') {
      const num = f.card.replace(/\s/g, '');
      if (!(num.length >= 13 && luhn(num))) p.error = 'That card number does not look right.';
      else if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(f.exp)) p.error = 'Enter the expiry as MM/YY.';
      else if (!/^\d{3,4}$/.test(f.cvv)) p.error = 'Enter the 3 digit CVV.';
      if (p.error) return renderSheet(true);
      return submitPay('card', { number: f.card, exp: f.exp, cvv: f.cvv, name: f.cname, otp: SIM_OTP });
    }
    if (!f.bank) { p.error = 'Choose your bank first.'; return renderSheet(true); }
    return submitPay('netbanking', { bank: f.bank, approve: true });
  }
  async function submitPay(method, details) {
    const p = S.pay; p.step = 'processing'; p.error = ''; renderSheet(true);
    try {
      const [res] = await Promise.all([API().pay(p.paymentId, method, details), sleep(reduceMotion ? 100 : 1100)]);
      if (res.status === 'success') return paid(res.order);
      p.step = 'failed'; p.error = res.error; p.form.otp = '';
    } catch (e) {
      p.step = e.status === 410 ? 'expired' : 'failed'; p.error = e.message;
    }
    if (S.pay === p) renderSheet(true);
  }
  function paid(order) {
    const p = S.pay; S.orders[order.id] = order; S.seen[order.id] = order.status;
    if (!p) return;
    p.step = 'success'; p.form = { vpa: '', card: '', exp: '', cvv: '', cname: '', bank: '', otp: '', utr: '' };   // card details are never kept
    renderSheet(true); render(); confetti(root());
    setTimeout(() => { if (S.pay === p && S.sheet === 'pay' && p.step === 'success') { S.viewing = order.id; S.pay = null; S.sheet = 'token'; renderSheet(true); render(); } }, reduceMotion ? 600 : 1700);
  }
  function loadScript(src) {
    return new Promise((ok, no) => { if ([...document.scripts].some(s => s.src === src)) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Could not load the payment window.')); document.head.appendChild(s); });
  }
  // Razorpay: the student pays inside Razorpay's own window (UPI apps, cards, netbanking, wallets). The server then asks Razorpay
  // what really happened. If the student closes the app right after paying, Razorpay's webhook confirms the order instead.
  async function razorpayPay() {
    const p = S.pay, o = p && S.orders[p.orderId];
    if (!p || !o || p.rzOpen || !['method', 'failed'].includes(p.step)) return;
    if (!p.rp) { p.error = 'Could not start the payment. Close this and try again.'; renderSheet(true); return; }
    p.rzOpen = true; p.error = '';
    try {
      await loadScript('https://checkout.razorpay.com/v1/checkout.js');
      if (S.pay !== p) { p.rzOpen = false; return; }
      const rz = new window.Razorpay({
        key: p.rp.key_id, order_id: p.rp.rp_order_id, amount: o.total * 100, currency: 'INR', name: cfg.name, description: `Order ${o.token}`,
        prefill: { name: o.name }, theme: { color: '#FF5C93' }, retry: { enabled: true, max_count: 3 },
        handler: resp => { p.rzOpen = false; confirmRazorpay(p, resp); },
        modal: { ondismiss: () => { p.rzOpen = false; if (S.pay === p && p.step === 'method') renderSheet(true); } },
      });
      rz.on('payment.failed', r => { p.rzOpen = false; p.step = 'failed'; p.error = (r.error && r.error.description) || 'The payment failed.'; if (S.pay === p) renderSheet(true); });
      rz.open();
    } catch (e) { p.rzOpen = false; p.error = e.message; if (S.pay === p) renderSheet(true); }
  }
  // Razorpay says the student paid. Ask our server to confirm it. If Razorpay is slow to answer we keep trying, and the webhook may get there first.
  async function confirmRazorpay(p, resp) {
    p.rzResp = resp; p.step = 'processing'; p.error = ''; renderSheet(true);
    for (let i = 0; i < 4; i++) {
      try { const res = await API().razorpayVerify(p.paymentId, resp); if (S.pay === p) paid(res.order); return; }
      catch (e) {
        if (S.pay !== p) return;
        if (e.status === 409) { p.step = 'expired'; p.error = e.message; renderSheet(true); return; }       // paid too late: it is refunded automatically
        if (e.status !== 502 && !e.offline) { p.step = 'failed'; p.error = e.message; renderSheet(true); return; }
        if (S.pay.step === 'success') return;
        await sleep(reduceMotion ? 300 : 2000);
        if (S.pay !== p || p.step === 'success') return;
      }
    }
    p.step = 'rzwait'; renderSheet(true);
  }

  /* ------------------------------------------------------------ rendering */
  function render() {
    if (!mounted) return;
    renderTop(); renderMenu(); renderCartbar(); watchReady();
  }
  function renderTop() {
    const ab = $('#acctBtn', root());
    if (ab) {
      const html = S.user ? `<span class="av">${esc((S.user.name || '?').trim()[0].toUpperCase())}</span>` : 'Sign in';
      if (ab.innerHTML !== html) ab.innerHTML = html;
      ab.classList.toggle('out', !S.user); ab.setAttribute('aria-label', S.user ? `Account of ${S.user.name}` : 'Sign in');
    }
    const chip = $('#tokChip', root()), o = activeOrder();
    chip.hidden = !o; $('.s-top', root()).classList.toggle('has-chip', !!o); if (!o) return;
    const label = o.status === 'pending_payment' ? `Pay ${rs(o.total)} · <span data-live="chip" data-id="${o.id}">${mmss(o.hold_left)}</span>` : `${o.token} · ${{ verifying: 'Confirming', new: 'Received', preparing: 'Cooking', ready: 'Ready!' }[o.status]}`;
    chip.className = 'tokchip' + (o.status === 'ready' ? ' is-ready' : ['pending_payment', 'verifying'].includes(o.status) ? ' is-pay' : '');
    const html = `<i></i>${label}`; if (chip.innerHTML !== html) chip.innerHTML = html;
  }
  function renderChips() {
    $('#chips', root()).innerHTML = ['All', 'Snacks', 'Meals', 'Drinks'].map(c => `<button type="button" class="chip" data-act="cat" data-cat="${c}" aria-pressed="${S.cat === c}">${c}</button>`).join('');
  }
  function renderMenu() {
    const t = clock.now(), w = nextWindow(t);
    $('#winChip', root()).innerHTML = !w ? '<i style="background:var(--red)"></i>Closed for today' : `<i></i>${esc(w.session.label)} · ${fmtS(w.start)} to ${fmt(w.end)}`;
    const msg = !S.accepting ? 'The kitchen has paused new orders for a moment. You can still look around.' : !S.payReady ? 'The canteen is still setting up payments. You can look around and order once they are ready.' : !w ? 'No breaks left today. Orders open again at 8:30 am.' : '';
    $('#banner', root()).innerHTML = msg ? `<p class="banner" role="status">${msg}</p>` : '';
    const nudge = S.user && !S.user.tt_set ? `<button type="button" class="nudge" data-act="edit-tt">${I.cal}<span><b>Add your timetable</b><small>Pickup slots will fit the breaks between your classes.</small></span>${I.arrow}</button>` : '';
    const nd = $('#ttNudge', root()); if (nd.innerHTML !== nudge) nd.innerHTML = nudge;
    const list = S.menu.filter(i => S.cat === 'All' || i.category === S.cat);
    const html = list.map(it => {
      const q = S.cart[it.id] || 0, out = !it.orderable, max = out || !w ? 0 : it.left;
      const tag = !it.available ? '<span class="tag out">Sold out</span>' : it.left <= 0 ? '<span class="tag out">Sold out</span>' : it.left <= 10 ? `<span class="tag">Only ${it.left} left</span>` : '';
      const blocked = !S.accepting || !S.payReady || q >= max;
      const ctl = q
        ? `<div class="stepper"><button type="button" data-act="dec" data-id="${it.id}" aria-label="Remove one ${esc(it.name)}">${I.minus}</button><output aria-live="polite">${q}</output><button type="button" data-act="add" data-id="${it.id}" aria-label="Add one ${esc(it.name)}" ${blocked ? 'disabled' : ''}>${I.plus}</button></div>`
        : `<button type="button" class="add" data-act="add" data-id="${it.id}" ${blocked ? 'disabled' : ''}>${out || !w ? 'Unavailable' : 'Add'}</button>`;
      return `<article class="item ${out ? 'is-out' : ''}"><div class="item-art" style="--tint:${it.tint}">${stk(it.art)}${tag}</div>
        <div class="item-body"><h3>${esc(it.name)}</h3><div class="item-meta"><span class="veg" role="img" aria-label="Vegetarian"></span><span class="price num">${rs(it.price)}</span><span>~${it.prep} min</span></div>${ctl}</div></article>`;
    }).join('');
    if (html !== last.grid) { $('#grid', root()).innerHTML = html; last.grid = html; }
  }
  function renderCartbar() {
    const bar = $('#cartbar', root()), items = cartItems();
    if (!items.length || S.sheet) { bar.hidden = true; return; }
    const was = bar.hidden; bar.hidden = false;
    if (was) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; }
    bar.innerHTML = `<button type="button" data-act="open-cart"><span class="cnt num">${qtyOf(items)}</span><span>View order</span><span class="go"><span class="tot num">${rs(totalOf(items))}</span>${I.arrow}</span></button>`;
  }
  function renderSheet(force) {
    if (!mounted) return;
    const wrap = $('#sheetWrap', root()), sheet = $('#sheet', root());
    if (S.sheet === 'cart' && !cartItems().length) S.sheet = null;
    if (S.sheet === 'token' && !myOrders().length) S.sheet = null;
    if (S.sheet === 'pay' && !S.pay) S.sheet = null;
    if (S.sheet === 'auth' && !S.auth) S.sheet = null;
    if (S.sheet === 'tt' && !S.tt) S.sheet = null;
    if (S.sheet === 'acct' && !S.user) S.sheet = null;
    if (!S.sheet) { wrap.hidden = true; last.sheet = ''; return; }
    const typing = document.activeElement && /^(INPUT|SELECT)$/.test(document.activeElement.tagName) && sheet.contains(document.activeElement);
    if (!force && typing) return;
    wrap.hidden = false;
    const html = { cart: sheetCart, pay: sheetPay, auth: sheetAuth, tt: sheetTimetable, acct: sheetAcct }[S.sheet]?.() ?? sheetToken();
    if (html === last.sheet) return;
    const focusId = typing ? document.activeElement.id || document.activeElement.dataset.f : null, caret = typing ? document.activeElement.selectionStart : null;
    const kind = `${S.sheet}:${S.pay ? S.pay.step : ''}:${S.sheet === 'token' ? S.viewing : S.sheet === 'tt' ? S.tt.day : S.sheet === 'auth' ? S.auth.mode : ''}`;
    const prevTop = kind === last.kind ? sheet.scrollTop : 0;
    sheet.innerHTML = html; last.sheet = html; last.kind = kind; sheet.scrollTop = prevTop;
    if (focusId) { const el = sheet.querySelector(`#${CSS.escape(focusId)}`) || sheet.querySelector(`[data-f="${focusId}"]`); if (el) { el.focus(); try { el.setSelectionRange(caret, caret); } catch (e) { /* not a text field */ } } }
  }

  function sheetCart() {
    const items = cartItems(), sug = S.sug, total = totalOf(items);
    const lines = items.map(i => { const it = item(i.id); if (!it) return '';
      return `<li class="line"><span class="th" style="--tint:${it.tint}">${stk(it.art)}</span><div><b>${esc(it.name)}</b><small class="num">${rs(it.price)} each</small></div>
        <div class="stepper"><button type="button" data-act="dec" data-id="${it.id}" aria-label="Remove one ${esc(it.name)}">${I.minus}</button><output>${i.qty}</output><button type="button" data-act="add" data-id="${it.id}" aria-label="Add one ${esc(it.name)}" ${i.qty >= it.left ? 'disabled' : ''}>${I.plus}</button></div></li>`; }).join('');
    let slotBlock;
    if (!sug) slotBlock = '<p class="empty">Finding the best slot for you…</p>';
    else if (sug.closed) slotBlock = sug.source === 'timetable'
      ? `<p class="empty">No breaks left in your timetable today.</p><button type="button" class="linkbtn" data-act="edit-tt">Change my timetable</button>`
      : '<p class="empty">No breaks left today. The canteen opens again at 8:30 am.</p>';
    else if (!sug.best) slotBlock = '<p class="empty">Every slot in this break is full for an order this size. Try fewer items.</p>';
    else slotBlock = `<div class="best"><span>Suggested for you</span><b class="num">${fmt(sug.best.start)}</b><span>${esc(sug.reason)}</span></div>
      <div class="slots" role="radiogroup" aria-label="Pickup slots">${sug.slots.map(x => `<button type="button" role="radio" aria-checked="${x.start === S.slot}" class="slot ${x.start === S.slot ? 'is-sel' : ''} ${x.full ? 'is-full' : ''}" data-act="pick-slot" data-s="${x.start}" ${x.full ? 'disabled' : ''}>
        ${x.start === sug.best.start ? '<span class="bst">Best</span>' : ''}<span class="num">${fmtS(x.start)}</span><span class="meter ${x.full ? 'full' : x.ratio >= .75 ? 'busy' : ''}" style="--r:${Math.max(.06, x.ratio).toFixed(2)}"><i></i></span><small>${x.full ? 'Full' : x.ratio < .4 ? 'Quiet' : x.ratio < .75 ? 'Filling' : 'Busy'}</small></button>`).join('')}</div>`;
    const can = S.accepting && S.payReady && S.slot != null && sug && !sug.closed;
    return `<div class="sheet-h"><h3>Your order</h3><button type="button" class="x" data-act="close-sheet" aria-label="Close">${I.x}</button></div>
      <ul class="lines">${lines}</ul>
      <div class="sum"><span>Total</span><span class="num">${rs(total)}</span></div>
      <div><h4 class="h4">Pickup slot</h4><p class="sub">${sug && !sug.closed ? `${sug.source === 'timetable' ? 'From your timetable' : 'Canteen break'} · ${esc(sug.session.label)}, ${fmt(sug.start)} to ${fmt(sug.end)} IST` : 'India time (IST)'}</p>
        ${sug && !sug.closed && sug.source === 'canteen' && S.user && !S.user.tt_set ? '<button type="button" class="linkbtn" data-act="edit-tt">Add my timetable so slots fit my breaks</button>' : ''}</div>
      ${slotBlock}
      ${S.accepting ? '' : '<p class="banner" role="status">The kitchen has paused new orders for a moment.</p>'}
      ${S.payReady ? '' : '<p class="banner" role="status">The canteen is still setting up payments. Please try again soon.</p>'}
      <button type="button" class="btn block" data-act="start-pay" ${can ? '' : 'disabled'}>Pay ${rs(total)} ${I.arrow}</button>
      <p class="note">${I.lock} You pay on the next screen. Your slot is held for ${Math.round((['upi', 'razorpay'].includes(cfg.gateway.kind) ? cfg.hold_seconds_upi : cfg.hold_seconds) / 60)} minutes.</p>`;
  }


  /* ------------------------------------------------------------ sign up / sign in */
  function openAuth(mode) {
    S.auth = { mode, error: '', busy: false, form: S.auth ? S.auth.form : { name: '', phone: '', pw: '' } };
    S.sheet = 'auth'; renderSheet(true); render();
  }
  function sheetAuth() {
    const a = S.auth, f = a.form, up = a.mode === 'signup';
    return `<div class="sheet-h"><h3>${up ? 'Create your account' : 'Welcome back'}</h3><button type="button" class="x" data-act="close-sheet" aria-label="Close">${I.x}</button></div>
      <div class="authtabs" role="group" aria-label="Sign up or sign in"><button type="button" data-act="auth-tab" data-m="signup" aria-pressed="${up}">Sign up</button><button type="button" data-act="auth-tab" data-m="login" aria-pressed="${!up}">Sign in</button></div>
      <p class="sub">${up ? 'One quick sign up. Your orders, e-tokens and timetable stay with your number.' : 'Sign in with your mobile number and password.'}</p>
      <div class="authform">
        ${up ? `<label class="field"><span>Your name</span><input id="aName" data-a="name" data-enter="do-auth" type="text" maxlength="24" autocomplete="name" placeholder="First name" value="${esc(f.name)}"></label>` : ''}
        <label class="field"><span>Mobile number</span><div class="phonein"><b>+91</b><input id="aPhone" data-a="phone" data-enter="do-auth" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="10" placeholder="98765 43210" value="${esc(f.phone)}"></div></label>
        <label class="field"><span>Password</span><input id="aPw" data-a="pw" data-enter="do-auth" type="password" autocomplete="${up ? 'new-password' : 'current-password'}" placeholder="At least 6 characters" value="${esc(f.pw)}"></label>
        ${a.error ? `<p class="payerr" role="alert">${esc(a.error)}</p>` : ''}
        <button type="button" class="btn block" data-act="do-auth" ${a.busy ? 'disabled' : ''}>${a.busy ? 'Please wait…' : up ? 'Sign up' : 'Sign in'} ${I.arrow}</button>
      </div>
      <p class="note">${I.lock} Your password is stored scrambled, never as typed.${up ? ' Next you add your timetable so pickup slots fit your day.' : ''}</p>`;
  }
  async function doAuth() {
    const a = S.auth; if (!a || a.busy) return; const f = a.form, up = a.mode === 'signup'; a.error = '';
    if (up && f.name.trim().length < 2) a.error = 'Enter your name.';
    else if (f.phone.length !== 10) a.error = 'Enter your 10 digit mobile number.';
    else if (f.pw.length < 6) a.error = 'Use a password with at least 6 characters.';
    if (a.error) { renderSheet(true); return; }
    a.busy = true; renderSheet(true);
    try {
      const r = up ? await API().signup(f.name.trim(), f.phone, f.pw) : await API().login(f.phone, f.pw);
      S.user = r.user; S.auth = null; S.sheet = null; renderSheet(true);
      await refresh().catch(() => {});
      if (up || !S.user.tt_set) { openTimetable(true); toast(up ? `Welcome, ${S.user.name}! Now add your timetable.` : `Welcome back, ${S.user.name}.`); }
      else toast(`Welcome back, ${S.user.name}.`);
    } catch (e) { a.busy = false; a.error = e.message; renderSheet(true); }
  }
  async function signOut() {
    try { await API().logout(); } catch (e) { /* already signed out */ }
    S.user = null; S.orders = {}; S.cart = {}; S.pay = null; S.slot = null; S.sug = null; S.auth = null; S.sheet = null; last.grid = '';
    render(); openAuth('login');
  }
  function sheetAcct() {
    const u = S.user, n = Object.values(u.timetable || {}).reduce((a, r) => a + r.length, 0);
    return `<div class="sheet-h"><h3>Your account</h3><button type="button" class="x" data-act="close-sheet" aria-label="Close">${I.x}</button></div>
      <div class="acctcard"><span class="av big">${esc(u.name.trim()[0].toUpperCase())}</span><div><b>${esc(u.name)}</b><small>+91 ${esc(u.phone)}</small></div></div>
      <button type="button" class="rowbtn" data-act="edit-tt">${I.cal}<span><b>My timetable</b><small>${u.tt_set ? `${n} break${n === 1 ? '' : 's'} a week` : 'Not added yet'}</small></span>${I.arrow}</button>
      <p class="note">${I.clock} All times are India time (IST). It is <b data-live="ist">${fmt(clock.now())}</b> now.</p>
      <button type="button" class="btn white block" data-act="signout">Sign out</button>`;
  }

  /* ------------------------------------------------------------ timetable: free time between classes, per weekday */
  function openTimetable(first) {
    const src = (S.user && S.user.timetable) || {}, data = {};
    for (let d = 0; d < 7; d++) data[d] = (src[String(d)] || []).map(w => w.slice());
    S.tt = { day: weekday(), data, error: '', saving: false, first: !!first };
    S.sheet = 'tt'; renderSheet(true); render();
  }
  function ttAdd(win) {
    const rows = S.tt.data[S.tt.day];
    if (rows.length >= 8) { toast('That is plenty. You can add up to 8 breaks a day.'); return; }
    if (!win) { const e = rows.length ? Math.min(rows[rows.length - 1][1] + 60, 1380) : 750; win = [e, e + 15]; }
    if (!rows.some(w => w[0] === win[0] && w[1] === win[1])) rows.push(win.slice());
    S.tt.error = ''; renderSheet(true);
  }
  function onTimeChange(el) {
    const t = S.tt; if (!t) return; const m = t2m(el.value), w = t.data[t.day][+el.dataset.i]; if (m == null || !w) return;
    w[el.dataset.tt === 's' ? 0 : 1] = m; t.error = ''; renderSheet(true);
  }
  async function saveTimetable() {
    const t = S.tt; if (!t || t.saving) return;
    const out = {};
    for (let d = 0; d < 7; d++) {
      for (const [a, b] of t.data[d]) if (b - a < 5) { t.day = d; t.error = `${DAYS_LONG[d]}: a break has to end at least 5 minutes after it starts.`; renderSheet(true); return; }
      out[String(d)] = t.data[d].map(w => w.slice()).sort((x, y) => x[0] - y[0]);
    }
    t.saving = true; t.error = ''; renderSheet(true);
    try {
      const r = await API().saveTimetable(out);
      S.user = r.user; S.tt = null; S.sheet = null; S.slot = null; last.grid = '';
      renderSheet(true); render(); if (cartItems().length) loadSlots();
      toast(S.user.tt_set ? 'Timetable saved. Pickup slots now follow your breaks.' : 'Timetable cleared. You will see the canteen break times.');
    } catch (e) { t.saving = false; t.error = e.message; renderSheet(true); }
  }
  function sheetTimetable() {
    const t = S.tt, rows = t.data[t.day], today = weekday();
    const tabs = DAYS.map((d, i) => `<button type="button" role="tab" class="dtab ${i === t.day ? 'is-sel' : ''} ${t.data[i].length ? 'has' : ''}" aria-selected="${i === t.day}" data-act="tt-day" data-d="${i}"><span>${d}</span>${i === today ? '<i class="tdy" title="Today"></i>' : ''}</button>`).join('');
    const list = rows.length ? rows.map((w, i) => `<li class="ttrow"><label><span class="sr">Break ${i + 1} starts</span><input type="time" step="300" data-tt="s" data-i="${i}" value="${m2t(w[0])}"></label><span class="to">to</span><label><span class="sr">Break ${i + 1} ends</span><input type="time" step="300" data-tt="e" data-i="${i}" value="${m2t(w[1])}"></label><button type="button" class="del" data-act="tt-del" data-i="${i}" aria-label="Remove break ${i + 1}">${I.trash}</button></li>`).join('')
      : `<li class="ttempty">No breaks on ${DAYS_LONG[t.day]} yet. Add the gaps between your classes, or use a quick add below.</li>`;
    const presets = [['Morning', 645, 660], ['Lunch', 750, 795], ['Evening', 915, 930]].map(([n, a, b]) => `<button type="button" class="chip" data-act="tt-preset" data-s="${a}" data-e="${b}">${I.plus}${n} ${fmtS(a)} to ${fmtS(b)}</button>`).join('');
    return `<div class="sheet-h"><h3>${t.first ? 'Add your timetable' : 'My timetable'}</h3><button type="button" class="x" data-act="close-sheet" aria-label="Close">${I.x}</button></div>
      <p class="sub">${t.first ? 'You are in! ' : ''}Add your free time between classes for each day (India time). We only suggest pickup slots inside these breaks.</p>
      <div class="dtabs" role="tablist" aria-label="Day of the week">${tabs}</div>
      <h4 class="h4">${DAYS_LONG[t.day]}${t.day === today ? ' · today' : ''}</h4>
      <ul class="ttlist">${list}</ul>
      <div class="ttact"><button type="button" class="btn white" data-act="tt-add">${I.plus}Add a break</button>${rows.length ? `<button type="button" class="linkbtn" data-act="tt-copy">Copy to Mon to Fri</button>` : ''}</div>
      <div class="chips ttpre" role="group" aria-label="Quick add">${presets}</div>
      ${t.error ? `<p class="payerr" role="alert">${esc(t.error)}</p>` : ''}
      <button type="button" class="btn block" data-act="tt-save" ${t.saving ? 'disabled' : ''}>${t.saving ? 'Saving…' : 'Save timetable'} ${I.arrow}</button>
      ${t.first ? '<button type="button" class="linkbtn center" data-act="close-sheet">Skip for now</button>' : ''}
      <p class="note">${I.cal} A day with no breaks uses the canteen's own break times. You can change this any time from your account.</p>`;
  }

  /* ------------------------------------------------------------ real UPI payment */
  function sheetUpi(p, o, summary, err) {
    const u = p.upi || o.upi;
    if (!u) return `${payHead(o, 'Payment')}<p class="empty">The payment details are not available. Close this and start the order again.</p>`;
    const apps = IOS
      ? `<div class="apps"><a class="btn block" href="${esc(u.gpay)}">Google Pay ${I.arrow}</a><a class="btn white block" href="${esc(u.phonepe)}">PhonePe ${I.arrow}</a><a class="btn white block" href="${esc(u.paytm)}">Paytm ${I.arrow}</a></div><p class="small">Another UPI app? Copy the UPI ID above, pay ${rs(o.total)}, then come back here.</p>`
      : `<a class="btn block" href="${esc(u.link)}">Open my UPI app · ${rs(o.total)} ${I.arrow}</a>`;
    const ok = (p.form.utr || '').length === 12;
    return `${payHead(o, `Pay ${rs(o.total)}`)}${summary}
      <div class="upibox"><div><small>Pay to</small><b>${esc(u.pn)}</b></div>
        <div class="vpa"><span class="mono">${esc(u.pa)}</span><button type="button" class="copy" data-act="copy" data-v="${esc(u.pa)}" aria-label="Copy UPI ID">${I.copy}<span>Copy</span></button></div>
        <div class="amt"><span><small>Amount</small><b class="num">${rs(o.total)}</b></span><span><small>Note</small><b>${esc(u.tn)}</b></span></div></div>
      <div class="ustep"><span class="n">1</span><div><b>Pay ${rs(o.total)} in your UPI app</b>${apps}
        <details class="qrd"><summary>Paying from another device? Show the QR</summary><div class="qrbox">${qrSvg(u.link, { label: 'UPI payment QR code' })}<small>Scan with any UPI app. The amount is filled in.</small></div></details></div></div>
      <div class="ustep"><span class="n">2</span><div><b>Enter the transaction ID</b><p class="small">After paying, open the payment in your app. Find the 12 digit UPI transaction ID (some apps call it UTR or UPI Ref No.).</p>
        <label class="field"><span class="sr">UPI transaction ID</span><input data-f="utr" data-enter="send-utr" id="utrIn" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="12 digit transaction ID" value="${esc(p.form.utr || '')}"></label></div></div>
      ${err}
      <button type="button" class="btn block" data-act="send-utr" ${ok ? '' : 'disabled'}>I have paid ${rs(o.total)}</button>
      <p class="note">${I.lock} The canteen checks the payment before cooking starts. Please pay exactly ${rs(o.total)}.</p>`;
  }
  function upiVerifying(p, o) {
    return `${payHead(o, 'Waiting for the canteen')}<div class="paystate"><div class="spin" aria-hidden="true"></div><h4>Checking your ${rs(o.total)} payment</h4>
      <p>The canteen confirms payments in their UPI app. Your e-token appears here the moment they do. It usually takes under a minute.</p>
      <p class="small">Transaction ID <span class="mono">${esc((o.payment && o.payment.ref) || p.form.utr || '')}</span></p>
      <button type="button" class="linkbtn" data-act="close-sheet">Close. It will update on the home screen.</button></div>`;
  }

  const UPI_APPS = ['Google Pay', 'PhonePe', 'Paytm'];
  const PM = [['upi', 'UPI ID', 'Pay with your UPI ID', I.phone], ['card', 'Debit or credit card', 'Visa, Mastercard, RuPay', I.card], ['netbanking', 'Netbanking', 'Pick your bank', I.bank]];
  function payHead(o, title) {
    return `<div class="sheet-h"><h3>${title}</h3><button type="button" class="x" data-act="close-sheet" aria-label="Close">${I.x}</button></div>`;
  }
  function sheetPay() {
    const p = S.pay, o = S.orders[p.orderId]; if (!o) return '<p class="empty">Order not found.</p>';
    const test = p.gateway === 'test', f = p.form;
    const summary = `<div class="paybar"><span>${qtyOf(o.items)} item${qtyOf(o.items) > 1 ? 's' : ''} · pickup ${fmt(o.slot)}</span><span class="hold" data-live="hold">Held ${mmss(holdLeft())}</span></div>`;
    const err = p.error ? `<p class="payerr" role="alert">${esc(p.error)}</p>` : '';
    if (p.step === 'processing') return `${payHead(o, 'Paying')}<div class="paystate"><div class="spin" aria-hidden="true"></div><h4>${p.via ? `Waiting for ${esc(p.via)}` : 'Confirming your payment'}</h4><p>Please do not close this screen.</p></div>`;
    if (p.step === 'success') return `${payHead(o, 'Paid')}<div class="paystate ok"><div class="tick" aria-hidden="true">${I.check}</div><h4>Payment successful</h4><p>${rs(o.total)} paid. Making your e-token…</p><button type="button" class="btn yellow" data-act="show-token">View my e-token</button></div>`;
    if (p.step === 'expired') return `${payHead(o, 'Time ran out')}<div class="paystate bad"><div class="tick" aria-hidden="true">${I.x}</div><h4>Your slot hold ended</h4><p>${esc(p.error || (p.gateway === 'upi' ? 'The slot was released before the canteen saw a payment.' : 'The order was not paid in time, so the slot was released. Nothing was charged.'))}</p>${p.gateway === 'upi' ? '<p class="small">If you already paid, tell the canteen staff. They can match it with your UPI transaction ID.</p>' : ''}<button type="button" class="btn" data-act="restart">Pick a slot again</button></div>`;
    if (p.gateway === 'upi') return p.step === 'verifying' ? upiVerifying(p, o) : sheetUpi(p, o, summary, err);
    if (p.step === 'rzwait') return `${payHead(o, 'Confirming your payment')}<div class="paystate"><div class="spin" aria-hidden="true"></div><h4>Razorpay has your ${rs(o.total)}</h4><p>We are still confirming it with Razorpay. You do not need to pay again. Your e-token appears here by itself, even if you close the app.</p><button type="button" class="btn" data-act="rz-check">Check again</button><button type="button" class="linkbtn" data-act="close-sheet">Close. It will update on the home screen.</button></div>`;
    if (p.step === 'failed') return `${payHead(o, 'Payment failed')}<div class="paystate bad"><div class="tick" aria-hidden="true">${I.x}</div><h4>That did not go through</h4><p>${esc(p.error)}</p><p class="small">${p.gateway === 'razorpay' ? 'If any money left your account, your bank sends it back by itself, usually within a few days.' : 'Nothing was charged.'} Your slot is held for ${mmss(holdLeft())} more.</p><button type="button" class="btn" data-act="${p.gateway === 'razorpay' ? 'rz-open' : 'pay-back'}">Try again</button></div>`;
    // method chooser
    if (p.gateway === 'razorpay') {
      const rzTest = cfg.gateway.test ? `<p class="testnote">${I.alert}<span><b>Razorpay test mode.</b> No real money moves. In the payment window use UPI ID <b>success@razorpay</b>, or card <b>4111 1111 1111 1111</b> with any future expiry and any CVV.</span></p>` : '';
      return `${payHead(o, `Pay ${rs(o.total)}`)}${summary}${rzTest}<div class="paystate"><div class="pm-row" aria-hidden="true">${I.phone}${I.card}${I.bank}</div><h4>Pay ${rs(o.total)} securely</h4><p>The payment window opens on top of this screen. Pay with any UPI app, a card or netbanking.</p></div>${err}<button type="button" class="btn block" data-act="rz-open">Pay ${rs(o.total)} ${I.arrow}</button><p class="note">${I.lock} Payments are handled by Razorpay. We never see your card or UPI PIN.</p>`;
    }
    const forms = {
      upi: `<label class="field"><span>UPI ID</span><input data-f="vpa" data-enter="do-pay" id="vpaIn" autocapitalize="none" autocomplete="off" spellcheck="false" placeholder="name@bank" value="${esc(f.vpa)}"></label>`,
      card: `<label class="field"><span>Card number</span><input data-f="card" id="cardIn" inputmode="numeric" autocomplete="off" placeholder="1234 5678 9012 3456" value="${esc(f.card)}"></label>
        <div class="two"><label class="field"><span>Expiry</span><input data-f="exp" inputmode="numeric" autocomplete="off" placeholder="MM/YY" value="${esc(f.exp)}"></label>
        <label class="field"><span>CVV</span><input data-f="cvv" inputmode="numeric" autocomplete="off" type="password" placeholder="•••" value="${esc(f.cvv)}"></label></div>
        <label class="field"><span>Name on card</span><input data-f="cname" autocomplete="off" placeholder="As printed on the card" value="${esc(f.cname)}"></label>`,
      netbanking: `<label class="field"><span>Your bank</span><select data-f="bank"><option value="">Choose a bank</option>${cfg.banks.map(b => `<option ${f.bank === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label>`,
    };
    const apps = test ? `<div class="upiapps" role="group" aria-label="Pay with a UPI app"><h4>Pay with a UPI app</h4><div>${UPI_APPS.map(a => `<button type="button" data-act="app-pay" data-app="${a}">${I.phone}<b>${a}</b></button>`).join('')}</div><p>or pay another way</p></div>` : '';
    return `${payHead(o, `Pay ${rs(o.total)}`)}${summary}${apps}
      <div class="pms" role="radiogroup" aria-label="Payment method">${PM.map(([k, t, d, ic]) => `
        <div class="pm ${p.method === k ? 'is-sel' : ''}"><button type="button" role="radio" aria-checked="${p.method === k}" data-act="pm" data-m="${k}"><span class="pm-ic">${ic}</span><span class="pm-t"><b>${t}</b><small>${d}</small></span><span class="pm-dot" aria-hidden="true"></span></button>
        ${p.method === k ? `<div class="pm-form">${forms[k]}</div>` : ''}</div>`).join('')}</div>
      ${err}
      ${p.method ? `<button type="button" class="btn block" data-act="do-pay">Pay ${rs(o.total)}</button>` : ''}
      <p class="note">${I.lock} Card details are checked and never stored.</p>`;
  }

  function sheetToken() {
    const mine = myOrders(), o = mine.find(x => x.id === S.viewing) || mine[0]; if (!o) return '';
    if (o.status === 'verifying') return `<div class="sheet-h"><h3>Almost there</h3><button type="button" class="x" data-act="close-sheet" aria-label="Close">${I.x}</button></div><div class="paystate"><div class="spin" aria-hidden="true"></div><h4>${o.token} is being confirmed</h4><p>The canteen is checking your ${rs(o.total)} payment. Your e-token appears here the moment they confirm it.</p><button type="button" class="btn" data-act="open-chip">See payment status</button></div>`;
    if (o.status === 'pending_payment') return `<div class="sheet-h"><h3>Almost there</h3><button type="button" class="x" data-act="close-sheet" aria-label="Close">${I.x}</button></div><div class="paystate"><h4>${o.token} is waiting for payment</h4><p>Your e-token appears as soon as you pay.</p><button type="button" class="btn" data-act="open-chip">Finish paying</button></div>`;
    const steps = ['Received', 'Cooking', 'Ready', 'Picked up'], cur = { new: 0, preparing: 1, ready: 2, picked_up: 4 }[o.status];
    const say = { new: 'Paid and received. The kitchen starts cooking just before your slot.', preparing: 'Your order is being cooked right now.', ready: 'Ready! Show this e-token at the counter.', picked_up: 'Picked up. Enjoy your food.', cancelled: o.payment && o.payment.status === 'refund_due' ? `Cancelled. The canteen will send ${rs(o.total)} back to you by UPI.` : o.payment && o.payment.status === 'refunded' ? `Cancelled. Refund of ${rs(o.total)} sent.` : 'This order was cancelled.', expired: 'This order was not paid in time.' }[o.status];
    const first = S.stamped[o.id] !== o.status; S.stamped[o.id] = o.status;
    const dead = ['cancelled', 'expired'].includes(o.status), pay = o.payment;
    const others = mine.filter(x => x.id !== o.id);
    return `<div class="sheet-h"><h3>Your e-token</h3><button type="button" class="x" data-act="close-sheet" aria-label="Close">${I.x}</button></div>
      <article class="etk ${o.status}${dead ? ' dead' : ''}">
        <header class="etk-top"><span class="etk-brand"><svg viewBox="0 0 100 100" aria-hidden="true"><use href="#s-samosa"/></svg>Smart Canteen</span><span class="etk-badge ${dead ? 'bad' : 'paid'}">${dead ? STATUS_TXT[o.status].toUpperCase() : 'PAID'}</span></header>
        <div class="etk-main">
          <div class="etk-qr">${qrSvg(o.qr, { label: `QR code for token ${o.token}` })}</div>
          <div class="etk-id"><small>E-token</small><b class="etk-no">${o.token}</b><div class="etk-pin"><small>Pickup PIN</small><b class="num">${esc(o.pin)}</b></div></div>
        </div>
        <div class="etk-meta"><div><small>Pickup</small><b class="num">${fmt(o.slot)}</b><span data-live="due" data-id="${o.id}">${dueText(o)}</span></div><div><small>Ordered</small><b class="num">${fmt(o.paid_at ?? o.placed)}</b></div><div><small>Name</small><b>${esc(o.name)}</b></div></div>
        <ul class="etk-items">${o.items.map(i => `<li><b class="num">${i.qty}×</b><span>${esc(i.name)}</span><span class="num">${rs(i.qty * i.price)}</span></li>`).join('')}</ul>
        <div class="etk-cut" aria-hidden="true"></div>
        <div class="etk-pay"><div><small>${pay && pay.status === 'refunded' ? 'Refunded' : pay && pay.status === 'refund_due' ? 'Refund due' : 'Paid'}</small><b class="num">${rs(o.total)}</b></div><div><small>Method</small><b>${esc(pay?.label || '')}</b></div><div class="wide"><small>Payment ref</small><b class="mono">${esc(pay?.ref || '')}</b></div></div>
        ${dead ? '' : `<ol class="track">${steps.map((s, i) => `<li class="${i < cur ? 'done' : i === cur ? 'now' : ''}">${s}</li>`).join('')}</ol>`}
        <p class="say ${o.status === 'ready' ? 'ready' : ''}" role="status"><span>${say}</span>${o.status === 'ready' ? `<span class="stamp ${first ? 'slam' : ''}">READY!</span>` : ''}</p>
      </article>
      ${o.status === 'new' ? `<button type="button" class="btn white block" data-act="cancel" data-id="${o.id}">Cancel and get a refund</button>` : ''}
      ${others.length ? `<div class="past"><h4 class="h4">Earlier today</h4>${others.map(x => `<button type="button" data-act="view" data-id="${x.id}"><span>${x.token} · ${x.items.map(i => `${i.qty} ${esc(i.name)}`).join(', ')}</span><span class="pill ${x.status === 'ready' ? 'green' : ['new', 'preparing'].includes(x.status) ? 'blue' : ''}">${STATUS_TXT[x.status]}</span></button>`).join('')}</div>` : ''}
      <button type="button" class="btn yellow block" data-act="close-sheet">Back to menu</button>`;
  }

  function watchReady() {
    myOrders().forEach(o => {
      const prev = S.seen[o.id];
      if (prev === 'verifying' && o.status === 'new') toast(`Payment confirmed. ${o.token} is in the kitchen queue.`);
      if (prev && prev !== o.status && o.status === 'ready') {
        toast(`${o.token} is ready. Show your e-token at the counter.`); confetti(root());
        try { navigator.vibrate && navigator.vibrate([120, 60, 120]); } catch (e) { /* not supported */ }
      }
      S.seen[o.id] = o.status;
    });
    if (S.sheet === 'token') renderSheet(true);
  }

  /* ------------------------------------------------------------ once a second: texts that depend on the clock */
  function tick() {
    if (!mounted) return;
    const t = clock.now(), el = root();
    $$('[data-live]', el).forEach(n => {
      const k = n.dataset.live;
      if (k === 'ist') n.textContent = fmt(t);
      else if (k === 'breakin') n.textContent = breakText();
      else if (k === 'hold') { const s = holdLeft(); n.textContent = `Held ${mmss(s)}`; if (s === 0 && S.pay && ['method', 'failed'].includes(S.pay.step)) { S.pay.step = 'expired'; renderSheet(true); } }
      else if (k === 'chip') { const o = S.orders[n.dataset.id]; if (o) n.textContent = mmss(Math.max(0, o.hold_left - Math.floor((performance.now() - (o._at || 0)) / 1000))); }
      else if (k === 'due') { const o = S.orders[n.dataset.id]; if (o) n.textContent = dueText(o, t); }
    });
    const m = Math.floor(t);
    if (m !== lastMin) { lastMin = m; renderMenu(); }
  }
  window.Student = { mount, unmount, render, breakText, dueText, S };
})();
