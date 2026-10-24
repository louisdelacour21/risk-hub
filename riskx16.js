'use strict';
/* Sixteenth batch, added to Risk.x: worst historical episodes (non-overlapping h-day windows) of a return series, and the convergence of a Monte Carlo VaR
   with the number of simulations (spread of the estimate over repeated runs). */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); if (typeof require !== 'undefined' && !G.Risk) { require('./riskx2.js'); require('./riskx15.js'); }
  const X = Risk.x;

  // Worst k non-overlapping windows of h days by cumulative simple return of a daily-rebalanced series r (compounded). Returns [{start, end, ret}] worst first.
  
  // Monte Carlo VaR of a normal model (mean, sd) at level p with N draws, repeated `reps` times; returns the VaR estimates.
  
  Object.assign(X, {  });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
