'use strict';
/* Twentieth batch, added to Risk.x: multi-day filtered historical simulation. EWMA volatility filter, standardised residuals bootstrapped
   over an h-day path whose volatility keeps updating, started from a chosen volatility state. Compared with the sqrt(h) rule. */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); const X = Risk.x;
  // EWMA filter on log returns: sig[t] is the volatility forecast for day t made before seeing r[t]; z[t] = r[t] / sig[t]; next = forecast for the day after the sample.
  
  // h-day cumulative log-return of N bootstrapped paths started from daily volatility sig0; returns the sorted losses (positive = loss).
  function fhsPaths(z, sig0, h, N, seed, lambda = 0.94) {
    const R = Risk.rng(seed), n = z.length, out = new Array(N);
    for (let i = 0; i < N; i++) {
      let v = sig0 * sig0, c = 0;
      for (let d = 0; d < h; d++) { const e = z[Math.floor(R.u() * n)] * Math.sqrt(v); c += e; v = lambda * v + (1 - lambda) * e * e; }
      out[i] = -c;
    }
    return out.sort((a, b) => a - b);
  }
  const q = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
  const es = (sorted, p) => { const k = Math.max(1, Math.ceil(sorted.length * (1 - p))), t = sorted.slice(-k); return t.reduce((s, x) => s + x, 0) / k; };
  Object.assign(X, {  fhsPaths, qtile: q, esSorted: es });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
