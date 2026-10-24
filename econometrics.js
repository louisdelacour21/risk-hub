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
                // P(|T| > |t|)
  
  
  

  // ---------- OLS ----------
  
  
  
  

  // ---------- unit root and cointegration ----------
  const CV = { c: [-3.43, -2.86, -2.57], ct: [-3.96, -3.41, -3.13], n: [-2.57, -1.94, -1.62] };   // MacKinnon asymptotic 1 / 5 / 10 %
  
  
  
  

  // ---------- AR and ARMA ----------
  
  
  
  
  
  

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
  

  Object.assign(Risk, { eco: { lgamma, ibeta,              garchMle,  CV } });
  if (typeof module !== 'undefined' && module.exports) module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
