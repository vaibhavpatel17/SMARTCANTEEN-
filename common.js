/* Shared helpers for the student and kitchen screens. Exposes window.CC. */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const fmt = m => { m = Math.floor(m + 1e-9); const h = Math.floor(m / 60), mm = m % 60; return `${h % 12 || 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };
  const fmtS = m => { m = Math.floor(m + 1e-9); const h = Math.floor(m / 60), mm = m % 60; return `${h % 12 || 12}:${String(mm).padStart(2, '0')}`; };
  const mins = n => { n = Math.max(0, Math.round(n)); return n < 60 ? `${n} min` : `${Math.floor(n / 60)} h ${n % 60} min`; };
  const rs = n => '₹' + n;
  const mmss = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  const svg = (p, w = 2.4) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const I = {
    plus: svg('<path d="M12 5v14M5 12h14"/>', 3), minus: svg('<path d="M5 12h14"/>', 3), x: svg('<path d="M6 6l12 12M18 6L6 18"/>', 3),
    check: svg('<path d="M5 12l5 5 9-10"/>', 3), arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>', 3), back: svg('<path d="M19 12H5M11 6l-6 6 6 6"/>', 3),
    sound: svg('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9a4 4 0 0 1 0 6"/>'), mute: svg('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l4 6M21 9l-4 6"/>'),
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    moon: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
    orders: svg('<rect x="5" y="4" width="14" height="17" rx="2"/><rect x="9" y="2.5" width="6" height="3" rx="1"/><path d="M9 11h6M9 15h6"/>'),
    bag: svg('<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    menu: svg('<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10"/><path d="M17 21V3c-2 1-3 4-3 8h3"/>'),
    chart: svg('<path d="M4 20V11M10 20V4M16 20v-6M3 20h18"/>'),
    box: svg('<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>'),
    sliders: svg('<path d="M4 6h8M18 6h2M4 12h2M12 12h8M4 18h10M20 18h0"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'),
    out: svg('<path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
    alert: svg('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h0"/>'),
    flame: svg('<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>'),
    bell: svg('<path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4z"/><path d="M10 21h4"/>'),
    mega: svg('<path d="M3 10v4h4l8 5V5L7 10z"/><path d="M18 9a4 4 0 0 1 0 6"/>'),
    phone: svg('<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18h2"/>'),
    card: svg('<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6 15h4"/>'),
    bank: svg('<path d="M3 10l9-6 9 6M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18"/>'),
    lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    cash: svg('<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>'),
    auto: svg('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>'),
    copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>'),
    trash: svg('<path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/>'),
    cal: svg('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
    user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    refresh: svg('<path d="M20 11a8 8 0 0 0-14-4M4 4v4h4M4 13a8 8 0 0 0 14 4M20 20v-4h-4"/>'),
  };
  const stk = (id, cls = 'sticker') => `<svg class="${cls}" viewBox="0 0 100 100" aria-hidden="true"><use href="#s-${id}"/></svg>`;

  /* ---- the canteen clock: the server says what time it is, we keep it ticking locally ---- */
  const clock = {
    n0: 770, at: performance.now(), running: true, spm: 10, demo: true,
    sync(n, running, spm, demo) { this.n0 = n; this.at = performance.now(); this.running = running; this.spm = spm || 10; if (demo !== undefined) this.demo = demo; },
    // the demo clock stops at closing time; the real (India time) clock just keeps going and is re-synced every couple of seconds
    now() { if (!this.running) return this.n0; const t = this.n0 + (performance.now() - this.at) / 1000 / this.spm; return this.demo ? Math.min(1050, t) : t; },
  };

  /* ---- QR code as crisp SVG (library: static/js/qrcode.js) ---- */
  function qrSvg(text, o = {}) {
    const dark = o.dark || '#16122B', light = o.light || '#ffffff', margin = o.margin ?? 2;
    const q = qrcode(0, 'M'); q.addData(text); q.make();
    const n = q.getModuleCount(); let d = '';
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (q.isDark(r, c)) { const s = c; while (c < n && q.isDark(r, c)) c++; d += `M${s + margin} ${r + margin}h${c - s}v1h${s - c}z`; } else c++;
      }
    }
    const size = n + margin * 2;
    return `<svg class="${o.cls || 'qr'}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="${esc(o.label || 'QR code')}"><rect width="${size}" height="${size}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
  }

  function confetti(root) {
    if (reduceMotion || !root) return;
    const cv = $('.confetti', root); if (!cv) return;
    const r = root.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    if (!r.width) return;
    cv.width = r.width * dpr; cv.height = r.height * dpr;
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const cols = ['#FFD23F', '#FF5C93', '#4259FF', '#22C58B', '#FF9A3D', '#ffffff'];
    const P = Array.from({ length: 90 }, () => ({ x: r.width / 2, y: r.height * .55, vx: (Math.random() - .5) * 14, vy: -(6 + Math.random() * 12), w: 6 + Math.random() * 7, h: 4 + Math.random() * 6, a: Math.random() * 6, va: (Math.random() - .5) * .4, c: pick(cols) }));
    let f = 0;
    (function step() {
      g.clearRect(0, 0, r.width, r.height);
      P.forEach(p => { p.vy += .45; p.x += p.vx; p.y += p.vy; p.a += p.va; g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore(); });
      if (++f < 110) requestAnimationFrame(step); else g.clearRect(0, 0, r.width, r.height);
    })();
  }

  /* ---- repeat a task while the page is visible, never overlapping ---- */
  function poller(fn, ms) {
    let busy = false;
    const id = setInterval(async () => { if (busy || document.hidden) return; busy = true; try { await fn(); } finally { busy = false; } }, ms);
    return () => clearInterval(id);
  }

  /* ---- theme: auto follows the device; light and dark can be forced ---- */
  const theme = {
    get() { try { return localStorage.getItem('sc-theme') || 'auto'; } catch (e) { return 'auto'; } },
    set(v) {
      const el = document.documentElement;
      if (v === 'auto') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', v);
      try { localStorage.setItem('sc-theme', v); } catch (e) { /* storage blocked */ }
      document.dispatchEvent(new CustomEvent('sc-theme'));
    },
    effective() { return document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); },
    init() { const v = this.get(); if (v !== 'auto') document.documentElement.setAttribute('data-theme', v); },
  };

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
  };

  window.CC = { $, $$, esc, clamp, pick, sleep, reduceMotion, fmt, fmtS, mins, mmss, rs, I, svg, stk, clock, qrSvg, confetti, poller, theme, store };
})();
