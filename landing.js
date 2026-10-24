'use strict';
/* Landing page. The moving background is the lab's own output: a fan of simulated GARCH(1,1) return paths (risk.js),
   all starting from the same point, re-drawn as a window slides along them. Red = the worst path, green = the best. */
(function () {
  const cv = document.getElementById('field'), ctx = cv.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const N = 26, LEN = 240, TOTAL = 1400, STEP = 3;               // paths, points shown, points simulated, points per second
  const paths = Array.from({ length: N }, (_, k) => {
    let c = 0;
    return Risk.simulate(TOTAL + 1, 7000 + k * 101).map((r) => (c += r));   // cumulative return
  });
  let W = 0, H = 0, dpr = 1, C = {};
  const colours = () => { const g = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(); C = { a: g('--field-a'), hi: g('--field-hi'), lo: g('--field-lo'), alpha: document.documentElement.dataset.theme === 'light' ? .2 : .11 }; };
  colours(); addEventListener('themechange', () => { colours(); if (still) frame(60000); });
  function size() {
    dpr = Math.min(devicePixelRatio || 1, 2); W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function frame(ms) {
    const off = (ms / 1000 * STEP) % (TOTAL - LEN - 1), i0 = Math.floor(off), f = off - i0;
    const val = (p, j) => p[i0 + j] * (1 - f) + p[i0 + j + 1] * f - (p[i0] * (1 - f) + p[i0 + 1] * f);
    const sc = H * 0.7 / 1.1, mid = H * 0.5, xs = W / LEN;
    ctx.clearRect(0, 0, W, H);
    let lo = 0, hi = 0, vlo = Infinity, vhi = -Infinity;
    paths.forEach((p, k) => { const e = val(p, LEN - 1); if (e < vlo) { vlo = e; lo = k; } if (e > vhi) { vhi = e; hi = k; } });
    ctx.lineWidth = 1.2; ctx.lineJoin = 'round';
    paths.forEach((p, k) => {
      ctx.beginPath();
      for (let j = 0; j < LEN; j++) { const x = j * xs, y = mid - val(p, j) * sc; j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.strokeStyle = k === lo ? `rgba(${C.lo},.6)` : k === hi ? `rgba(${C.hi},.6)` : `rgba(${C.a},${C.alpha})`;
      ctx.lineWidth = k === lo || k === hi ? 1.6 : 1;
      ctx.stroke();
    });
  }
  size();
  addEventListener('resize', () => { size(); if (still) frame(60000); });
  if (still) frame(60000);
  else { const loop = (t) => { frame(t); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }

  // entrance of each part of a section, once
  const items = document.querySelectorAll('.sec h2, .sec .col p, .sec .list li, .sec .figs li, .close-in > *');
  items.forEach((el, n) => { el.classList.add('rise'); el.style.setProperty('--i', n % 4); });
  if (!('IntersectionObserver' in window)) return items.forEach((el) => el.classList.add('in'));
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.15 });
  items.forEach((el) => io.observe(el));
})();
