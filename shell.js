/* The prototype bar at the top: switch between the student and kitchen screens, theme, and the demo clock.
   Only shown in demo mode. A real (--live) canteen has no bar at all. */
(function () {
  'use strict';
  const { $, $$, esc, fmt, I, clock, theme, store } = CC;
  const API = () => window.CanteenAPI;
  let cfg = null, page = 'preview', mode = 'student', timer = 0;

  const JUMPS = [['12:30 pm', 750], ['12:50 pm', 770], ['1:30 pm', 810], ['3:15 pm', 915]];

  function setMode(m) {
    mode = m; store.set('sc-mode', m);
    const st = $('#stage'); if (st) st.dataset.mode = m;
    $$('#proto .seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    window.dispatchEvent(new Event('resize'));
  }

  function themeIcon() { const v = theme.get(); return v === 'dark' ? I.moon : v === 'light' ? I.sun : CC.svg('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>'); }

  function barHtml() {
    let sw;
    if (page === 'preview') {
      sw = `<div class="seg" role="group" aria-label="Screen">
        <button type="button" data-mode="student" aria-pressed="false">Student</button>
        <button type="button" data-mode="kitchen" aria-pressed="false">Kitchen</button>
        <button type="button" class="only-wide" data-mode="split" aria-pressed="false">Side by side</button></div>`;
    } else {
      sw = `<div class="seg" role="group" aria-label="Screen"><a href="/" ${page === 'student' ? 'aria-current="page"' : ''}>Student</a><a href="/kitchen" ${page === 'kitchen' ? 'aria-current="page"' : ''}>Kitchen</a></div>`;
    }
    return `<div class="proto-title">Smart Canteen <small>prototype</small></div>${sw}
      <button type="button" class="tbtn" id="themeBtn" aria-label="Theme: ${theme.get()}. Tap to change." title="Theme: ${theme.get()}">${themeIcon()}</button>
      <button type="button" class="clock-chip" id="clockChip" aria-expanded="false" aria-controls="clockPop"><i></i><span class="lbl">Canteen time</span><b id="clockTxt"></b></button>
      <div class="pop" id="clockPop" hidden>
        <h3>Demo controls</h3>
        <p id="clockNote"></p>
        ${API().kind === 'local' ? `<p class="lbl2">Clock</p>
        <div class="row"><button type="button" class="pbtn" data-do="mode" data-mode="demo">Demo clock</button><button type="button" class="pbtn" data-do="mode" data-mode="real">Real time (IST)</button></div>` : ''}
        <div class="row"><button type="button" class="pbtn hot" data-do="toggle" id="pauseBtn" data-demo-only>Pause</button><button type="button" class="pbtn" data-do="plus" data-m="5" data-demo-only>+5 min</button><button type="button" class="pbtn" data-do="plus" data-m="15" data-demo-only>+15 min</button></div>
        <p class="lbl2">Jump to</p>
        <div class="row">${JUMPS.map(([l, m]) => `<button type="button" class="pbtn" data-do="jump" data-m="${m}" data-demo-only>${l}</button>`).join('')}</div>
        <p class="lbl2">Orders</p>
        <div class="row"><button type="button" class="pbtn" data-do="rush" data-demo-only>Add 8 orders</button><button type="button" class="pbtn warn" data-do="reset">Reset demo</button></div>
        <p id="popMsg" role="status"></p>
      </div>`;
  }

  async function resync() { try { const r = await API().rev(); clock.sync(r.now, r.running, r.sec_per_min, r.demo); paint(); } catch (e) { /* offline */ } }
  function paint() {
    const t = $('#clockTxt'), chip = $('#clockChip'); if (!t) return;
    t.textContent = fmt(clock.now()); chip.classList.toggle('paused', !clock.running);
    const pb = $('#pauseBtn'); if (pb) pb.textContent = clock.running ? 'Pause' : 'Resume';
    const lbl = $('.lbl', chip); if (lbl) lbl.textContent = clock.demo ? 'Canteen time' : 'India time';
    const note = $('#clockNote');
    if (note) note.textContent = clock.demo ? `The canteen clock runs fast so you can watch a whole lunch break: one minute passes every ${clock.spm} seconds. Both screens share this clock. Times are India time (IST).`
      : 'This is the real India time (IST), the same clock a live canteen uses. The demo orders are off, so place one yourself from the student screen. Switch back to the demo clock to see a busy lunch break.';
    $$('#clockPop [data-demo-only]').forEach(b => { b.disabled = !clock.demo; });
    $$('#clockPop [data-do="mode"]').forEach(b => { b.classList.toggle('hot', (b.dataset.mode === 'demo') === !!clock.demo); });
  }
  function say(msg) { const m = $('#popMsg'); if (m) m.textContent = msg; }

  async function act(b) {
    const d = b.dataset.do;
    try {
      if (d === 'toggle') await API().demoClock(clock.running ? 'pause' : 'resume');
      else if (d === 'plus') await API().demoClock('plus', +b.dataset.m);
      else if (d === 'jump') await API().demoClock('jump', +b.dataset.m);
      else if (d === 'rush') { const r = await API().demoRush(8); say(r.made ? `${r.made} new paid orders just arrived.` : 'No free slots or stock left to add orders.'); }
      else if (d === 'reset') { await API().demoReset(); say(clock.demo ? 'Demo reset to 12:50 pm.' : 'Cleared today\'s orders.'); }
      else if (d === 'mode') { await API().demoClock('mode', b.dataset.mode); say(b.dataset.mode === 'real' ? 'Now on real India time. Today\'s orders were cleared.' : 'Back on the demo clock with sample orders.'); }
      await resync();
    } catch (e) { say(e.message); }
  }

  async function init(p) {
    page = p; cfg = await API().config();
    const bar = $('#proto'); if (!bar) return;
    if (!cfg.demo) { bar.hidden = true; return; }
    bar.innerHTML = barHtml(); bar.hidden = false;
    if (page === 'preview') setMode(store.get('sc-mode', innerWidth >= 1280 ? 'split' : 'student'));
    if (page === 'preview' && mode === 'split' && innerWidth < 1200) setMode('student');
    bar.addEventListener('click', e => {
      const seg = e.target.closest('.seg button'); if (seg) { setMode(seg.dataset.mode); return; }
      if (e.target.closest('#themeBtn')) { const next = { auto: 'light', light: 'dark', dark: 'auto' }[theme.get()]; theme.set(next); const b = $('#themeBtn'); b.innerHTML = themeIcon(); b.title = `Theme: ${next}`; b.setAttribute('aria-label', `Theme: ${next}. Tap to change.`); return; }
      if (e.target.closest('#clockChip')) { const pop = $('#clockPop'); pop.hidden = !pop.hidden; $('#clockChip').setAttribute('aria-expanded', String(!pop.hidden)); return; }
      const pb = e.target.closest('[data-do]'); if (pb) act(pb);
    });
    document.addEventListener('click', e => { const pop = $('#clockPop'); if (pop && !pop.hidden && !e.target.closest('#proto')) { pop.hidden = true; $('#clockChip').setAttribute('aria-expanded', 'false'); } });
    document.addEventListener('keydown', e => { const pop = $('#clockPop'); if (e.key === 'Escape' && pop && !pop.hidden) { pop.hidden = true; $('#clockChip').setAttribute('aria-expanded', 'false'); $('#clockChip').focus(); } });
    await resync(); paint(); timer = setInterval(paint, 500);
    setInterval(resync, 5000);
  }

  function goKitchen() { if (page === 'preview') setMode(innerWidth >= 1280 ? 'split' : 'kitchen'); else location.href = '/kitchen'; }
  function goStudent() { if (page === 'preview') setMode(innerWidth >= 1280 ? 'split' : 'student'); else location.href = '/'; }

  window.Shell = { init, goKitchen, goStudent, get mode() { return mode; } };
})();
