'use strict';
/* Quant: the extra maths behind the lab modules (tails, simulation, jumps, Heston, SVI / SABR, trees, curves, portfolios, credit).
   Pure functions, no DOM, tested under Node (test-quant.js). Extends Risk (after risk.js and options.js). Returns are simple, losses positive. */
(function (root) {
  const Risk = root.Risk || require('./risk.js');
  if (!Risk.bs && typeof require !== 'undefined') require('./options.js');
  const { normCdf, normInv, normPdf, mean, std } = Risk, PI = Math.PI;

  // ---------- random numbers and optimiser ----------
  function rng(seed = 20261023) {                      // mulberry32 + Box-Muller
    let a = seed >>> 0, spare = null;
    const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const n = () => { if (spare != null) { const s = spare; spare = null; return s; } let x, y, r; do { x = 2 * u() - 1; y = 2 * u() - 1; r = x * x + y * y; } while (r >= 1 || r === 0); const m = Math.sqrt(-2 * Math.log(r) / r); spare = y * m; return x * m; };
    return { u, n };
  }
  function nelderMead(f, x0, step = 0.2, iters = 600) {
    const n = x0.length; let sim = [x0.slice()];
    for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] += Math.abs(p[i]) > 1e-9 ? step * Math.abs(p[i]) : step * 0.1; sim.push(p); }
    let fv = sim.map(f);
    for (let it = 0; it < iters; it++) {
      const idx = fv.map((_, i) => i).sort((a, b) => fv[a] - fv[b]); sim = idx.map((i) => sim[i]); fv = idx.map((i) => fv[i]);
      if (Math.abs(fv[n] - fv[0]) < 1e-14 * (1 + Math.abs(fv[0]))) break;
      const c = Array.from({ length: n }, (_, j) => sim.slice(0, n).reduce((s, p) => s + p[j], 0) / n), at = (t) => c.map((v, j) => v + t * (sim[n][j] - v));
      const xr = at(-1), fr = f(xr);
      if (fr < fv[0]) { const xe = at(-2), fe = f(xe); if (fe < fr) { sim[n] = xe; fv[n] = fe; } else { sim[n] = xr; fv[n] = fr; } }
      else if (fr < fv[n - 1]) { sim[n] = xr; fv[n] = fr; }
      else { const xc = at(fr < fv[n] ? -0.5 : 0.5), fc = f(xc); if (fc < Math.min(fr, fv[n])) { sim[n] = xc; fv[n] = fc; } else for (let i = 1; i <= n; i++) { sim[i] = sim[i].map((v, j) => sim[0][j] + 0.5 * (v - sim[0][j])); fv[i] = f(sim[i]); } }
    }
    const b = fv.indexOf(Math.min(...fv)); return { x: sim[b], f: fv[b] };
  }
  const quantile = (a, p) => { const s = a.slice().sort((x, y) => x - y), i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo); };

  // ---------- tails: GPD / POT, Hill, mean excess ----------
  function gpdFit(excess) {                                         // maximum likelihood on the exceedances over a threshold
    const m = mean(excess), nll = ([xi, lb]) => {
      const b = Math.exp(lb); if (!(b > 0) || xi < -0.5 || xi > 1.5) return 1e12;
      let s = 0; for (const y of excess) { const z = 1 + xi * y / b; if (z <= 0) return 1e12; s += Math.abs(xi) < 1e-9 ? y / b : (1 + 1 / xi) * Math.log(z); }
      return excess.length * lb + s;
    };
    let best = null; for (const x0 of [[0.1, Math.log(m)], [0.3, Math.log(m * 0.7)], [-0.1, Math.log(m * 1.2)]]) { const r = nelderMead(nll, x0, 0.3, 500); if (!best || r.f < best.f) best = r; }
    return { xi: best.x[0], beta: Math.exp(best.x[1]), nll: best.f };
  }
  function evtTail(losses, uQ, conf) {                              // peaks over threshold: threshold = quantile uQ of the losses
    const n = losses.length, u = quantile(losses, uQ), ex = losses.filter((x) => x > u).map((x) => x - u), Nu = ex.length;
    if (Nu < 15) return null;
    const { xi, beta } = gpdFit(ex), q = (n / Nu) * (1 - conf);
    const v = Math.abs(xi) < 1e-9 ? u - beta * Math.log(q) : u + beta / xi * (Math.pow(q, -xi) - 1);
    const es = xi < 1 ? v / (1 - xi) + (beta - xi * u) / (1 - xi) : NaN;
    return { u, Nu, xi, beta, var: v, es, cdf: (x) => 1 - (Nu / n) * Math.pow(Math.max(1 + xi * (x - u) / beta, 0), -1 / xi) };
  }
  
  
  
  

  // ---------- confidence intervals ----------
  const hvar = (r, conf) => Risk.historical(r, conf);
  function varCI(r, conf, alpha = 0.05) {                           // order statistics (distribution-free) on losses
    const L = r.map((x) => -x).sort((a, b) => a - b), n = L.length;
    let lo = 1, hi = n; for (let l = 1; l <= n; l++) { if (Risk.binomCdf(n, conf, l - 1) <= alpha / 2) lo = l; else break; }
    for (let u = 1; u <= n; u++) { if (Risk.binomCdf(n, conf, u - 1) >= 1 - alpha / 2) { hi = u; break; } }
    return { lo: L[lo - 1], hi: L[hi - 1], ranks: [lo, hi] };
  }
  function bootstrapVar(r, conf, B = 600, block = 1, seed = 7) {   // block = 1: iid; block > 1: stationary bootstrap (Politis-Romano), mean block length
    const R = rng(seed), n = r.length, v = [], e = [];
    for (let b = 0; b < B; b++) {
      const s = new Array(n); let i = Math.floor(R.u() * n);
      for (let t = 0; t < n; t++) { s[t] = r[i]; i = block > 1 && R.u() >= 1 / block ? (i + 1) % n : Math.floor(R.u() * n); }
      const h = hvar(s, conf); v.push(h.var); e.push(h.es);
    }
    return { v, e, vCI: [quantile(v, 0.025), quantile(v, 0.975)], eCI: [quantile(e, 0.025), quantile(e, 0.975)], eSE: std(e), vSE: std(v) };
  }

  // ---------- correlation, vol cone, performance ----------
  
  const corr = (x, y) => { const mx = mean(x), my = mean(y); let a = 0, b = 0, c = 0; for (let i = 0; i < x.length; i++) { a += (x[i] - mx) * (y[i] - my); b += (x[i] - mx) ** 2; c += (y[i] - my) ** 2; } return a / Math.sqrt(b * c); };
  function volCone(r, ppy = 252, windows = [5, 10, 21, 42, 63, 126, 252]) {
    return windows.filter((w) => r.length > w * 2).map((w) => {
      const v = []; for (let i = w; i <= r.length; i += 1) v.push(std(r.slice(i - w, i)) * Math.sqrt(ppy));
      return { w, now: v[v.length - 1], min: Math.min(...v), p25: quantile(v, 0.25), med: quantile(v, 0.5), p75: quantile(v, 0.75), max: Math.max(...v) };
    });
  }
  
  
  

  // ---------- Monte Carlo ----------
  function halton(i, base) { let f = 1, r = 0; while (i > 0) { f /= base; r += f * (i % base); i = Math.floor(i / base); } return r; }
  
  function mcCall(S, K, T, v, r, q, N, method, R, shift = 0) {       // one price estimate: plain | antithetic | halton | control (S_T as control variate)
    const f = (z) => Math.max(S * Math.exp((r - q - v * v / 2) * T + v * Math.sqrt(T) * z) - K, 0), disc = Math.exp(-r * T);
    if (method === 'plain') { let s = 0; for (let i = 0; i < N; i++) s += f(R.n()); return disc * s / N; }
    if (method === 'antithetic') { let s = 0; for (let i = 0; i < N / 2; i++) { const z = R.n(); s += (f(z) + f(-z)) / 2; } return disc * s / (N / 2); }
    if (method === 'halton') { let s = 0; for (let i = 1; i <= N; i++) s += f(normInv(Math.min(Math.max((halton(i, 2) + shift) % 1, 1e-12), 1 - 1e-12))); return disc * s / N; }
    const zs = Array.from({ length: N }, () => R.n()), ys = zs.map(f), xs = zs.map((z) => S * Math.exp((r - q - v * v / 2) * T + v * Math.sqrt(T) * z)), ex = S * Math.exp((r - q) * T);
    const mx = mean(xs), my = mean(ys); let c = 0, d = 0; for (let i = 0; i < N; i++) { c += (xs[i] - mx) * (ys[i] - my); d += (xs[i] - mx) ** 2; }
    return disc * (my - (c / d) * (mx - ex));
  }

  // ---------- jumps: Merton ----------
  
  

  // ---------- Heston ----------
  const C = { add: (a, b) => [a[0] + b[0], a[1] + b[1]], sub: (a, b) => [a[0] - b[0], a[1] - b[1]], mul: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]],
    div: (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; }, exp: (a) => { const e = Math.exp(a[0]); return [e * Math.cos(a[1]), e * Math.sin(a[1])]; },
    log: (a) => [Math.log(Math.hypot(a[0], a[1])), Math.atan2(a[1], a[0])], sqrt: (a) => { const m = Math.hypot(a[0], a[1]), re = Math.sqrt((m + a[0]) / 2), im = Math.sqrt(Math.max((m - a[0]) / 2, 0)); return [re, a[1] < 0 ? -im : im]; }, k: (a, s) => [a[0] * s, a[1] * s] };
  
  
  

  // ---------- mean reversion ----------
  
  

  // ---------- options: trees, exotics ----------
  
  function geoAsian(S, K, T, v, r, q, n) {                           // discrete geometric average, n equally spaced fixings
    const m = Math.log(S) + (r - q - v * v / 2) * T * (n + 1) / (2 * n), s2 = v * v * T * (n + 1) * (2 * n + 1) / (6 * n * n), s = Math.sqrt(s2);
    const d1 = (m - Math.log(K) + s2) / s; return Math.exp(-r * T) * (Math.exp(m + s2 / 2) * normCdf(d1) - K * normCdf(d1 - s));
  }
  function asianMC(S, K, T, v, r, q, n, N, seed = 4) {                // arithmetic average call: plain vs geometric control variate
    const R = rng(seed), dt = T / n, disc = Math.exp(-r * T), ar = [], ge = [];
    for (let i = 0; i < N; i++) { let s = S, a = 0, l = 0; for (let t = 0; t < n; t++) { s *= Math.exp((r - q - v * v / 2) * dt + v * Math.sqrt(dt) * R.n()); a += s; l += Math.log(s); } ar.push(Math.max(a / n - K, 0)); ge.push(Math.max(Math.exp(l / n) - K, 0)); }
    const mg = mean(ge), ma = mean(ar); let c = 0, d = 0; for (let i = 0; i < N; i++) { c += (ge[i] - mg) * (ar[i] - ma); d += (ge[i] - mg) ** 2; }
    const b = c / d, exact = geoAsian(S, K, T, v, r, q, n), cv = ar.map((x, i) => x - b * (ge[i] - exact / disc));
    return { plain: disc * ma, plainSE: disc * std(ar) / Math.sqrt(N), cv: disc * mean(cv), cvSE: disc * std(cv) / Math.sqrt(N), geo: exact };
  }
  
  function barrierMC(S, K, H, T, v, r, q, steps, N, seed = 6) {
    const R = rng(seed), dt = T / steps; let s0 = 0;
    for (let i = 0; i < N; i++) { let s = S, alive = true; for (let t = 0; t < steps; t++) { s *= Math.exp((r - q - v * v / 2) * dt + v * Math.sqrt(dt) * R.n()); if (s <= H) { alive = false; break; } } if (alive) s0 += Math.max(s - K, 0); }
    return Math.exp(-r * T) * s0 / N;
  }
  

  // ---------- smile models: SVI and SABR ----------
  
  
  
  
  

  // ---------- rates: Nelson-Siegel, PCA, bonds ----------
  function solve(A, b) {                                              // Gaussian elimination with pivoting
    const n = b.length, M = A.map((r, i) => [...r, b[i]]);
    for (let i = 0; i < n; i++) { let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k; [M[i], M[p]] = [M[p], M[i]]; for (let k = i + 1; k < n; k++) { const f = M[k][i] / M[i][i]; for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j]; } }
    const x = Array(n).fill(0); for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; } return x;
  }
  const nsBasis = (t, lam) => { const e = Math.exp(-t / lam), a = (1 - e) / (t / lam); return [1, a, a - e]; };
  function nsFit(years, y) {
    let best = null;
    for (let lam = 0.3; lam <= 8; lam *= 1.08) {
      const X = years.map((t) => nsBasis(t, lam)), A = [0, 1, 2].map((i) => [0, 1, 2].map((j) => X.reduce((s, r) => s + r[i] * r[j], 0))), bv = [0, 1, 2].map((i) => X.reduce((s, r, k) => s + r[i] * y[k], 0));
      let b; try { b = solve(A, bv); } catch { continue; } const sse = X.reduce((s, r, k) => s + (r[0] * b[0] + r[1] * b[1] + r[2] * b[2] - y[k]) ** 2, 0);
      if (Number.isFinite(sse) && (!best || sse < best.sse)) best = { lam, b0: b[0], b1: b[1], b2: b[2], sse };
    }
    return { ...best, rmse: Math.sqrt(best.sse / years.length), at: (t) => { const x = nsBasis(t, best.lam); return x[0] * best.b0 + x[1] * best.b1 + x[2] * best.b2; } };
  }
  function eigSym(A) {                                                // Jacobi rotations
    const n = A.length, a = A.map((r) => r.slice()), V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
    for (let sweep = 0; sweep < 60; sweep++) {
      let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] ** 2; if (off < 1e-22) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-30) continue; const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const kp = a[k][p], kq = a[k][q]; a[k][p] = c * kp - s * kq; a[k][q] = s * kp + c * kq; }
        for (let k = 0; k < n; k++) { const pk = a[p][k], qk = a[q][k]; a[p][k] = c * pk - s * qk; a[q][k] = s * pk + c * qk; }
        for (let k = 0; k < n; k++) { const kp = V[k][p], kq = V[k][q]; V[k][p] = c * kp - s * kq; V[k][q] = s * kp + c * kq; }
      }
    }
    const idx = a.map((_, i) => i).sort((i, j) => a[j][j] - a[i][i]); return { values: idx.map((i) => a[i][i]), vectors: idx.map((i) => V.map((r) => r[i])) };
  }
  function curvePCA(changes) {                                        // changes: rows = days, columns = maturities
    const n = changes.length, m = changes[0].length, mu = Array.from({ length: m }, (_, j) => mean(changes.map((r) => r[j])));
    const cov = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => changes.reduce((s, r) => s + (r[i] - mu[i]) * (r[j] - mu[j]), 0) / (n - 1)));
    const e = eigSym(cov), tot = e.values.reduce((s, x) => s + x, 0);
    const vec = e.vectors.map((v) => { const s = v.reduce((a, b) => a + b, 0); return s < 0 && Math.abs(s) > 1e-9 ? v.map((x) => -x) : v; });
    return { values: e.values, share: e.values.map((x) => x / tot), vectors: vec, cov };
  }
  
  

  // ---------- portfolios ----------
  
  
  
  
  

  // ---------- credit and valuation ----------
  
  
     // P(loss rate <= x), LGD = 1
  

  Object.assign(Risk, { rng, nelderMead, quantile, gpdFit, evtTail,     hvar, varCI, bootstrapVar,  corr, volCone,   
    halton,  mcCall,        geoAsian, asianMC,  barrierMC,      
    solve, nsFit, nsBasis, eigSym, curvePCA,          });
  if (typeof module !== 'undefined' && module.exports) module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
