/* Kitchen dashboard: Payments, History, Menu, Demand Forecast, Inventory and Settings pages. */
(function () {
  'use strict';
  const { $, esc, fmt, rs, I, stk, clock, theme, store } = CC;
  const API = () => window.CanteenAPI;
  const KT = window.Kitchen, K = KT.K;
  const hourLabel = h => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
  const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);


  /* ============================================================ Payments: confirm UPI payments, send refunds */
  const asked = new Set();
  const phoneTxt = o => (o.phone ? `+91 ${esc(o.phone)}` : 'no phone saved');
  function payRow(o) {
    const sure = K.confirm === `no:${o.id}`, p = o.payment || {};
    return `<li class="k-payrow"><div class="who"><b>${o.token} · ${esc(o.name)}</b><span>${phoneTxt(o)} · pickup ${fmt(o.slot)}</span></div>
      <div class="amt"><b>${rs(o.total)}</b><span>${KT.itemsText(o)}</span></div>
      <div class="utr"><small>Student's transaction ID</small><b class="mono">${esc(p.ref || '')}</b><small>Payment note should read: Canteen ${o.token}</small></div>
      <div class="act"><button type="button" class="k-btn pick" data-act="pay-ok" data-id="${o.id}">Payment received</button>
      <button type="button" class="k-btn danger ${sure ? 'sure' : ''}" data-act="pay-no" data-id="${o.id}">${sure ? 'Tap again: not received' : 'Not received'}</button></div></li>`;
  }
  function refundRow(o) {
    const p = o.payment || {}, rz = p.gateway === 'razorpay';
    const how = rz
      ? `<small>Razorpay could not send this refund by itself</small><b>Refund ${rs(o.total)} in the Razorpay dashboard</b><small>Payments, find <span class="mono">${esc(p.ref || '')}</span>, then Refund. Then tap Mark refunded.</small>`
      : `<small>How to refund</small><b>Send ${rs(o.total)} to ${o.phone ? `+91 ${esc(o.phone)}` : 'the student'} on UPI</b><small>Use the number they signed up with, or ask for their UPI ID.</small>`;
    return `<li class="k-payrow"><div class="who"><b>${o.token} · ${esc(o.name)}</b><span>${phoneTxt(o)}</span></div>
      <div class="amt"><b>${rs(o.total)}</b><span>${esc(o.cancel_reason || 'Cancelled')}</span></div>
      <div class="utr">${how}</div>
      <div class="act"><button type="button" class="k-btn pick" data-act="refund-done" data-id="${o.id}">Mark refunded</button></div></li>`;
  }
  KT.register('payments', {
    title: 'Payments', sub: 'Money received, UPI confirmations and refunds',
    html() {
      const s = K.snap; if (!s) return '<div class="k-empty"><b>Loading…</b></div>';
      const v = s.verifying || [], r = s.refunds || [], kind = K.cfg.gateway.kind, upi = kind === 'upi', rz = kind === 'razorpay', ready = !s.pay || s.pay.ready;
      const rzTest = !!(s.pay && s.pay.test);
      if (rz) return `<div class="k-payg">
        <section class="k-card k-collect"><div><span>Received today</span><b>${rs(s.collected || 0)}</b></div><div><span>Mode</span><b>${rzTest ? 'Test' : 'Live'}</b></div><div><span>Refunds to send</span><b>${r.length}</b></div></section>
        <section class="k-card"><div class="k-card-h"><h2>Online payments are automatic</h2><p>Students pay inside the app with UPI, card or netbanking. Each payment is checked with Razorpay and the order reaches your cooking queue by itself. Refunds for cancelled orders go back to the student automatically. There is nothing to confirm here.${rzTest ? ' <b>Test mode: no real money moves.</b>' : ''}${s.pay && s.pay.webhook ? '' : ' <b>Webhook not set up:</b> if a student closes the app right after paying, their order is only confirmed when they open the app again. See the README, "Webhook".'}</p></div></section>
        <section class="k-card"><div class="k-card-h"><h2>Refunds to send</h2><p>Only appears if Razorpay could not send a refund by itself.</p></div>
          ${r.length ? `<ul class="k-payl">${r.map(refundRow).join('')}</ul>` : `<div class="k-empty"><b>No refunds waiting</b><span>You are all square.</span></div>`}</section></div>`;
      return `<div class="k-payg">
        ${upi && !ready ? `<button type="button" class="k-alertbar" data-act="p-setup">${I.cash}<span><b>Add your UPI ID to start taking payments</b><small>Students cannot place orders until you do. Tap to open Settings.</small></span>${I.arrow}</button>` : ''}
        <section class="k-card k-collect"><div><span>Received today</span><b>${rs(s.collected || 0)}</b></div><div><span>To confirm</span><b>${v.length}</b></div><div><span>Refunds to send</span><b>${r.length}</b></div></section>
        <section class="k-card"><div class="k-card-h"><h2>Confirm payments</h2><p>${upi ? 'A student has paid and sent the transaction ID. Open your UPI app, find that payment (same amount and ID), then tap Payment received. The order goes to the kitchen only after you confirm.' : 'This page is for real UPI payments. This canteen is using the built-in demo gateway, so payments confirm themselves.'}</p></div>
          ${v.length ? `<ul class="k-payl">${v.map(payRow).join('')}</ul>` : `<div class="k-empty"><b>Nothing to confirm</b><span>${upi ? 'When a student pays and sends the transaction ID, it shows up here with a beep.' : 'Nothing waiting.'}</span></div>`}</section>
        <section class="k-card"><div class="k-card-h"><h2>Refunds to send</h2><p>When an order you accepted is cancelled, send the money back from your UPI app, then tap Mark refunded.</p></div>
          ${r.length ? `<ul class="k-payl">${r.map(refundRow).join('')}</ul>` : `<div class="k-empty"><b>No refunds waiting</b><span>You are all square.</span></div>`}</section></div>`;
    },
    async click(act, b) {
      const id = b.dataset.id;
      try {
        if (act === 'p-setup') { KT.go('settings'); return true; }
        if (act === 'pay-ok') { const r = await API().kPaymentReceived(id); KT.toast(`Confirmed. ${r.order.token} goes to the cooking queue.`); }
        else if (act === 'pay-no') {
          if (K.confirm !== `no:${id}`) { K.confirm = `no:${id}`; KT.renderPage(true); setTimeout(() => { if (K.confirm === `no:${id}`) { K.confirm = null; KT.renderPage(true); } }, 4000); return true; }
          K.confirm = null; const r = await API().kPaymentMissing(id); KT.toast(`${r.order.token}: the student can check the ID and try again.`);
        }
        else if (act === 'refund-done') { const r = await API().kRefunded(id); KT.toast(`${r.order.token} marked as refunded.`); }
        else return false;
      } catch (e) { K.confirm = null; KT.toast(e.message); }
      await KT.loadSnap(); KT.renderPage(true); return true;
    },
  });

  /* ============================================================ History */
  const H = { q: '', status: '', data: null, rows: [], offset: 0, busy: false, timer: 0 };
  function hrow(o) {
    const p = o.payment, done = o.status === 'picked_up';
    return `<li class="k-hrow"><span class="k-tok"><b>${o.token}</b><span>${esc(o.name)}${o.section ? ` · ${esc(o.section)}` : ''}</span></span><span class="k-its">${KT.itemsText(o)}</span>
      <div class="meta"><span><b>${rs(o.total)}</b>${p ? ` · ${esc(p.label)}` : ''}</span><span>${done ? `Picked up ${fmt(o.picked_at)}` : `Cancelled ${o.cancelled_at != null ? fmt(o.cancelled_at) : ''}${p && p.status === 'refunded' ? ' · refunded' : p && p.status === 'refund_due' ? ' · refund due' : ''}`}</span></div>
      <span class="k-st">${KT.pill(o.status)}</span></li>`;
  }
  const histList = () => H.rows.length ? `<ul>${H.rows.map(hrow).join('')}</ul>${H.data && H.rows.length < H.data.total ? `<div class="k-more"><button type="button" class="k-btn ghost" data-act="h-more">Show more (${H.data.total - H.rows.length} left)</button></div>` : ''}`
    : `<div class="k-empty"><b>${H.data ? 'No orders match' : 'Loading…'}</b><span>${H.data ? 'Finished and cancelled orders from today appear here.' : ''}</span></div>`;
  async function histLoad(more) {
    if (H.busy) return; H.busy = true;
    try {
      const off = more ? H.rows.length : 0;
      const r = await API().kHistory({ q: H.q, status: H.status, limit: 40, offset: off });
      H.data = r; H.rows = more ? H.rows.concat(r.orders) : r.orders;
      const list = $('#hList', document.getElementById('kitchenRoot'));
      if (list) list.innerHTML = histList(); else KT.render();
      const st = $('#hStats', document.getElementById('kitchenRoot')); if (st) st.innerHTML = histStats();
    } catch (e) { if (e.status === 401) KT.loadSnap(); else KT.toast(e.message); }
    H.busy = false;
  }
  const histStats = () => { const s = H.data ? H.data.stats : { served: 0, revenue: 0, refunds: 0, refunded: 0 };
    return `<div><b>${s.served}</b><span>Orders served</span></div><div><b>${rs(s.revenue)}</b><span>Sales today</span></div><div><b>${s.refunds}</b><span>Refunds${s.refunded ? ` · ${rs(s.refunded)}` : ''}</span></div>`; };
  KT.register('history', {
    title: 'Order History', sub: "Today's finished and cancelled orders",
    load: () => histLoad(false),
    html: () => `<div class="k-hist"><div class="k-mini" id="hStats">${histStats()}</div>
      <section class="k-card" style="container-type:inline-size"><div class="k-hq"><label class="k-field"><span class="sr">Search</span><input class="k-input" type="search" placeholder="Search token or name" value="${esc(H.q)}" data-hq></label>
        <label class="k-field"><span class="sr">Status</span><select class="k-input" data-hs><option value="" ${H.status === '' ? 'selected' : ''}>All</option><option value="picked_up" ${H.status === 'picked_up' ? 'selected' : ''}>Picked up</option><option value="cancelled" ${H.status === 'cancelled' ? 'selected' : ''}>Cancelled</option></select></label></div>
        <div id="hList">${histList()}</div></section></div>`,
    input(el) { if (el.dataset.hq !== undefined) { clearTimeout(H.timer); H.timer = setTimeout(() => { H.q = el.value.trim(); histLoad(false); }, 250); return true; } return false; },
    change(el) { if (el.dataset.hs !== undefined) { H.status = el.value; histLoad(false); return true; } return false; },
    click(act) { if (act === 'h-more') { histLoad(true); return true; } return false; },
  });

  /* ============================================================ Menu management */
  async function patchMenu(id, patch, msg) {
    try { await API().kMenu(id, patch); KT.toast(msg || 'Saved'); } catch (e) { KT.toast(e.message); }
    await KT.loadSnap();
  }
  KT.register('menu', {
    title: 'Menu Management', sub: 'Price, prep time and availability. Changes reach students at once',
    html() {
      if (!K.menu.length) return '<div class="k-empty"><b>Loading menu…</b></div>';
      return `<div class="k-mgrid">${K.menu.map(m => `<article class="k-card k-mcard ${m.available ? '' : 'off'}"><div class="k-mh"><span class="k-thumb" style="--tint:${m.tint}">${stk(m.art)}</span>
        <div><h3>${esc(m.name)}</h3><span class="k-sub">${esc(m.category)}</span></div>
        <button type="button" class="k-switch tap" role="switch" aria-checked="${m.available}" aria-label="${esc(m.name)} available to students" data-act="avail" data-id="${m.id}"></button></div>
        <div class="k-mf"><label class="k-field"><span>Price (₹)</span><input type="number" inputmode="numeric" min="1" max="999" value="${m.price}" data-mf="price" data-id="${m.id}"></label>
          <label class="k-field"><span>Prep time (min)</span><input type="number" inputmode="numeric" min="1" max="30" value="${m.prep}" data-mf="prep" data-id="${m.id}"></label></div>
        <p class="k-mstat"><span>Sold <b>${m.sold}</b></span><span>Left <b>${m.left}</b> of <b>${m.stock}</b></span>
          ${!m.available ? '<span class="k-pill picked_up">Hidden from students</span>' : m.left <= 0 ? '<span class="k-pill late">Sold out</span>' : m.left <= 10 ? '<span class="k-pill new">Running low</span>' : ''}</p></article>`).join('')}</div>`;
    },
    click(act, b) { if (act === 'avail') { const m = K.menuMap[b.dataset.id]; patchMenu(m.id, { available: !m.available }, `${m.name} is now ${m.available ? 'hidden' : 'available'}`); return true; } return false; },
    change(el) {
      if (!el.dataset.mf) return false;
      const v = parseInt(el.value, 10), m = K.menuMap[el.dataset.id], f = el.dataset.mf, lim = f === 'price' ? [1, 999] : [1, 30];
      if (!Number.isInteger(v) || v < lim[0] || v > lim[1]) { KT.toast(`${f === 'price' ? 'Price' : 'Prep time'} must be a whole number from ${lim[0]} to ${lim[1]}.`); KT.renderPage(true); return true; }
      if (v !== m[f]) patchMenu(m.id, { [f]: v }, `${m.name}: ${f === 'price' ? 'price' : 'prep time'} saved`);
      return true;
    },
  });

  /* ============================================================ Inventory */
  const Inv = { items: null };
  async function invLoad() { try { Inv.items = (await API().kInventory()).items; KT.render(); } catch (e) { if (e.status !== 401) KT.toast(e.message); } }
  KT.register('inventory', {
    title: 'Inventory', sub: "Today's cooking plan against what has been sold",
    load: invLoad,
    html() {
      if (!Inv.items) return '<div class="k-empty"><b>Loading…</b></div>';
      return `<section class="k-card" style="container-type:inline-size"><div class="k-itools"><p class="k-sub">The forecast suggests how many of each item to cook today, with a 12% safety buffer. You can adjust any number.</p>
        <button type="button" class="k-btn" data-act="inv-all">Use forecast for everything</button></div>
        <div class="k-inv">${Inv.items.map(m => { const pct = m.stock ? Math.min(100, Math.round(100 * m.sold / m.stock)) : 100, cls = m.left <= 0 ? 'out' : m.left <= Math.max(3, m.stock * .15) ? 'low' : '';
          return `<div class="k-irow"><div class="it"><span class="k-thumb" style="--tint:${m.tint}">${stk(m.art)}</span><div><b>${esc(m.name)}</b><span class="k-sub">${esc(m.category)}</span></div></div>
            <div class="st">${!m.available ? '<span class="k-pill picked_up">Hidden</span>' : m.left <= 0 ? '<span class="k-pill late">Sold out</span>' : cls ? '<span class="k-pill new">Low</span>' : '<span class="k-pill ready">OK</span>'}</div>
            <div class="bar"><div class="k-bar ${cls}" role="img" aria-label="${m.sold} of ${m.stock} sold"><i style="width:${pct}%"></i></div></div>
            <div class="nums"><div><small>Planned</small><b>${m.stock}</b></div><div><small>Sold</small><b>${m.sold}</b></div><div><small>Left</small><b>${m.left}</b></div><div><small>Forecast</small><b>${m.forecast_day}</b></div></div>
            <div class="act"><div class="k-step"><button type="button" data-act="inv-step" data-id="${m.id}" data-d="-5" aria-label="Plan 5 fewer ${esc(m.name)}" ${m.stock - 5 < m.sold ? 'disabled' : ''}>${I.minus}</button><output aria-label="Planned">${m.stock}</output><button type="button" data-act="inv-step" data-id="${m.id}" data-d="5" aria-label="Plan 5 more ${esc(m.name)}">${I.plus}</button></div>
              <button type="button" class="k-btn ghost" data-act="inv-use" data-id="${m.id}" ${m.stock === m.suggested ? 'disabled' : ''}>Use ${m.suggested}</button></div></div>`; }).join('')}</div></section>`;
    },
    async click(act, b) {
      try {
        if (act === 'inv-all') { Inv.items = (await API().kApplyForecast(null)).items; KT.toast('Plan updated from the forecast'); }
        else if (act === 'inv-use') { Inv.items = (await API().kApplyForecast([b.dataset.id])).items; KT.toast('Plan updated'); }
        else if (act === 'inv-step') { const m = Inv.items.find(x => x.id === b.dataset.id); await API().kMenu(m.id, { stock: Math.max(m.sold, Math.min(999, m.stock + num(b.dataset.d))) }); await invLoad(); }
        else return false;
      } catch (e) { KT.toast(e.message); }
      KT.loadSnap(); KT.render(); return true;
    },
  });

  /* ============================================================ Demand forecast */
  const F = { d: null, ro: null, hourSeen: -1 };
  async function fcLoad() { try { F.d = await API().kForecast(); F.hourSeen = F.d.now_hour; KT.render(); } catch (e) { if (e.status !== 401) KT.toast(e.message); } }
  function scaleOf(maxV) { const raw = Math.max(maxV, 4) / 4, p = 10 ** Math.floor(Math.log10(raw)), n = raw / p, step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; return { step, top: step * Math.ceil(Math.max(maxV, 1) / step) }; }
  function barPath(x, y, w, h) { if (h <= 0) return ''; const r = Math.min(4, w / 2, h); return `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`; }
  function chartSvg(w, hours, nowH) {
    const H2 = 250, m = { l: 34, r: 6, t: 14, b: 26 }, pw = w - m.l - m.r, ph = H2 - m.t - m.b;
    const sc = scaleOf(Math.max(1, ...hours.map(h => Math.max(h.actual, h.predicted)))), y = v => m.t + ph - (v / sc.top) * ph;
    const slot = pw / hours.length, bw = Math.min(24, Math.max(5, (slot - 10) / 2 - 1)), compact = slot < 44;
    let g = '';
    for (let v = 0; v <= sc.top + 1e-9; v += sc.step) g += `<line class="${v === 0 ? 'axis' : 'grid'}" x1="${m.l}" x2="${w - m.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    const peak = hours.reduce((a, h, i) => (h.predicted > hours[a].predicted ? i : a), 0);
    hours.forEach((h, i) => {
      const cx = m.l + slot * (i + .5), xa = cx - 1 - bw, xp = cx + 1, ya = y(h.actual), yp = y(h.predicted), isNow = h.hour === nowH;
      const lab = compact ? h.label.replace(' AM', 'a').replace(' PM', 'p') : h.label;
      g += `${isNow ? `<rect class="band" x="${m.l + slot * i}" y="${m.t}" width="${slot}" height="${ph}" rx="6"/>` : ''}
        <path class="bA" d="${barPath(xa, ya, bw, y(0) - ya)}"/><path class="bP" d="${barPath(xp, yp, bw, y(0) - yp)}"/>
        ${i === peak && h.predicted > 0 ? `<text class="val" x="${xp + bw / 2}" y="${yp - 5}" text-anchor="middle">${h.predicted}</text>` : ''}
        <text class="${isNow ? 'now-t' : ''}" x="${cx}" y="${H2 - 8}" text-anchor="middle">${lab}</text>
        <rect class="hit" data-i="${i}" x="${m.l + slot * i}" y="${m.t}" width="${slot}" height="${ph + 20}" tabindex="0" role="img" aria-label="${esc(h.label)}: ${h.actual} booked, ${h.predicted} predicted"/>`;
    });
    return `<svg width="${w}" height="${H2}" viewBox="0 0 ${w} ${H2}" role="group" aria-label="Items per hour, booked and predicted">${g}</svg>`;
  }
  function drawChart(host, d) {
    const draw = () => {
      const w = Math.max(260, Math.floor(host.clientWidth)); host.innerHTML = chartSvg(w, d.hours, d.now_hour);
      const tip = host.parentElement.querySelector('.k-tip');
      const show = el => {
        const h = d.hours[+el.dataset.i], r = el.getBoundingClientRect(), pr = host.parentElement.getBoundingClientRect();
        tip.innerHTML = `<b>${esc(h.label)}${h.hour === d.now_hour ? ' (now)' : ''}</b><div><span><i style="background:var(--c-actual)"></i>Booked</span><strong>${h.actual}</strong></div><div><span><i style="background:var(--c-pred)"></i>Predicted</span><strong>${h.predicted}</strong></div>`;
        tip.hidden = false; const tw = tip.offsetWidth; tip.style.left = `${Math.max(4, Math.min(pr.width - tw - 4, r.left - pr.left + r.width / 2 - tw / 2))}px`; tip.style.top = '4px';
      };
      host.onpointermove = e => { const el = e.target.closest('.hit'); if (el) show(el); else tip.hidden = true; };
      host.onpointerleave = () => { tip.hidden = true; };
      host.onfocusin = e => { const el = e.target.closest('.hit'); if (el) show(el); };
      host.onfocusout = () => { tip.hidden = true; };
    };
    draw(); if (F.ro) F.ro.disconnect();
    if (window.ResizeObserver) { let lw = host.clientWidth; F.ro = new ResizeObserver(() => { if (Math.abs(host.clientWidth - lw) > 1) { lw = host.clientWidth; draw(); } }); F.ro.observe(host); }
  }
  function donut(l) {
    const C = 2 * Math.PI * 54, pc = Math.max(0, Math.min(100, l.percent)), cls = pc >= 90 ? 'full' : pc >= 70 ? 'busy' : '';
    return `<div class="k-donut ${cls}"><svg viewBox="0 0 140 140" role="img" aria-label="${pc} percent of kitchen capacity booked for the next ${l.minutes} minutes"><circle class="tr" cx="70" cy="70" r="54" fill="none" stroke-width="14"/>
      <circle class="fg" cx="70" cy="70" r="54" fill="none" stroke-width="14" stroke-linecap="round" stroke-dasharray="${(pc / 100 * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 70 70)"/>
      <text class="pc" x="70" y="76">${pc}%</text><text class="pl" x="70" y="94">booked</text></svg>
      <p class="k-sub" style="text-align:center"><b style="color:var(--k-text)">${l.booked} / ${l.capacity} items</b> booked for the next ${l.minutes} min<br>${pc >= 90 ? 'At the limit. New slots will fill up.' : pc >= 70 ? 'Getting busy.' : 'Comfortable.'}</p></div>`;
  }
  KT.register('forecast', {
    title: 'Demand Forecast', sub: 'Predicted demand for the coming hours, learned from past orders',
    load: fcLoad, minute(m) { if (F.d && Math.floor(m / 60) !== F.hourSeen) fcLoad(); },
    html() {
      const d = F.d; if (!d) return '<div class="k-empty"><b>Loading forecast…</b></div>';
      const [h0, h1] = d.window_hours, crowdIcon = d.crowd.level === 'Busy' ? I.flame : d.crowd.level === 'Moderate' ? I.clock : I.check;
      return `<div class="k-fgrid">
        <section class="k-card wide"><div class="k-card-h"><h2>Order volume by hour</h2><p>Items per hour, ${esc(d.weekday)}. Predicted from the last ${Math.round(d.history_days / 7)} weeks of sales.</p></div>
          <div class="k-legend"><span><i class="a"></i>Booked so far</span><span><i class="p"></i>Predicted</span></div>
          <div class="k-chartwrap"><div class="k-chart" id="kChart"></div><div class="k-tip" hidden></div></div>
          <details class="k-tabw"><summary>Show as a table</summary><table><thead><tr><th>Hour</th><th>Booked</th><th>Predicted</th></tr></thead><tbody>${d.hours.map(h => `<tr><td>${esc(h.label)}</td><td>${h.actual}</td><td>${h.predicted}</td></tr>`).join('')}</tbody></table></details></section>
        <section class="k-card side"><div class="k-card-h"><h2>Top predicted items</h2><p>Next 3 hours (${hourLabel(h0)} to ${hourLabel(h1)})</p></div><div class="k-pad"><ul class="k-top">${d.top.map(t => {
          const c = t.change, cls = c > 0 ? 'up' : c < 0 ? 'down' : 'flat';
          return `<li><span class="k-thumb" style="--tint:${t.tint}">${stk(t.art)}</span><div><b>${esc(t.name)}</b><small>${t.predicted} expected</small></div><span class="k-chg ${cls}" title="Compared with a normal ${esc(d.weekday)}">${c > 0 ? '▲ +' : c < 0 ? '▼ ' : '– '}${c}%</span></li>`; }).join('')}</ul></div></section>
        <section class="k-card third"><div class="k-card-h"><h2>Expected crowd</h2></div><div class="k-pad k-crowd"><span class="lvl">${crowdIcon}${esc(d.crowd.level)}</span><span class="win">${esc(d.crowd.window)}</span><span class="k-sub">About ${d.crowd.orders_per_hour} orders an hour at the peak</span></div></section>
        <section class="k-card third"><div class="k-card-h"><h2>Recommended preparation</h2></div><div class="k-pad"><ul class="k-recs">${d.recs.length ? d.recs.map(r => `<li><span class="ck">${I.check}</span><span>${esc(r.text)}</span></li>`).join('') : '<li><span class="ck">' + I.check + '</span><span>No special preparation needed right now.</span></li>'}</ul></div></section>
        <section class="k-card third"><div class="k-card-h"><h2>Kitchen capacity</h2></div><div class="k-pad">${donut(d.load)}</div></section></div>`;
    },
    after(el) { const host = $('#kChart', el); if (host && F.d) drawChart(host, F.d); },
  });

  /* ============================================================ Settings */
  const UPI = {};      // what the owner has typed but not saved yet
  KT.register('settings', {
    title: 'Settings', sub: 'Payments, capacity, alerts and account',
    input(el) { if (el.dataset.upi) { UPI[el.dataset.upi] = el.value; return true; } return false; },
    async submit(name) {
      if (name !== 'upi') return false;
      try {
        const patch = {}; if (UPI.id !== undefined) patch.upi_id = UPI.id; if (UPI.name !== undefined) patch.upi_name = UPI.name;
        if (!Object.keys(patch).length) { KT.toast('Nothing to save.'); return true; }
        await API().kSettings(patch); delete UPI.id; delete UPI.name; KT.toast('Saved. Students will now pay this UPI ID.');
      } catch (e) { KT.toast(e.message); }
      await KT.loadSnap(); KT.renderPage(true); return true;
    },
    html() {
      const s = K.snap, cfg = K.cfg, ts = theme.get(); if (!s) return '<div class="k-empty"><b>Loading…</b></div>';
      const kind = cfg.gateway.kind, pay = s.pay || { kind, ready: true }, UP = UPI;
      const payNote = kind === 'upi' ? 'Students pay by UPI straight to you. Real money. You confirm each payment on the Payments page.'
        : kind === 'razorpay' ? (pay.test ? `Razorpay is connected in TEST mode (key ${esc(cfg.gateway.key_id || '')}). Students pay inside the app, but no real money moves. Use live keys to take real payments.`
          : `Razorpay is connected (key ${esc(cfg.gateway.key_id || '')}). Students pay inside the app with real money, and orders are confirmed automatically.`)
          : 'Demo mode: payments are simulated and no real money moves. Start the server without --demo to take real UPI payments.';
      const payForm = kind === 'upi' ? `<form class="k-upi" data-form="upi" autocomplete="off">
          <label class="k-field"><span>Your UPI ID</span><input class="k-input" data-upi="id" autocapitalize="none" spellcheck="false" placeholder="yourname@bank" value="${esc(UP.id ?? pay.upi_id ?? '')}"></label>
          <label class="k-field"><span>Name students see when they pay</span><input class="k-input" data-upi="name" maxlength="30" placeholder="Smart Canteen" value="${esc(UP.name ?? pay.upi_name ?? '')}"></label>
          <div class="k-upirow"><button type="submit" class="k-btn">Save</button><span class="k-sub ${pay.ready ? 'ok' : 'warn'}">${pay.ready ? `Students pay <b>${esc(pay.upi_id)}</b>.` : 'Not set yet. Students cannot order until you add it.'}</span></div></form>`
        : `<div class="k-setrow"><div><b>${kind === 'razorpay' ? 'Razorpay' : 'Built-in demo gateway'}</b><span class="k-sub">${kind === 'razorpay' ? `${pay.test ? 'Test mode' : 'Live mode'}. Webhook: ${pay.webhook ? 'set up. Orders confirm even if the student closes the app.' : 'not set up. Add RAZORPAY_WEBHOOK_SECRET (see README).'}` : 'Nothing to set up here in demo mode.'}</span></div></div>`;
      return `<div class="k-set">
        <section class="k-card"><div class="k-card-h"><h2>Orders</h2></div>
          <div class="k-setrow"><div><b>Accept new orders</b><span class="k-sub">Turn off when the kitchen needs a break. Students see a notice and cannot order.</span></div><button type="button" class="k-switch tap" role="switch" aria-checked="${s.accepting}" aria-label="Accept new orders" data-act="s-accept"></button></div>
          <div class="k-setrow"><div><b>Kitchen capacity</b><span class="k-sub">Items the kitchen can cook per 5 minute slot. Full slots stop taking orders.</span></div>
            <div class="k-step"><button type="button" data-act="s-cap" data-d="-1" aria-label="Lower capacity" ${s.capacity <= 4 ? 'disabled' : ''}>${I.minus}</button><output>${s.capacity}</output><button type="button" data-act="s-cap" data-d="1" aria-label="Raise capacity" ${s.capacity >= 60 ? 'disabled' : ''}>${I.plus}</button></div></div></section>
        <section class="k-card"><div class="k-card-h"><h2>Alerts and appearance</h2></div>
          <div class="k-setrow"><div><b>Sound alert for new orders</b><span class="k-sub">A short chime when a paid order arrives. Your browser needs one tap on this screen first.</span></div><div style="display:flex;gap:10px;align-items:center"><button type="button" class="k-btn ghost" data-act="s-test">Test</button><button type="button" class="k-switch tap" role="switch" aria-checked="${K.sound}" aria-label="Sound alerts" data-act="s-sound"></button></div></div>
          <div class="k-setrow"><div><b>Theme</b><span class="k-sub">Auto follows the tablet's light or dark setting.</span></div><div class="k-seg" role="group" aria-label="Theme">${['auto', 'light', 'dark'].map(v => `<button type="button" data-act="s-theme" data-v="${v}" aria-pressed="${ts === v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div></div></section>
        <section class="k-card"><div class="k-card-h"><h2>Payments</h2><p>${payNote}</p></div>${payForm}</section>
        ${cfg.demo ? `<section class="k-card"><div class="k-card-h"><h2>Demo</h2></div><div class="k-setrow"><div><b>Sample data</b><span class="k-sub">Add a few paid orders, or start over with the original lunch rush.</span></div><div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="k-btn ghost" data-act="s-rush">Add 8 orders</button><button type="button" class="k-btn danger ${K.confirm === 'reset' ? 'sure' : ''}" data-act="s-reset">${K.confirm === 'reset' ? 'Tap again to reset' : 'Reset demo'}</button></div></div></section>` : ''}
        <section class="k-card"><div class="k-card-h"><h2>Account</h2></div><div class="k-setrow"><div><b>Kitchen PIN</b><span class="k-sub">Shown in the server window when it starts. Set your own with the KITCHEN_PIN setting.</span></div><div style="display:flex;gap:10px;flex-wrap:wrap">${window.Shell && cfg.demo ? '<button type="button" class="k-btn ghost" data-act="student">Student view</button>' : ''}<button type="button" class="k-btn ghost" data-act="logout">Sign out</button></div></div></section></div>`;
    },
    async click(act, b) {
      try {
        if (act === 's-accept') { const r = await API().kSettings({ accepting: !K.snap.accepting }); KT.toast(r.accepting ? 'Taking orders again' : 'New orders paused'); }
        else if (act === 's-cap') { await API().kSettings({ capacity: K.snap.capacity + num(b.dataset.d) }); }
        else if (act === 's-sound') { K.sound = !K.sound; store.set('sc-ksound', K.sound); if (K.sound) KT.beep(); }
        else if (act === 's-test') { const was = K.sound; K.sound = true; KT.beep(); K.sound = was; }
        else if (act === 's-theme') { theme.set(b.dataset.v); return true; }
        else if (act === 's-rush') { const r = await API().demoRush(8); KT.toast(r.made ? `${r.made} new paid orders added` : 'No free slots or stock left'); }
        else if (act === 's-reset') { if (K.confirm !== 'reset') { K.confirm = 'reset'; KT.renderPage(true); setTimeout(() => { if (K.confirm === 'reset') { K.confirm = null; KT.renderPage(true); } }, 4000); return true; } K.confirm = null; await API().demoReset(); KT.toast('Demo reset'); }
        else return false;
      } catch (e) { KT.toast(e.message); }
      await KT.loadSnap(); KT.renderPage(true); return true;
    },
  });

  document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('kitchenRoot');
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset && e.target.dataset.mf) { e.preventDefault(); e.target.blur(); } });
  });
})();
