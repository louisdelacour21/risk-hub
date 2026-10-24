'use strict';
/* Twelfth batch, added to Risk.x: FRTB P&L attribution test (hypothetical vs risk-theoretical P&L, Spearman and Kolmogorov-Smirnov zones) for a daily-rolled
   option position, and the FRTB curvature risk charge for any position given as a revaluation function. */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); if (typeof require !== 'undefined' && !G.Risk) { require('./riskx2.js'); require('./riskx11.js'); }
  const X = Risk.x;

  // Zones of the P&L attribution test (BCBS d457): green if Spearman > 0.80 and KS < 0.09, red if Spearman < 0.70 or KS > 0.12, amber between.
  

  // Rolling realised volatility, annualised, from log returns; the first `w` entries are filled with the first available value.
  

  // Option bought each day at strike mny * S(t-1), maturity T years, valued the next day with one day less and the new volatility.
  // terms: any of 'delta', 'gamma', 'vega', 'theta' (the risk-theoretical P&L keeps only those Greeks, computed the day before).
  
  

  // Curvature risk charge for one risk factor: f(S) is the position value, S0 the spot, w the relative shock (the curvature risk weight),
  // delta the sensitivity used in the delta charge. CVR = -(f(shocked) - f(S0) - delta * shift); the charge is the larger of the two, floored at zero.
  function curvature(f, S0, w, delta) {
    const f0 = f(S0), up = -(f(S0 * (1 + w)) - f0 - delta * S0 * w), dn = -(f(S0 * (1 - w)) - f0 + delta * S0 * w);
    return { up, dn, charge: Math.max(0, up, dn) };
  }
  Object.assign(X, {     curvature });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
