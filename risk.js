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
     // P(chi2_1 > x)
                      // P(chi2_2 > x)

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
  

  // ---------- expected-shortfall backtest (Acerbi-Szekely Z2) ----------
  // Z2 = sum(loss_t * breach_t / ES_t) / (N p) - 1: zero if ES is right, positive if ES is too low. The p-value is simulated once under a Gaussian-tail reference (so it is approximate for fat-tailed models; the ratio is the robust number).
  
  
  

  // ---------- multi-day horizon ----------
  
  // ---------- implied-volatility VaR: sigma is annualised, zero mean, normal quantile ----------
  
  

  // ---------- coverage tests ----------
  
  
  
  function binomCdf(N, p, x) {                                          // P(X <= x)
    let lp = N * Math.log1p(-p), cdf = Math.exp(lp);                     // log-space recursion: no underflow when N(1-p) is large
    for (let k = 0; k < x; k++) { lp += Math.log((N - k) / (k + 1) * p / (1 - p)); cdf += Math.exp(lp); }
    return Math.min(1, cdf);
  }
  

  // ---------- simulated data: GARCH(1,1) with Student-t innovations (5 d.o.f.), fixed seed ----------
  

  /** Euler decomposition of portfolio VaR / ES by holding. parts: [{w, r}] aligned return series (w sums to 1). Uses the last `win` days.
      Historical: ES_i = mean of -w_i r_i over the tail days (exact); VaR_i = VaR x share of the loss in a band of days around the quantile (shortcut: band of +-max(2,2.5% of the window) ranks, shares rescaled so the parts sum to the VaR).
      Normal: VaR_i = z w_i (Sigma w)_i / sigma_p (covariance approach, sums exactly). */
  

  const api = {  normCdf, normInv, normPdf,   mean, std, moments, historical, normal, cornishFisher, ewma, ewmaMle, garch, fhs, ageWeighted, volWeighted, garchFit, ewmaFit,     METHODS,    binomCdf,  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Risk = api;
})(typeof window !== 'undefined' ? window : globalThis);
