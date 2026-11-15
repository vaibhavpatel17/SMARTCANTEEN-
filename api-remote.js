/* Talks to the real server: every call is a JSON request to an /api endpoint of app.py, same origin as the page. */
(function () {
  'use strict';
  async function j(method, url, body) {
    let res;
    try {
      res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin', cache: 'no-store' });
    } catch (e) {
      const err = new Error('Cannot reach the canteen server.'); err.offline = true; throw err;
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) { const err = new Error((data && data.error) || 'Something went wrong. Please try again.'); err.status = res.status; throw err; }
    return data;
  }
  const qs = o => { const p = new URLSearchParams(); Object.entries(o || {}).forEach(([k, v]) => { if (v !== '' && v != null) p.set(k, v); }); const s = p.toString(); return s ? '?' + s : ''; };

  window.CanteenAPI = {
    kind: 'remote',
    config: () => j('GET', '/api/config'),
    rev: () => j('GET', '/api/rev'),
    menu: () => j('GET', '/api/menu'),
    // accounts and timetable
    me: () => j('GET', '/api/auth/me'),
    signup: (name, phone, password) => j('POST', '/api/auth/signup', { name, phone, password }),
    login: (phone, password) => j('POST', '/api/auth/login', { phone, password }),
    logout: () => j('POST', '/api/auth/logout', {}),
    saveTimetable: timetable => j('PUT', '/api/timetable', { timetable }),
    // ordering
    slots: items => j('POST', '/api/slots', { items }),
    createOrder: p => j('POST', '/api/orders', p),
    pay: (paymentId, method, details) => j('POST', `/api/payments/${paymentId}/pay`, { method, details }),
    submitUtr: (paymentId, utr) => j('POST', `/api/payments/${paymentId}/utr`, { utr }),
    razorpayVerify: (paymentId, resp) => j('POST', `/api/payments/${paymentId}/razorpay`, resp),
    myOrders: () => j('GET', '/api/orders/mine'),
    cancel: id => j('POST', `/api/orders/${id}/cancel`, {}),
    // kitchen
    kLogin: pin => j('POST', '/api/kitchen/login', { pin }),
    kLogout: () => j('POST', '/api/kitchen/logout', {}),
    kMe: () => j('GET', '/api/kitchen/me'),
    kSnapshot: () => j('GET', '/api/kitchen/snapshot'),
    kStatus: (id, status) => j('PATCH', `/api/kitchen/orders/${id}`, { status }),
    kCancel: (id, reason) => j('POST', `/api/kitchen/orders/${id}/cancel`, { reason }),
    kPaymentReceived: id => j('POST', `/api/kitchen/orders/${id}/payment-received`, {}),
    kPaymentMissing: id => j('POST', `/api/kitchen/orders/${id}/payment-missing`, {}),
    kRefunded: id => j('POST', `/api/kitchen/orders/${id}/refunded`, {}),
    kVerify: (token, pin) => j('POST', '/api/kitchen/verify', { token, pin }),
    kHistory: o => j('GET', '/api/kitchen/history' + qs(o)),
    kForecast: () => j('GET', '/api/kitchen/forecast'),
    kInventory: () => j('GET', '/api/kitchen/inventory'),
    kApplyForecast: ids => j('POST', '/api/kitchen/inventory/apply-forecast', { ids }),
    kMenu: (id, patch) => j('PATCH', `/api/kitchen/menu/${id}`, patch),
    kSettings: patch => j('PATCH', '/api/kitchen/settings', patch),
    // demo controls (server refuses these in live mode)
    demoClock: (action, minutes) => j('POST', '/api/demo/clock', { action, minutes }),
    demoRush: n => j('POST', '/api/demo/rush', { n }),
    demoReset: () => j('POST', '/api/demo/reset', {}),
  };
})();
