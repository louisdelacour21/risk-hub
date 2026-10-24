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
  function hill(losses, kmax) {                                     // Hill estimator of the tail index alpha for k = 5..kmax
    const s = losses.filter((x) => x > 0).sort((a, b) => b - a), out = []; let acc = 0;
    for (let k = 1; k <= kmax && k < s.length; k++) { acc += Math.log(s[k - 1]); if (k >= 5) out.push({ k, alpha: 1 / (acc / k - Math.log(s[k])) }); }
    return out;
  }
  function meanExcess(losses, n = 40) {
    const s = losses.slice().sort((a, b) => a - b), out = [];
    for (let j = 0; j < n; j++) { const u = quantile(s, 0.8 + 0.18 * j / (n - 1)), ex = s.filter((x) => x > u); if (ex.length >= 10) out.push({ u, e: mean(ex) - u }); }
    return out;
  }
  const qqPoints = (r) => { const s = r.slice().sort((a, b) => a - b), m = mean(r), sd = std(r), n = s.length; return s.map((x, i) => ({ t: normInv((i + 0.5) / n), z: (x - m) / sd })); };
  const tPdf = (x, v) => { const lg = (z) => { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = z, t = z + 5.5; t -= (z + 0.5) * Math.log(t); let s = 1.000000000190015; for (const k of c) s += k / ++y; return -t + Math.log(2.5066282746310005 * s / z); }; return Math.exp(lg((v + 1) / 2) - lg(v / 2)) / Math.sqrt(v * PI) * Math.pow(1 + x * x / v, -(v + 1) / 2); };

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
  function ewmaCorr(x, y, lambda = 0.94) {
    let sxx = x[0] * x[0], syy = y[0] * y[0], sxy = x[0] * y[0]; const out = [];
    for (let i = 1; i < x.length; i++) { sxx = lambda * sxx + (1 - lambda) * x[i] * x[i]; syy = lambda * syy + (1 - lambda) * y[i] * y[i]; sxy = lambda * sxy + (1 - lambda) * x[i] * y[i]; out.push(sxy / Math.sqrt(sxx * syy)); }
    return out;
  }
  const corr = (x, y) => { const mx = mean(x), my = mean(y); let a = 0, b = 0, c = 0; for (let i = 0; i < x.length; i++) { a += (x[i] - mx) * (y[i] - my); b += (x[i] - mx) ** 2; c += (y[i] - my) ** 2; } return a / Math.sqrt(b * c); };
  function volCone(r, ppy = 252, windows = [5, 10, 21, 42, 63, 126, 252]) {
    return windows.filter((w) => r.length > w * 2).map((w) => {
      const v = []; for (let i = w; i <= r.length; i += 1) v.push(std(r.slice(i - w, i)) * Math.sqrt(ppy));
      return { w, now: v[v.length - 1], min: Math.min(...v), p25: quantile(v, 0.25), med: quantile(v, 0.5), p75: quantile(v, 0.75), max: Math.max(...v) };
    });
  }
  function ratios(r, bench, ppy = 252, rf = 0) {
    const n = r.length, rfd = rf / ppy, ex = r.map((x) => x - rfd), mu = mean(ex) * ppy, sd = std(r) * Math.sqrt(ppy);
    const dd = Math.sqrt(ex.reduce((s, x) => s + Math.min(x, 0) ** 2, 0) / n) * Math.sqrt(ppy);
    let peak = 1, v = 1, mdd = 0; for (const x of r) { v *= 1 + x; peak = Math.max(peak, v); mdd = Math.max(mdd, 1 - v / peak); }
    const cagr = Math.pow(v, ppy / n) - 1, up = r.filter((x) => x > rfd).reduce((s, x) => s + x - rfd, 0), dn = r.filter((x) => x < rfd).reduce((s, x) => s + rfd - x, 0);
    const o = { ann: mean(r) * ppy, cagr, vol: sd, sharpe: mu / sd, sortino: mu / dd, calmar: mdd > 0 ? cagr / mdd : NaN, mdd, omega: dn > 0 ? up / dn : NaN };
    if (bench) { const reg = regress(r, bench), te = std(r.map((x, i) => x - bench[i])) * Math.sqrt(ppy); Object.assign(o, { beta: reg.beta, alpha: reg.alpha * ppy, r2: reg.r2, treynor: reg.beta ? mu / reg.beta : NaN, te, info: te ? (mean(r.map((x, i) => x - bench[i])) * ppy) / te : NaN }); }
    return o;
  }
  function regress(y, x) {
    const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
    const beta = sxy / sxx, alpha = my - beta * mx; return { beta, alpha, r2: sxy * sxy / (sxx * syy) };
  }
  function rollingBeta(y, x, w = 126) { const o = []; for (let i = w; i <= y.length; i++) o.push(regress(y.slice(i - w, i), x.slice(i - w, i)).beta); return o; }

  // ---------- Monte Carlo ----------
  function halton(i, base) { let f = 1, r = 0; while (i > 0) { f /= base; r += f * (i % base); i = Math.floor(i / base); } return r; }
  function gbmPaths(S0, mu, sigma, T, steps, n, seed = 3, antithetic = false) {
    const R = rng(seed), dt = T / steps, out = [];
    for (let p = 0; p < n; p++) {
      const z = Array.from({ length: steps }, () => R.n());
      for (const sgn of antithetic ? [1, -1] : [1]) { let s = S0; const path = [s]; for (let t = 0; t < steps; t++) { s *= Math.exp((mu - sigma * sigma / 2) * dt + sigma * Math.sqrt(dt) * sgn * z[t]); path.push(s); } out.push(path); }
    }
    return out;
  }
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
  function mertonPrice(S, K, T, v, r, q, lam, muJ, dJ, type = 'C') {
    const kap = Math.exp(muJ + dJ * dJ / 2) - 1, lp = lam * (1 + kap); let p = 0, w = Math.exp(-lp * T), fact = 1;
    for (let n = 0; n < 60; n++) {
      if (n) { w *= lp * T / n; fact = 1; }
      const vn = Math.sqrt(v * v + n * dJ * dJ / T), rn = r - lam * kap + n * Math.log(1 + kap) / T;
      p += w * Risk.bs(S, K, T, vn, rn, q, type).price; if (w < 1e-14 && n > lp * T) break;
    }
    return p;
  }
  function mertonPaths(S0, mu, v, lam, muJ, dJ, T, steps, n, seed = 5) {
    const R = rng(seed), dt = T / steps, kap = Math.exp(muJ + dJ * dJ / 2) - 1, out = [], term = [];
    const pois = (m) => { const L = Math.exp(-m); let k = 0, p = 1; do { k++; p *= R.u(); } while (p > L); return k - 1; };
    for (let i = 0; i < n; i++) { let s = S0; const path = [s]; for (let t = 0; t < steps; t++) { let x = (mu - lam * kap - v * v / 2) * dt + v * Math.sqrt(dt) * R.n(); const k = pois(lam * dt); for (let j = 0; j < k; j++) x += muJ + dJ * R.n(); s *= Math.exp(x); path.push(s); } if (i < 40) out.push(path); term.push(Math.log(s / S0)); }
    return { paths: out, term };
  }

  // ---------- Heston ----------
  const C = { add: (a, b) => [a[0] + b[0], a[1] + b[1]], sub: (a, b) => [a[0] - b[0], a[1] - b[1]], mul: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]],
    div: (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; }, exp: (a) => { const e = Math.exp(a[0]); return [e * Math.cos(a[1]), e * Math.sin(a[1])]; },
    log: (a) => [Math.log(Math.hypot(a[0], a[1])), Math.atan2(a[1], a[0])], sqrt: (a) => { const m = Math.hypot(a[0], a[1]), re = Math.sqrt((m + a[0]) / 2), im = Math.sqrt(Math.max((m - a[0]) / 2, 0)); return [re, a[1] < 0 ? -im : im]; }, k: (a, s) => [a[0] * s, a[1] * s] };
  function hestonCF(u, p, S, T, r, q) {                              // E[exp(i u ln S_T)] under Heston (Albrecht "little trap" form), u complex
    const { v0, kappa, theta, xi, rho } = p, iu = C.mul([0, 1], u), a = C.sub([kappa, 0], C.k(iu, rho * xi));
    const d = C.sqrt(C.add(C.mul(a, a), C.k(C.add(iu, C.mul(u, u)), xi * xi))), g = C.div(C.sub(a, d), C.add(a, d)), edt = C.exp(C.k(d, -T));
    const one = [1, 0], den = C.sub(one, C.mul(g, edt)), lg = C.log(C.div(den, C.sub(one, g)));
    const Cc = C.add(C.k(iu, (r - q) * T), C.k(C.sub(C.k(C.sub(a, d), T), C.k(lg, 2)), kappa * theta / (xi * xi)));
    const D = C.mul(C.k(C.sub(a, d), 1 / (xi * xi)), C.div(C.sub(one, edt), den));
    return C.exp(C.add(C.add(Cc, C.k(D, v0)), C.mul(iu, [Math.log(S), 0])));
  }
  function hestonCall(S, K, T, r, q, p) {
    const lk = Math.log(K), phi1 = hestonCF([0, -1], p, S, T, r, q), h = 0.08, U = 160; let i1 = 0, i2 = 0;
    for (let u = h / 2; u < U; u += h) {
      const e = [Math.cos(-u * lk), Math.sin(-u * lk)], f2 = C.div(C.mul(e, hestonCF([u, 0], p, S, T, r, q)), [0, u]), f1 = C.div(C.mul(e, C.div(hestonCF([u, -1], p, S, T, r, q), phi1)), [0, u]);
      i1 += f1[0]; i2 += f2[0];
    }
    const P1 = 0.5 + h * i1 / PI, P2 = 0.5 + h * i2 / PI;
    return Math.max(S * Math.exp(-q * T) * P1 - K * Math.exp(-r * T) * P2, 0);
  }
  function hestonPaths(S0, r, q, p, T, steps, n, seed = 11) {         // Euler with full truncation
    const R = rng(seed), dt = T / steps, out = [];
    for (let i = 0; i < n; i++) { let s = S0, v = p.v0; const ps = [s], vs = [v];
      for (let t = 0; t < steps; t++) { const z1 = R.n(), z2 = p.rho * z1 + Math.sqrt(1 - p.rho * p.rho) * R.n(), vp = Math.max(v, 0); s *= Math.exp((r - q - vp / 2) * dt + Math.sqrt(vp * dt) * z1); v += p.kappa * (p.theta - vp) * dt + p.xi * Math.sqrt(vp * dt) * z2; ps.push(s); vs.push(Math.max(v, 0)); }
      out.push({ s: ps, v: vs }); }
    return out;
  }

  // ---------- mean reversion ----------
  function ouSim(x0, kappa, mu, sigma, dt, n, seed = 9) {
    const R = rng(seed), b = Math.exp(-kappa * dt), sd = sigma * Math.sqrt((1 - b * b) / (2 * kappa)), x = [x0];
    for (let i = 1; i < n; i++) x.push(mu + (x[i - 1] - mu) * b + sd * R.n()); return x;
  }
  function ouFit(x, dt = 1) {                                         // exact maximum likelihood = AR(1) regression
    const reg = regress(x.slice(1), x.slice(0, -1)), b = reg.beta;
    if (!(b > 0 && b < 1)) return { kappa: NaN, mu: NaN, sigma: NaN, half: Infinity, b };
    const kappa = -Math.log(b) / dt, mu = reg.alpha / (1 - b), res = x.slice(1).map((v, i) => v - reg.alpha - b * x[i]);
    return { kappa, mu, sigma: std(res) * Math.sqrt(2 * kappa / (1 - b * b)), half: Math.log(2) / kappa, b };
  }

  // ---------- options: trees, exotics ----------
  function crr(S, K, T, v, r, q, type, N, american) {
    const dt = T / N, u = Math.exp(v * Math.sqrt(dt)), d = 1 / u, p = (Math.exp((r - q) * dt) - d) / (u - d), disc = Math.exp(-r * dt), sg = type === 'C' ? 1 : -1;
    const val = Array.from({ length: N + 1 }, (_, j) => Math.max(sg * (S * Math.pow(u, N - j) * Math.pow(d, j) - K), 0));
    for (let i = N - 1; i >= 0; i--) for (let j = 0; j <= i; j++) { let x = disc * (p * val[j] + (1 - p) * val[j + 1]); if (american) x = Math.max(x, sg * (S * Math.pow(u, i - j) * Math.pow(d, j) - K)); val[j] = x; }
    return val[0];
  }
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
  function downOutCall(S, K, H, T, v, r, q) {                         // continuous barrier H <= K (Reiner-Rubinstein)
    if (S <= H) return 0; const sq = v * Math.sqrt(T), lam = (r - q + v * v / 2) / (v * v), y = Math.log(H * H / (S * K)) / sq + lam * sq;
    const di = S * Math.exp(-q * T) * Math.pow(H / S, 2 * lam) * normCdf(y) - K * Math.exp(-r * T) * Math.pow(H / S, 2 * lam - 2) * normCdf(y - sq);
    return Risk.bs(S, K, T, v, r, q, 'C').price - di;
  }
  function barrierMC(S, K, H, T, v, r, q, steps, N, seed = 6) {
    const R = rng(seed), dt = T / steps; let s0 = 0;
    for (let i = 0; i < N; i++) { let s = S, alive = true; for (let t = 0; t < steps; t++) { s *= Math.exp((r - q - v * v / 2) * dt + v * Math.sqrt(dt) * R.n()); if (s <= H) { alive = false; break; } } if (alive) s0 += Math.max(s - K, 0); }
    return Math.exp(-r * T) * s0 / N;
  }
  const greeks2 = (S, K, T, v, r, q) => { const sq = Math.sqrt(T), d1 = (Math.log(S / K) + (r - q + v * v / 2) * T) / (v * sq), d2 = d1 - v * sq, eq = Math.exp(-q * T), vega = S * eq * normPdf(d1) * sq; return { vanna: -eq * normPdf(d1) * d2 / v, volga: vega * d1 * d2 / v, vega }; };

  // ---------- smile models: SVI and SABR ----------
  const sviW = (k, p) => p.a + p.b * (p.rho * (k - p.m) + Math.sqrt((k - p.m) ** 2 + p.s * p.s));
  function sviFit(pts, T) {                                           // pts: [{k: ln(K/F), iv}]
    const w = pts.map((p) => p.iv * p.iv * T), unpack = ([a, lb, tr, m, ls]) => ({ a, b: Math.exp(lb), rho: Math.tanh(tr), m, s: Math.exp(ls) });
    const loss = (x) => { const p = unpack(x); if (p.b * p.s * Math.sqrt(1 - p.rho * p.rho) < 0 && false) return 1e9; let e = 0; pts.forEach((pt, i) => { const d = sviW(pt.k, p) - w[i]; e += d * d; }); const mn = p.a + p.b * p.s * Math.sqrt(1 - p.rho * p.rho); return e + (mn < 0 ? 1e3 * mn * mn : 0); };
    let best = null; for (const st of [[Math.min(...w) * 0.5, Math.log(0.1), -0.3, 0, Math.log(0.1)], [Math.min(...w) * 0.8, Math.log(0.3), -0.6, 0.05, Math.log(0.2)], [Math.min(...w) * 0.2, Math.log(0.05), 0, -0.05, Math.log(0.05)]]) { const r = nelderMead(loss, st, 0.3, 1500); if (!best || r.f < best.f) best = r; }
    const p = unpack(best.x); return { ...p, rmse: Math.sqrt(best.f / pts.length), vol: (k) => Math.sqrt(Math.max(sviW(k, p), 1e-10) / T) };
  }
  function sabrVol(F, K, T, al, be, rho, nu) {
    const lo = Math.log(F / K), fk = Math.pow(F * K, (1 - be) / 2), c1 = (1 - be) ** 2 / 24 * al * al / Math.pow(F * K, 1 - be) + rho * be * nu * al / (4 * fk) + (2 - 3 * rho * rho) * nu * nu / 24;
    if (Math.abs(lo) < 1e-9) return al / Math.pow(F, 1 - be) * (1 + c1 * T);
    const z = nu / al * fk * lo, x = Math.log((Math.sqrt(1 - 2 * rho * z + z * z) + z - rho) / (1 - rho));
    return al / (fk * (1 + (1 - be) ** 2 / 24 * lo * lo + (1 - be) ** 4 / 1920 * lo ** 4)) * (Math.abs(x) < 1e-12 ? 1 : z / x) * (1 + c1 * T);
  }
  function sabrFit(pts, F, T, be) {
    const atm = pts.reduce((b, p) => (Math.abs(p.k) < Math.abs(b.k) ? p : b), pts[0]).iv, al0 = atm * Math.pow(F, 1 - be);
    const unpack = ([la, tr, ln]) => [Math.exp(la), Math.tanh(tr), Math.exp(ln)], loss = (x) => { const [al, rho, nu] = unpack(x); let e = 0; for (const p of pts) { const d = sabrVol(F, F * Math.exp(p.k), T, al, be, rho, nu) - p.iv; e += d * d; } return Number.isFinite(e) ? e : 1e9; };
    let best = null; for (const st of [[Math.log(al0), -0.3, Math.log(0.8)], [Math.log(al0), 0, Math.log(0.4)], [Math.log(al0), -0.6, Math.log(1.5)]]) { const r = nelderMead(loss, st, 0.3, 800); if (!best || r.f < best.f) best = r; }
    const [al, rho, nu] = unpack(best.x); return { al, rho, nu, beta: be, rmse: Math.sqrt(best.f / pts.length), vol: (K) => sabrVol(F, K, T, al, be, rho, nu) };
  }
  function density(volAt, F, T, lo = 0.55, hi = 1.6, n = 120) {         // Breeden-Litzenberger: f(K) = d2C/dK2 (rate 0, forward as underlying)
    const h = F * (hi - lo) / n, ks = Array.from({ length: n + 1 }, (_, i) => F * lo + i * h), c = ks.map((K) => Risk.bs(F, K, T, volAt(K), 0, 0, 'C').price), f = [];
    for (let i = 1; i < n; i++) f.push((c[i - 1] - 2 * c[i] + c[i + 1]) / (h * h)); return { k: ks.slice(1, n), f };
  }

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
  function bondPrice(face, cpn, y, years, freq) {
    const n = Math.round(years * freq), c = face * cpn / freq; let p = 0, t1 = 0, t2 = 0;
    for (let k = 1; k <= n; k++) { const cf = c + (k === n ? face : 0), df = Math.pow(1 + y / freq, -k); p += cf * df; t1 += (k / freq) * cf * df; t2 += (k / freq) * (k / freq + 1 / freq) * cf * df; }
    const mac = t1 / p, mod = mac / (1 + y / freq), conv = t2 / p / Math.pow(1 + y / freq, 2);
    return { price: p, mac, mod, conv, dv01: mod * p / 1e4 };
  }
  function bondYtm(price, face, cpn, years, freq) { let a = -0.5, b = 1; for (let i = 0; i < 200; i++) { const m = (a + b) / 2; (bondPrice(face, cpn, m, years, freq).price > price ? (a = m) : (b = m)); } return (a + b) / 2; }

  // ---------- portfolios ----------
  function covMatrix(cols, ppy = 252) { const m = cols.map(mean); return cols.map((a, i) => cols.map((b, j) => { let s = 0; for (let t = 0; t < a.length; t++) s += (a[t] - m[i]) * (b[t] - m[j]); return s / (a.length - 1) * ppy; })); }
  const pvar = (w, S) => w.reduce((s, wi, i) => s + wi * w.reduce((t, wj, j) => t + wj * S[i][j], 0), 0);
  function dirichlet(n, R) { const g = Array.from({ length: n }, () => -Math.log(R.u() + 1e-12)), s = g.reduce((a, b) => a + b, 0); return g.map((x) => x / s); }
  function optimise(mu, S, mode, seed = 2) {                          // long-only: 'minvar' or 'sharpe' by random search + hill climbing
    const R = rng(seed), n = mu.length, score = (w) => (mode === 'minvar' ? -pvar(w, S) : (w.reduce((s, x, i) => s + x * mu[i], 0)) / Math.sqrt(pvar(w, S)));
    let best = null, bs = -Infinity; for (let i = 0; i < 4000; i++) { const w = dirichlet(n, R), s = score(w); if (s > bs) { bs = s; best = w; } }
    for (let step = 0.1; step > 1e-4; step *= 0.7) for (let it = 0; it < 60; it++) { const w = best.slice(), i = Math.floor(R.u() * n), j = Math.floor(R.u() * n); if (i === j) continue; const d = Math.min(step * R.u(), w[j]); w[i] += d; w[j] -= d; const s = score(w); if (s > bs) { bs = s; best = w; } }
    return best;
  }
  function riskParity(S, it = 400) { const n = S.length; let w = Array(n).fill(1 / n); for (let k = 0; k < it; k++) { const mrc = S.map((r) => r.reduce((s, x, j) => s + x * w[j], 0)), rc = w.map((x, i) => x * mrc[i]), t = rc.reduce((a, b) => a + b, 0) / n; w = w.map((x, i) => x * Math.pow(t / rc[i], 0.5)); const s = w.reduce((a, b) => a + b, 0); w = w.map((x) => x / s); } return w; }

  // ---------- credit and valuation ----------
  const irbRho = (pd) => { const f = (1 - Math.exp(-50 * pd)) / (1 - Math.exp(-50)); return 0.12 * f + 0.24 * (1 - f); };
  const irbK = (pd, lgd, rho, conf = 0.999) => lgd * (normCdf((normInv(pd) + Math.sqrt(rho) * normInv(conf)) / Math.sqrt(1 - rho)) - pd);
  const vasicekCdf = (x, pd, rho) => normCdf((Math.sqrt(1 - rho) * normInv(x) - normInv(pd)) / Math.sqrt(rho));   // P(loss rate <= x), LGD = 1
  function dcf(f0, g1, years, gT, wacc, net = 0, shares = 1) {
    let pv = 0, f = f0; const rows = [];
    for (let t = 1; t <= years; t++) { f *= 1 + g1; const d = f / Math.pow(1 + wacc, t); pv += d; rows.push({ t, f, d }); }
    const tv = f * (1 + gT) / (wacc - gT), pvTv = tv / Math.pow(1 + wacc, years), ev = pv + pvTv;
    return { ev, pv, tv, pvTv, share: pvTv / ev, equity: ev - net, perShare: (ev - net) / shares, rows };
  }

  Object.assign(Risk, { rng, nelderMead, quantile, gpdFit, evtTail, hill, meanExcess, qqPoints, tPdf, hvar, varCI, bootstrapVar, ewmaCorr, corr, volCone, ratios, regress, rollingBeta,
    halton, gbmPaths, mcCall, mertonPrice, mertonPaths, hestonCall, hestonPaths, ouSim, ouFit, crr, geoAsian, asianMC, downOutCall, barrierMC, greeks2, sviFit, sviW, sabrVol, sabrFit, density,
    solve, nsFit, nsBasis, eigSym, curvePCA, bondPrice, bondYtm, covMatrix, pvar, optimise, riskParity, irbRho, irbK, vasicekCdf, dcf });
  if (typeof module !== 'undefined' && module.exports) module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
