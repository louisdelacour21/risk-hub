'use strict';
/* Twelfth batch, added to Risk.x: FRTB P&L attribution test (hypothetical vs risk-theoretical P&L, Spearman and Kolmogorov-Smirnov zones) for a daily-rolled
   option position, and the FRTB curvature risk charge for any position given as a revaluation function. */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); if (typeof require !== 'undefined' && !G.Risk) { require('./riskx2.js'); require('./riskx11.js'); }
  const X = Risk.x;

  // Zones of the P&L attribution test (BCBS d457): green if Spearman > 0.80 and KS < 0.09, red if Spearman < 0.70 or KS > 0.12, amber between.
  function plaZone(rho, ks) { return rho < 0.7 || ks > 0.12 ? 'red' : rho > 0.8 && ks < 0.09 ? 'green' : 'amber'; }

  // Rolling realised volatility, annualised, from log returns; the first `w` entries are filled with the first available value.
  function rollVol(lr, w) {
    const out = lr.map(() => NaN);
    for (let i = w - 1; i < lr.length; i++) { const s = lr.slice(i - w + 1, i + 1); out[i] = Risk.std(s) * Math.sqrt(365); }
    for (let i = 0; i < w - 1; i++) out[i] = out[w - 1];
    return out;
  }

  // Option bought each day at strike mny * S(t-1), maturity T years, valued the next day with one day less and the new volatility.
  // terms: any of 'delta', 'gamma', 'vega', 'theta' (the risk-theoretical P&L keeps only those Greeks, computed the day before).
  function optionPla(close, vol, { mny = 1, T = 30 / 365, call = true, terms = ['delta'], r = 0 } = {}) {
    const dt = 1 / 365, hpl = [], rtpl = [];
    for (let t = 1; t < close.length; t++) {
      const S0 = close[t - 1], S1 = close[t], s0 = vol[t - 1], s1 = vol[t], K = mny * S0, v = (S, T_, s) => X.bs(S, K, T_, r, s, call);
      const v0 = v(S0, T, s0), dS = S1 - S0, h = S0 * 1e-4, hv = 1e-4;
      const delta = (v(S0 + h, T, s0) - v(S0 - h, T, s0)) / (2 * h), gamma = (v(S0 + h, T, s0) - 2 * v0 + v(S0 - h, T, s0)) / (h * h);
      const vega = (v(S0, T, s0 + hv) - v(S0, T, s0 - hv)) / (2 * hv), theta = (v(S0, T - dt, s0) - v0) / dt;
      hpl.push(v(S1, T - dt, s1) - v0);
      rtpl.push((terms.includes('delta') ? delta * dS : 0) + (terms.includes('gamma') ? 0.5 * gamma * dS * dS : 0) + (terms.includes('vega') ? vega * (s1 - s0) : 0) + (terms.includes('theta') ? theta * dt : 0));
    }
    return { hpl, rtpl };
  }
  function pla(hpl, rtpl) { const rho = X.spearman(hpl, rtpl), ks = X.ks2(hpl, rtpl).d; return { rho, ks, zone: plaZone(rho, ks) }; }

  // Curvature risk charge for one risk factor: f(S) is the position value, S0 the spot, w the relative shock (the curvature risk weight),
  // delta the sensitivity used in the delta charge. CVR = -(f(shocked) - f(S0) - delta * shift); the charge is the larger of the two, floored at zero.
  function curvature(f, S0, w, delta) {
    const f0 = f(S0), up = -(f(S0 * (1 + w)) - f0 - delta * S0 * w), dn = -(f(S0 * (1 - w)) - f0 + delta * S0 * w);
    return { up, dn, charge: Math.max(0, up, dn) };
  }
  Object.assign(X, { plaZone, rollVol, optionPla, pla, curvature });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
