'use strict';
/* Econometrics: OLS with the usual diagnostics, unit-root and cointegration tests, AR / ARMA, GARCH / GJR by maximum likelihood, Granger causality.
   Pure functions, no DOM, tested under Node (test-eco.js) and against statsmodels / arch (tools/verify_eco.py). Extends Risk (after quant.js). */
(function (root) {
  const Risk = root.Risk || require('./quant.js');
  const { mean, nelderMead, solve } = Risk, PI = Math.PI;

  // ---------- special functions: Student t, chi-square and F tails ----------
  const lgamma = (x) => {                                             // Lanczos
    const c = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(PI / Math.sin(PI * x)) - lgamma(1 - x);
    x -= 1; let a = 0.99999999999980993; const t = x + 7.5; for (let i = 0; i < 8; i++) a += c[i] / (x + i + 1);
    return 0.5 * Math.log(2 * PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  };
  function betacf(a, b, x) {                                          // continued fraction of the incomplete beta (Lentz)
    const tiny = 1e-300; let c = 1, d = 1 - (a + b) * x / (a + 1); if (Math.abs(d) < tiny) d = tiny; d = 1 / d; let h = d;
    for (let m = 1; m <= 300; m++) {
      const m2 = 2 * m; let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny; c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny; d = 1 / d; h *= d * c;
      aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
      d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny; c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny; d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-14) break;
    }
    return h;
  }
  const ibeta = (x, a, b) => {                                        // regularised incomplete beta I_x(a, b)
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  };
  const tTwoSided = (t, df) => ibeta(df / (df + t * t), df / 2, 0.5);              // P(|T| > |t|)
  const fSf = (f, d1, d2) => (f <= 0 ? 1 : ibeta(d2 / (d2 + d1 * f), d2 / 2, d1 / 2));
  function gammaQ(a, x) {                                             // upper regularised gamma Q(a, x)
    if (x <= 0) return 1;
    if (x < a + 1) { let s = 1 / a, t = s; for (let n = 1; n < 500; n++) { t *= x / (a + n); s += t; if (t < s * 1e-15) break; } return 1 - s * Math.exp(-x + a * Math.log(x) - lgamma(a)); }
    let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
    for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-14) break; }
    return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
  }
  const chi2Sf = (x, k) => gammaQ(k / 2, x / 2);

  // ---------- OLS ----------
  const inv = (A) => { const n = A.length, cols = Array.from({ length: n }, (_, j) => solve(A, Array.from({ length: n }, (_, i) => (i === j ? 1 : 0)))); return A.map((_, i) => cols.map((c) => c[i])); };
  const matmul = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, x, k) => s + x * B[k][j], 0)));
  function ols(y, cols, o = {}) {                                     // cols = array of regressor columns; an intercept is added first unless o.intercept === false
    const n = y.length, ic = o.intercept !== false, X = Array.from({ length: n }, (_, t) => (ic ? [1] : []).concat(cols.map((c) => c[t]))), k = X[0].length;
    const XtX = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => { let s = 0; for (let t = 0; t < n; t++) s += X[t][i] * X[t][j]; return s; }));
    const Xty = Array.from({ length: k }, (_, i) => { let s = 0; for (let t = 0; t < n; t++) s += X[t][i] * y[t]; return s; });
    const A = inv(XtX), beta = A.map((r) => r.reduce((s, a, j) => s + a * Xty[j], 0)), e = y.map((v, t) => v - X[t].reduce((s, x, j) => s + x * beta[j], 0));
    const sse = e.reduce((s, x) => s + x * x, 0), my = mean(y), sst = ic ? y.reduce((s, v) => s + (v - my) ** 2, 0) : y.reduce((s, v) => s + v * v, 0), df = n - k, s2 = sse / df;
    const seC = A.map((r, i) => Math.sqrt(s2 * r[i]));
    const sandwich = (S) => { const M = matmul(matmul(A, S), A); return M.map((r, i) => Math.sqrt(Math.max(r[i], 0))); };
    const meat = (L) => {                                             // sum of x_t x_s' e_t e_s with Bartlett weights (L = 0: White)
      const S = Array.from({ length: k }, () => Array(k).fill(0));
      for (let l = 0; l <= L; l++) {
        const w = l === 0 ? 1 : 1 - l / (L + 1);
        for (let t = l; t < n; t++) { const f = e[t] * e[t - l] * w; for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) { const v = f * X[t][i] * X[t - l][j]; S[i][j] += v; if (l > 0) S[j][i] += v; } }
      }
      return S;
    };
    const L = o.nw ?? Math.floor(4 * Math.pow(n / 100, 2 / 9)), wantRob = o.robust === 'hc1' || o.robust === 'hac' || o.allSe, seW = wantRob ? sandwich(meat(0).map((r) => r.map((x) => x * n / df))) : seC, seH = wantRob ? sandwich(meat(L)) : seC;   // robust errors are O(n·k²·L): skipped unless asked (ADF runs dozens of fits)
    const se = o.robust === 'hc1' ? seW : o.robust === 'hac' ? seH : seC, r2 = 1 - sse / sst, F = ic && k > 1 ? (r2 / (k - 1)) / ((1 - r2) / df) : NaN;
    let dw = 0; for (let t = 1; t < n; t++) dw += (e[t] - e[t - 1]) ** 2; dw /= sse;
    const ll = -0.5 * n * (Math.log(2 * PI) + Math.log(sse / n) + 1);
    return { n, k, beta, se, seClassic: seC, seHC1: seW, seHAC: seH, nwLags: L, t: beta.map((b, i) => b / se[i]), p: beta.map((b, i) => tTwoSided(b / se[i], df)), r2, adjR2: 1 - (1 - r2) * (n - (ic ? 1 : 0)) / df, F, pF: Number.isFinite(F) ? fSf(F, k - 1, df) : NaN, dw, e, sse, s2, df, aic: -2 * ll + 2 * k, bic: -2 * ll + k * Math.log(n), ll };
  }
  function breuschPagan(res, cols) {                                  // Koenker form: n * R2 of e^2 on the regressors, chi-square with k - 1 degrees of freedom
    const a = ols(res.e.map((x) => x * x), cols), lm = res.n * a.r2; return { lm, p: chi2Sf(lm, cols.length), df: cols.length };
  }

  // ---------- unit root and cointegration ----------
  const CV = { c: [-3.43, -2.86, -2.57], ct: [-3.96, -3.41, -3.13], n: [-2.57, -1.94, -1.62] };   // MacKinnon asymptotic 1 / 5 / 10 %
  const CV_EG = { 2: [-3.90, -3.34, -3.04], 3: [-4.29, -3.74, -3.45], 4: [-4.64, -4.10, -3.81] };
  function adfReg(y, p, trend, start) {                               // dy_t = a (+ b t) + g y_{t-1} + sum phi_i dy_{t-i} + e_t, observations t >= start
    const dy = y.slice(1).map((v, i) => v - y[i]), Y = [], cols = [[]].concat(Array.from({ length: p }, () => []), trend === 'ct' ? [[]] : []);
    for (let t = start; t < dy.length; t++) { Y.push(dy[t]); cols[0].push(y[t]); for (let i = 1; i <= p; i++) cols[i].push(dy[t - i]); if (trend === 'ct') cols[p + 1].push(t); }
    return ols(Y, cols, { intercept: trend !== 'n' });
  }
  function adf(y, o = {}) {                                           // o.lags: fixed number, or 'aic' (default) up to o.maxLag
    const trend = o.trend || 'c', n = y.length, maxLag = o.maxLag ?? Math.ceil(12 * Math.pow(n / 100, 0.25));
    let p = typeof o.lags === 'number' ? o.lags : 0, table = null;
    if (typeof o.lags !== 'number') { table = []; for (let q = 0; q <= maxLag; q++) table.push({ p: q, aic: adfReg(y, q, trend, maxLag).aic }); p = table.reduce((a, b) => (b.aic < a.aic ? b : a)).p; }
    const r = adfReg(y, p, trend, p), gi = trend === 'n' ? 0 : 1, stat = r.t[gi], cv = o.cv || CV[trend];
    return { stat, p, gamma: r.beta[gi], rho: 1 + r.beta[gi], cv, reject5: stat < cv[1], n: r.n, table };
  }
  function engleGranger(y, xs) {                                      // y on the xs with a constant, then ADF (no constant) on the residual
    const r = ols(y, xs), a = adf(r.e, { trend: 'n', lags: 'aic', cv: CV_EG[Math.min(xs.length + 1, 4)] }), ar = ols(r.e.slice(1), [r.e.slice(0, -1)], { intercept: false }), phi = ar.beta[0];
    return { beta: r.beta, spread: r.e, adf: a, phi, halfLife: phi > 0 && phi < 1 ? -Math.log(2) / Math.log(phi) : Infinity, r2: r.r2 };
  }

  // ---------- AR and ARMA ----------
  function acf(x, K) { const m = mean(x), d = x.map((v) => v - m), g0 = d.reduce((a, b) => a + b * b, 0); return Array.from({ length: K }, (_, k) => { let s = 0; for (let i = k + 1; i < x.length; i++) s += d[i] * d[i - k - 1]; return s / g0; }); }
  function pacf(x, K) {                                               // Durbin-Levinson
    const r = [1, ...acf(x, K)], out = []; let phi = [];
    for (let k = 1; k <= K; k++) {
      const num = r[k] - phi.reduce((s, p, j) => s + p * r[k - 1 - j], 0), den = 1 - phi.reduce((s, p, j) => s + p * r[j + 1], 0), a = num / den;
      phi = phi.map((p, j) => p - a * phi[k - 2 - j]).concat(a); out.push(a);
    }
    return out;
  }
  function arFit(y, p) {                                              // OLS with an intercept
    const cols = Array.from({ length: p }, (_, i) => y.slice(p - 1 - i, y.length - 1 - i)), r = ols(y.slice(p), cols);
    return { p, c: r.beta[0], phi: r.beta.slice(1), se: r.se, e: r.e, aic: r.aic, bic: r.bic, s2: r.s2 };
  }
  function arSelect(y, pmax) {                                        // same estimation sample for every order, so the criteria are comparable
    return Array.from({ length: pmax + 1 }, (_, p) => { const r = ols(y.slice(pmax), Array.from({ length: p }, (_, i) => y.slice(pmax - 1 - i, y.length - 1 - i))); return { p, aic: r.aic, bic: r.bic, phi: r.beta.slice(1) }; });
  }
  function armaCss(y, p, q) {                                         // conditional sum of squares: e_t = y_t - c - sum phi y_{t-i} - sum theta e_{t-j}
    const m = mean(y), z = y.map((v) => v - m), n = z.length, css = (b) => {
      const phi = b.slice(0, p), th = b.slice(p, p + q), e = Array(n).fill(0); let s = 0;
      for (let t = p; t < n; t++) { let f = z[t]; for (let i = 0; i < p; i++) f -= phi[i] * z[t - 1 - i]; for (let j = 0; j < q; j++) if (t - 1 - j >= p) f -= th[j] * e[t - 1 - j]; e[t] = f; s += f * f; }
      return b.some((v) => Math.abs(v) > 0.999) ? 1e12 : s;
    };
    const k = p + q; let b = Array(k).fill(0.05);
    if (k) { for (let r = 0; r < 3; r++) b = nelderMead(css, b, 0.15, 800).x; }
    const sse = css(b), nn = n - p;
    return { p, q, mu: m, phi: b.slice(0, p), theta: b.slice(p), sigma2: sse / nn, aic: nn * Math.log(sse / nn) + 2 * (k + 1), bic: nn * Math.log(sse / nn) + (k + 1) * Math.log(nn) };
  }
  function arForecast(y, fit, h) {
    const x = y.slice(-Math.max(fit.p, 1)), out = [];
    for (let s = 0; s < h; s++) { const v = fit.c + fit.phi.reduce((a, ph, i) => a + ph * x[x.length - 1 - i], 0); out.push(v); x.push(v); }
    return out;
  }

  // ---------- GARCH(1,1) / GJR-GARCH(1,1), Gaussian maximum likelihood ----------
  function garchPath(e, om, a, g, b) {                                // returns conditional variances s2[0..n] (s2[n] = next day); backcast as in the arch package
    const n = e.length, tau = Math.min(75, n); let ws = 0, back = 0; for (let i = 0; i < tau; i++) { const w = Math.pow(0.94, i); ws += w; back += w * e[i] * e[i]; } back /= ws;
    const s2 = [om + (a + g / 2 + b) * back]; s2[0] = back;
    for (let t = 0; t < n; t++) s2.push(om + (a + (e[t] < 0 ? g : 0)) * e[t] * e[t] + b * s2[t]);
    return s2;
  }
  function garchMle(r, o = {}) {                                      // r in percent works best; fits mu, omega, alpha, (gamma), beta
    const gjr = !!o.gjr, n = r.length, v0 = r.reduce((s, x) => s + (x - mean(r)) ** 2, 0) / n;
    const unpack = (x) => { const a = 1 / (1 + Math.exp(-x[2])), gm = gjr ? 1 / (1 + Math.exp(-x[4])) : 0, b = 1 / (1 + Math.exp(-x[3])); return { mu: x[0], om: Math.exp(x[1]), a: a * 0.5, g: gm * 0.8, b }; };
    const nll = (x) => {
      const q = unpack(x); if (q.a + q.g / 2 + q.b >= 0.99999) return 1e12;
      const e = r.map((v) => v - q.mu), s2 = garchPath(e, q.om, q.a, q.g, q.b); let ll = 0;
      for (let t = 0; t < n; t++) { if (!(s2[t] > 0)) return 1e12; ll += 0.5 * (Math.log(2 * PI) + Math.log(s2[t]) + e[t] * e[t] / s2[t]); }
      return ll;
    };
    let best = null;
    for (const [a0, b0] of [[0.08, 0.88], [0.05, 0.93], [0.15, 0.7]]) {
      let x = [mean(r), Math.log(v0 * (1 - a0 - b0)), Math.log(a0 * 2 / (1 - a0 * 2)), Math.log(b0 / (1 - b0))]; if (gjr) x.push(Math.log(0.1 / 0.7));
      for (let k = 0; k < 4; k++) x = nelderMead(nll, x, 0.3 / (k + 1), 1500).x;
      const f = nll(x); if (!best || f < best.f) best = { x, f };
    }
    const q = unpack(best.x), e = r.map((v) => v - q.mu), s2 = garchPath(e, q.om, q.a, q.g, q.b), pers = q.a + q.g / 2 + q.b, V = q.om / (1 - pers), k = gjr ? 5 : 4;
    return { ...q, persistence: pers, longRunVar: V, halfLife: pers < 1 ? Math.log(0.5) / Math.log(pers) : Infinity, ll: -best.f, aic: 2 * best.f + 2 * k, bic: 2 * best.f + k * Math.log(n), s2, z: e.map((v, t) => v / Math.sqrt(s2[t])), next: s2[n],
      forecast: (h) => Array.from({ length: h }, (_, i) => V + Math.pow(pers, i) * (s2[n] - V)),
      nic: (eps) => q.om + (q.a + (eps < 0 ? q.g : 0)) * eps * eps + q.b * V };
  }

  // ---------- Granger causality ----------
  function granger(y, x, p) {                                         // does x help predict y beyond y's own p lags?  F test, restricted vs unrestricted
    const n = y.length, Y = y.slice(p), lag = (s) => Array.from({ length: p }, (_, i) => s.slice(p - 1 - i, n - 1 - i));
    const r0 = ols(Y, lag(y)), r1 = ols(Y, [...lag(y), ...lag(x)]), F = ((r0.sse - r1.sse) / p) / (r1.sse / r1.df);
    return { F, p: fSf(F, p, r1.df), sign: r1.beta.slice(1 + p).reduce((a, b) => a + b, 0) };
  }

  Object.assign(Risk, { eco: { lgamma, ibeta, tTwoSided, fSf, chi2Sf, ols, breuschPagan, adf, engleGranger, acf, pacf, arFit, arSelect, armaCss, arForecast, garchMle, granger, CV } });
  if (typeof module !== 'undefined' && module.exports) module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
