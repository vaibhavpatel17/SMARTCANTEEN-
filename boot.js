/* Starts whichever screen this page is for. Loaded last, so every module has registered its listeners already. */
(function () {
  'use strict';
  CC.theme.init();
  window.addEventListener('DOMContentLoaded', async () => {
    const page = document.body.dataset.page;   // 'student' | 'kitchen' | 'preview'
    const fail = (root, e) => { root.innerHTML = `<div style="display:grid;place-items:center;height:100%;padding:24px;text-align:center;font:600 1rem/1.4 system-ui"><div><h2 style="margin:0 0 6px">Cannot reach the canteen</h2><p style="margin:0;opacity:.75">${CC.esc(e.message)} Check that the server is running and you are on the same Wi-Fi.</p></div></div>`; };
    try { await Shell.init(page); } catch (e) { /* the bar is optional */ }
    const jobs = [];
    if (page !== 'kitchen') jobs.push(Student.mount().catch(e => fail(document.getElementById('studentRoot'), e)));
    if (page !== 'student') jobs.push(Kitchen.mount().catch(e => fail(document.getElementById('kitchenRoot'), e)));
    await Promise.all(jobs);
  });
})();
