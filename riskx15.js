'use strict';
/* Fifteenth batch, added to Risk.x: copula fit by maximum likelihood on ranks (Gaussian, Student t, Clayton, Gumbel) compared by AIC, and the average pairwise
   correlation of a set of return series, overall, in a rolling window and in the worst days of their equal-weight basket. */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); if (typeof require !== 'undefined' && !G.Risk) { require('./riskx2.js'); require('./riskx14.js'); }
  const X = Risk.x, { normInv, normCdf } = Risk;

  // Pseudo-observations: rank / (n + 1), so they sit strictly inside (0, 1).
  const pseudo = (x) => { const idx = x.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]), u = new Array(x.length); idx.forEach(([, i], r) => { u[i] = (r + 1) / (x.length + 1); }); return u; };

  function lgam(x) { // Lanczos
    const c = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgam(1 - x);
    x -= 1; let a = 0.99999999999980993; const t = x + 7.5; for (let i = 0; i < 8; i++) a += c[i] / (x + i + 1);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  // Student t distribution function through the regularised incomplete beta (continued fraction) and its quantile by bisection.
  function betacf(a, b, x) {
    let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < 1e-300) d = 1e-300; d = 1 / d; let h = d;
    for (let m = 1; m <= 300; m++) {
      const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2)); d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2)); d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-14) break;
    }
    return h;
  }
  function ibeta(a, b, x) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(lgam(a + b) - lgam(a) - lgam(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  const tCdf = (x, nu) => { const p = 0.5 * ibeta(nu / 2, 0.5, nu / (nu + x * x)); return x > 0 ? 1 - p : p; };
  function tInv(p, nu) { let lo = -1e3, hi = 1e3; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (tCdf(m, nu) < p) lo = m; else hi = m; } return (lo + hi) / 2; }

  // Log-likelihoods of the bivariate copula densities on pseudo-observations.
  const llGauss = (u, v, r) => { let s = 0; const k = 1 - r * r; for (let i = 0; i < u.length; i++) { const a = normInv(u[i]), b = normInv(v[i]); s += -0.5 * Math.log(k) - (r * r * (a * a + b * b) - 2 * r * a * b) / (2 * k); } return s; };
  const llClayton = (u, v, th) => { let s = 0; for (let i = 0; i < u.length; i++) s += Math.log(1 + th) - (1 + th) * Math.log(u[i] * v[i]) - (2 + 1 / th) * Math.log(Math.pow(u[i], -th) + Math.pow(v[i], -th) - 1); return s; };
  const llGumbel = (u, v, th) => {
    let s = 0;
    for (let i = 0; i < u.length; i++) {
      const a = -Math.log(u[i]), b = -Math.log(v[i]), A = Math.pow(a, th) + Math.pow(b, th), C = Math.pow(A, 1 / th);
      s += -C + (th - 1) * (Math.log(a) + Math.log(b)) - Math.log(u[i]) - Math.log(v[i]) + (1 / th - 2) * Math.log(A) + Math.log(C + th - 1);
    }
    return s;
  };
  // Student t copula: needs the quantiles of the uniforms for each nu (precomputed by the caller).
  function llT(ta, tb, r, nu) {
    const k = 1 - r * r, c0 = lgam((nu + 2) / 2) + lgam(nu / 2) - 2 * lgam((nu + 1) / 2) - 0.5 * Math.log(k); let s = 0;
    for (let i = 0; i < ta.length; i++) {
      const a = ta[i], b = tb[i], q = (a * a + b * b - 2 * r * a * b) / (nu * k);
      s += c0 - (nu + 2) / 2 * Math.log(1 + q) + (nu + 1) / 2 * (Math.log(1 + a * a / nu) + Math.log(1 + b * b / nu));
    }
    return s;
  }
  function golden(f, lo, hi, it = 80) { // maximise f on [lo, hi]
    const g = (Math.sqrt(5) - 1) / 2; let a = lo, b = hi, c = b - g * (b - a), d = a + g * (b - a), fc = f(c), fd = f(d);
    for (let i = 0; i < it; i++) { if (fc > fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); } else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); } }
    const x = (a + b) / 2; return { x, f: f(x) };
  }

  // Fit the four families to two return series. Parameters: Gaussian and t correlation, Clayton and Gumbel theta; t also has nu on a grid.
  function fitCopulas(x, y) {
    const u = pseudo(x), v = pseudo(y), n = x.length, out = [];
    const g = golden((r) => llGauss(u, v, r), -0.99, 0.99); out.push({ name: 'Gaussian', par: { rho: g.x }, ll: g.f, k: 1, lower: 0, upper: 0 });
    const nus = [2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 50]; let bt = null;
    for (const nu of nus) { const ta = u.map((p) => tInv(p, nu)), tb = v.map((p) => tInv(p, nu)), r = golden((rr) => llT(ta, tb, rr, nu), -0.99, 0.99, 50); if (!bt || r.f > bt.f) bt = { nu, rho: r.x, f: r.f }; }
    const td = 2 * tCdf(-Math.sqrt((bt.nu + 1) * (1 - bt.rho) / (1 + bt.rho)), bt.nu + 1); out.push({ name: 'Student t', par: { rho: bt.rho, nu: bt.nu }, ll: bt.f, k: 2, lower: td, upper: td });
    const c = golden((th) => llClayton(u, v, th), 1e-3, 30); out.push({ name: 'Clayton', par: { theta: c.x }, ll: c.f, k: 1, lower: Math.pow(2, -1 / c.x), upper: 0 });
    const gb = golden((th) => llGumbel(u, v, th), 1, 30); out.push({ name: 'Gumbel', par: { theta: gb.x }, ll: gb.f, k: 1, lower: 0, upper: 2 - Math.pow(2, 1 / gb.x) });
    for (const o of out) { o.aic = 2 * o.k - 2 * o.ll; o.bic = Math.log(n) * o.k - 2 * o.ll; }
    return out.sort((a, b) => a.aic - b.aic);
  }

  // Average pairwise correlation of the columns of R (array of equal-length series), over the whole sample, optionally on the days listed in `idx`.
  function avgCorr(R, idx) {
    const k = R.length, rows = idx || R[0].map((_, t) => t); let s = 0, m = 0;
    const cols = R.map((r) => rows.map((t) => r[t]));
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) { const mi = Risk.mean(cols[i]), mj = Risk.mean(cols[j]); let a = 0, b = 0, c = 0; for (let t = 0; t < rows.length; t++) { const p = cols[i][t] - mi, q = cols[j][t] - mj; a += p * q; b += p * p; c += q * q; } s += a / Math.sqrt(b * c); m++; }
    return s / m;
  }
  // Correlation stability: rolling average correlation (window w, step), and the same on the worst `frac` days of the equal-weight basket against the other days.
  function corrStability(R, w, frac) {
    const n = R[0].length, roll = [], at = [];
    for (let e = w; e <= n; e += 5) { const idx = Array.from({ length: w }, (_, j) => e - w + j); roll.push(avgCorr(R, idx)); at.push(e); }
    const bs = R[0].map((_, t) => R.reduce((s, r) => s + r[t], 0) / R.length), order = bs.map((_, t) => t).sort((a, b) => bs[a] - bs[b]), m = Math.max(5, Math.round(frac * n));
    const worst = order.slice(0, m), rest = order.slice(m);
    return { all: avgCorr(R), worst: avgCorr(R, worst), rest: avgCorr(R, rest), roll, at, m };
  }
  Object.assign(X, { pseudo, tCdf, tInv, fitCopulas, avgCorr, corrStability, lgamma: lgam });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
