'use strict';
/* Risk Hub: the calculation engine. No dependency. Runs in the browser and under Node (tests: node test-risk.js).
   Convention: a return is a plain number (-0.02 = -2%); a VaR or ES is a POSITIVE loss (0.03 = 3%). */
(function (root) {
  // ---------- distributions ----------
  function normCdf(x) {                                   // Abramowitz-Stegun 26.2.17, absolute error < 7.5e-8
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989422804014327 * Math.exp(-x * x / 2);
    const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return x >= 0 ? 1 - p : p;
  }
  const normPdf = (x) => 0.3989422804014327 * Math.exp(-x * x / 2);
  function normInv(p) {                                   // Acklam's rational approximation, relative error < 1.2e-9
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    const lo = 0.02425;
    if (p <= 0 || p >= 1) return p <= 0 ? -Infinity : Infinity;
    let q, r;
    if (p < lo) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - lo) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const chi2sf1 = (x) => 2 * (1 - normCdf(Math.sqrt(Math.max(x, 0))));   // P(chi2_1 > x)
  const chi2sf2 = (x) => Math.exp(-Math.max(x, 0) / 2);                    // P(chi2_2 > x)

  // ---------- statistics ----------
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const std = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1)); };
  function moments(a) {
    const m = mean(a), s = std(a), n = a.length, sp = Math.sqrt(a.reduce((t, x) => t + (x - m) * (x - m), 0) / n);   // skewness and kurtosis use the population std (textbook definition)
    let m3 = 0, m4 = 0;
    for (const x of a) { const z = (x - m) / sp; m3 += z ** 3; m4 += z ** 4; }
    return { mean: m, std: s, skew: m3 / n, exkurt: m4 / n - 3 };
  }

  // ---------- VaR / ES on a window of returns (losses are positive) ----------
  function historical(window, conf) {
    const s = window.slice().sort((x, y) => x - y), k = Math.max(1, Math.ceil(s.length * (1 - conf) - 1e-9));   // the 1e-9 guards against float noise: 500 * (1 - 0.99) is 5.000000000000004, not 5
    return { var: -s[k - 1], es: -mean(s.slice(0, k)) };
  }
  function normal(window, conf) {
    const { mean: m, std: s } = moments(window), z = normInv(1 - conf);
    return { var: -(m + s * z), es: -(m - s * normPdf(z) / (1 - conf)) };
  }
  function cornishFisher(window, conf) {
    const mo = moments(window), m = mo.mean, s = mo.std, N = 60, zLo = Math.min(-4, normInv((1 - conf) / (2 * N)));
    // The expansion is only a valid quantile function while it increases with z; with heavy tails (equity indices) it turns back and VaR/ES explode.
    // If it is not monotone from the far tail to the median, skew and kurtosis are shrunk together until it is (shortcut: a damped CF, not the exact tail).
    const slope = (z, sk, ek) => 1 + z * sk / 3 + (z * z - 1) * ek / 8 - (6 * z * z - 5) * sk * sk / 36;
    const ok = (sk, ek) => { for (let i = 0; i <= 40; i++) if (slope(zLo * (1 - i / 40), sk, ek) <= 0.05) return false; return true; };
    let t = 1; while (t > 0 && !ok(mo.skew * t, mo.exkurt * t)) t = Math.max(0, t - 0.05);
    const skew = mo.skew * t, exkurt = mo.exkurt * t;
    const q = (alpha) => { const z = normInv(alpha); return m + s * (z + (z * z - 1) * skew / 6 + (z ** 3 - 3 * z) * exkurt / 24 - (2 * z ** 3 - 5 * z) * skew * skew / 36); };
    let es = 0;                                                         // ES = average of the quantile over the tail (numerical integration, midpoint rule)
    for (let i = 0; i < N; i++) es += q((1 - conf) * (i + 0.5) / N);
    return { var: -q(1 - conf), es: -es / N, damp: t };
  }
  function ewma(window, conf, lambda = 0.94) {                          // RiskMetrics: exponentially weighted variance, zero mean
    let v = window.slice(0, 30).reduce((s, x) => s + x * x, 0) / 30;
    for (const x of window) v = lambda * v + (1 - lambda) * x * x;
    const z = normInv(1 - conf), s = Math.sqrt(v);
    return { var: -s * z, es: s * normPdf(z) / (1 - conf) };
  }
  // ---------- volatility models: parameters are re-fitted on every window by a coarse grid search of the Gaussian likelihood (fast, no optimiser; shortcut: the grid is coarse, refine it if precision matters) ----------
  const LAMBDAS = [0.90, 0.92, 0.94, 0.95, 0.96, 0.97, 0.98, 0.99];
  const GARCH_GRID = []; for (const a of [0.02, 0.04, 0.06, 0.08, 0.11, 0.15]) for (const b of [0.78, 0.84, 0.88, 0.91, 0.93, 0.95, 0.97]) if (a + b < 0.999) GARCH_GRID.push([a, b]);
  function volPath(window, omega, a, b) {                               // sigma^2 recursion; returns the log-likelihood, the one-step-ahead variance and the standardised residuals
    const v0 = window.reduce((s, x) => s + x * x, 0) / window.length; let v = v0, ll = 0; const z = [];
    for (const x of window) { ll -= 0.5 * (Math.log(v) + x * x / v); z.push(x / Math.sqrt(v)); v = omega + a * x * x + b * v; }
    return { ll, next: v, z, v0 };
  }
  function garchFit(window) {                                           // GARCH(1,1) with variance targeting: omega = (1 - a - b) * sample variance
    const v0 = window.reduce((s, x) => s + x * x, 0) / window.length; let best = null;
    for (const [a, b] of GARCH_GRID) { const f = volPath(window, v0 * (1 - a - b), a, b); if (!best || f.ll > best.ll) best = { ...f, a, b }; }
    return best;
  }
  function ewmaFit(window) {                                            // EWMA with lambda estimated by likelihood instead of fixed at 0.94
    let best = null;
    for (const l of LAMBDAS) { const f = volPath(window, 0, 1 - l, l); if (!best || f.ll > best.ll) best = { ...f, lambda: l }; }
    return best;
  }
  const gaussTail = (s, conf) => { const z = normInv(1 - conf); return { var: -s * z, es: s * normPdf(z) / (1 - conf) }; };
  function garch(window, conf) { const f = garchFit(window); return { ...gaussTail(Math.sqrt(f.next), conf), a: f.a, b: f.b }; }
  function ewmaMle(window, conf) { const f = ewmaFit(window); return { ...gaussTail(Math.sqrt(f.next), conf), lambda: f.lambda }; }
  function fhs(window, conf) {                                          // filtered historical simulation: GARCH volatility forecast x empirical quantile of the standardised residuals
    const f = garchFit(window), r = historical(f.z, conf), s = Math.sqrt(f.next);
    return { var: r.var * s, es: r.es * s };
  }
  function ageWeighted(window, conf, lambda = 0.98) {                  // Boudoukh-Richardson-Whitelaw: weight of an observation of age i proportional to lambda^i (newest = age 0)
    const n = window.length, alpha = 1 - conf; let tot = 0;
    const o = window.map((x, i) => { const w = Math.pow(lambda, n - 1 - i); tot += w; return [x, w]; }).sort((a, b) => a[0] - b[0]);
    let cum = 0, num = 0, v = null;
    for (const [x, w0] of o) {
      const w = Math.min(w0 / tot, alpha - cum); if (w <= 1e-15) break;
      if (v === null && cum + w0 / tot >= alpha - 1e-12) v = -x;           // VaR = loss at which the cumulated weight reaches 1 - conf
      cum += w; num += w * x;
    }
    return { var: v, es: -num / cum };
  }
  function volWeighted(window, conf) {                                  // Hull-White: each past return rescaled by (today's EWMA vol forecast / vol forecast of its own day), then plain historical simulation
    const f = volPath(window, 0, 0.06, 0.94), s = Math.sqrt(f.next);
    return historical(f.z.map((z) => z * s), conf);
  }
  const METHODS = { historical, normal, cornishFisher, ewma, ewmaMle, garch, fhs, ageWeighted, volWeighted };

  // ---------- rolling backtest ----------
  function rollingBacktest(returns, method, conf, W) {
    const fn = METHODS[method], out = { t: [], var: [], es: [], hit: [] };
    for (let t = W; t < returns.length; t++) {
      const r = fn(returns.slice(t - W, t), conf);                      // the VaR of day t only uses the past
      out.t.push(t); out.var.push(r.var); out.es.push(r.es); out.hit.push(returns[t] < -r.var ? 1 : 0);
    }
    return out;
  }

  // ---------- expected-shortfall backtest (Acerbi-Szekely Z2) ----------
  // Z2 = sum(loss_t * breach_t / ES_t) / (N p) - 1: zero if ES is right, positive if ES is too low. The p-value is simulated once under a Gaussian-tail reference (so it is approximate for fat-tailed models; the ratio is the robust number).
  const z2Cache = {};
  function z2Null(N, p) {
    const key = N + '/' + p; if (z2Cache[key]) return z2Cache[key];
    let a = 987654321; const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const zp = normInv(1 - p), esz = normPdf(zp) / p, out = [];
    for (let rep = 0; rep < 1500; rep++) { let sum = 0; for (let i = 0; i < N; i++) { const u = rnd(); if (u < p) sum += normInv(1 - u) / esz; } out.push(sum / (N * p) - 1); }
    return (z2Cache[key] = out.sort((x, y) => x - y));
  }
  function esBacktest(returns, bt, p) {
    const N = bt.t.length; let sum = 0, nb = 0, ratio = 0;
    for (let i = 0; i < N; i++) if (bt.hit[i]) { const L = -returns[bt.t[i]]; sum += L / bt.es[i]; ratio += L / bt.es[i]; nb++; }
    const z2 = sum / (N * p) - 1, null_ = z2Null(N, p), pv = null_.filter((x) => x >= z2).length / null_.length;   // one-sided: ES too low
    return { z2, p: pv, nb, ratio: nb ? ratio / nb : null };
  }

  // ---------- multi-day horizon ----------
  function horizonVar(window, conf, h) {                                // three ways to get an h-day VaR from daily data
    const base = historical(window, conf), sq = Math.sqrt(h);
    const roll = []; for (let i = 0; i + h <= window.length; i++) { let g = 1; for (let j = i; j < i + h; j++) g *= 1 + window[j]; roll.push(g - 1); }
    const hist = roll.length >= 100 ? { ...historical(roll, conf), n: roll.length } : null;                       // overlapping windows: few independent samples, hence the n
    const f = garchFit(window), omega = f.v0 * (1 - f.a - f.b);
    let a = 24681357; const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const paths = [], M = 20000;                                         // filtered simulation: residuals bootstrapped through the GARCH recursion
    for (let m = 0; m < M; m++) { let v = f.next, g = 1; for (let d = 0; d < h; d++) { const r = Math.sqrt(v) * f.z[Math.floor(rnd() * f.z.length)]; g *= 1 + r; v = omega + f.a * r * r + f.b * v; } paths.push(g - 1); }
    return { sqrt: { var: base.var * sq, es: base.es * sq }, hist, fhs: historical(paths, conf) };
  }
  // ---------- implied-volatility VaR: sigma is annualised, zero mean, normal quantile ----------
  function ivVar(sigma, days, conf, ppy = 365) { const s = sigma * Math.sqrt(days / ppy); return gaussTail(s, conf); }
  function ivBacktest(returns, iv, conf, ppy) {                         // iv[i] = implied vol known at the close before return i (null when missing)
    const out = { t: [], var: [], es: [], hit: [] };
    for (let i = 0; i < returns.length; i++) if (iv[i] > 0) { const r = ivVar(iv[i], 1, conf, ppy); out.t.push(i); out.var.push(r.var); out.es.push(r.es); out.hit.push(returns[i] < -r.var ? 1 : 0); }
    return out;
  }

  // ---------- coverage tests ----------
  const xlogy = (x, y) => (x === 0 ? 0 : x * Math.log(y));
  function kupiec(N, x, p) {                                            // proportion of failures (POF)
    const ph = x / N;
    const lr = -2 * (xlogy(N - x, 1 - p) + xlogy(x, p) - xlogy(N - x, 1 - ph) - xlogy(x, ph));
    return { lr: Math.max(lr, 0), p: chi2sf1(lr) };
  }
  function christoffersen(hits, p) {                                    // independence (LR_ind) and conditional coverage (LR_cc)
    let n00 = 0, n01 = 0, n10 = 0, n11 = 0;
    for (let i = 1; i < hits.length; i++) { const a = hits[i - 1], b = hits[i]; if (a) { b ? n11++ : n10++; } else { b ? n01++ : n00++; } }
    const x = hits.reduce((s, v) => s + v, 0), N = hits.length;
    const pi01 = n01 / Math.max(1, n00 + n01), pi11 = n11 / Math.max(1, n10 + n11), pi = (n01 + n11) / Math.max(1, n00 + n01 + n10 + n11);
    const ll1 = xlogy(n00 + n10, 1 - pi) + xlogy(n01 + n11, pi);
    const ll2 = xlogy(n00, 1 - pi01) + xlogy(n01, pi01) + xlogy(n10, 1 - pi11) + xlogy(n11, pi11);
    const ind = Math.max(-2 * (ll1 - ll2), 0), cc = kupiec(N, x, p).lr + ind;
    return { ind, pInd: chi2sf1(ind), cc, pCc: chi2sf2(cc), n: { n00, n01, n10, n11 } };
  }
  function binomCdf(N, p, x) {                                          // P(X <= x)
    let lp = N * Math.log1p(-p), cdf = Math.exp(lp);                     // log-space recursion: no underflow when N(1-p) is large
    for (let k = 0; k < x; k++) { lp += Math.log((N - k) / (k + 1) * p / (1 - p)); cdf += Math.exp(lp); }
    return Math.min(1, cdf);
  }
  function baselZone(N, x, p) {                                         // Basel "traffic light": thresholds at 95% and 99.99% of the binomial law
    const c = binomCdf(N, p, x);
    return c < 0.95 ? 'green' : c < 0.9999 ? 'yellow' : 'red';
  }

  // ---------- simulated data: GARCH(1,1) with Student-t innovations (5 d.o.f.), fixed seed ----------
  function simulate(n, seed = 20261023) {
    let a = seed >>> 0;
    const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
    const nu = 5, tdraw = () => { let c = 0; for (let i = 0; i < nu; i++) { const g = gauss(); c += g * g; } return gauss() / Math.sqrt(c / nu) * Math.sqrt((nu - 2) / nu); };  // unit variance
    const omega = 2e-6, alpha = 0.09, beta = 0.90, out = [];
    let v = omega / (1 - alpha - beta);
    for (let i = 0; i < n; i++) { const r = Math.sqrt(v) * tdraw(); out.push(r); v = omega + alpha * r * r + beta * v; }
    return out;
  }

  /** Euler decomposition of portfolio VaR / ES by holding. parts: [{w, r}] aligned return series (w sums to 1). Uses the last `win` days.
      Historical: ES_i = mean of -w_i r_i over the tail days (exact); VaR_i = VaR x share of the loss in a band of days around the quantile (shortcut: band of +-max(2,2.5% of the window) ranks, shares rescaled so the parts sum to the VaR).
      Normal: VaR_i = z w_i (Sigma w)_i / sigma_p (covariance approach, sums exactly). */
  function componentRisk(parts, conf, win) {
    const n = Math.min(win, ...parts.map((x) => x.r.length)), k = parts.length, rs = parts.map((x) => x.r.slice(-n)), w = parts.map((x) => x.w);
    const pr = Array.from({ length: n }, (_, t) => rs.reduce((s, r, i) => s + w[i] * r[t], 0)), order = pr.map((_, t) => t).sort((a, b) => pr[a] - pr[b]);
    const nt = Math.max(1, Math.ceil(n * (1 - conf) - 1e-9)), band = Math.max(2, Math.round(0.025 * n)), kq = Math.max(0, nt - 1);
    const lo = Math.max(0, kq - band), hi = Math.min(n - 1, kq + band), bandDays = order.slice(lo, hi + 1), tailDays = order.slice(0, nt);
    const h = historical(pr, conf), es = -mean(tailDays.map((t) => pr[t]));
    const bandTot = -mean(bandDays.map((t) => pr[t]));
    const mu = rs.map(mean), cov = rs.map((a, i) => rs.map((b, j) => a.reduce((s, x, t) => s + (x - mu[i]) * (b[t] - mu[j]), 0) / (n - 1)));
    const sw = cov.map((row) => row.reduce((s, c, j) => s + c * w[j], 0)), sig = Math.sqrt(w.reduce((s, x, i) => s + x * sw[i], 0)), z = normInv(conf);
    const items = parts.map((x, i) => ({
      w: w[i],
      hist: bandTot > 0 ? h.var * (-mean(bandDays.map((t) => w[i] * rs[i][t]))) / bandTot : 0,
      histEs: -mean(tailDays.map((t) => w[i] * rs[i][t])),
      norm: sig > 0 ? z * w[i] * sw[i] / sig : 0,
      vol: Math.sqrt(cov[i][i])}));
    for (const [i, it] of items.entries()) it.alone = w[i] * historical(rs[i], conf).var;   // the holding's own VaR (undiversified)
    return { n, items, hist: h.var, es, norm: z * sig, sigma: sig, corr: cov.map((row, i) => row.map((c, j) => c / Math.sqrt(cov[i][i] * cov[j][j]))) };
  }

  const api = { componentRisk, normCdf, normInv, normPdf, chi2sf1, chi2sf2, mean, std, moments, historical, normal, cornishFisher, ewma, ewmaMle, garch, fhs, ageWeighted, volWeighted, garchFit, ewmaFit, esBacktest, horizonVar, ivVar, ivBacktest, METHODS, rollingBacktest, kupiec, christoffersen, binomCdf, baselZone, simulate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Risk = api;
})(typeof window !== 'undefined' ? window : globalThis);
