'use strict';
/* Fourteenth batch, added to Risk.x: risk measures other than VaR and ES (expectile, exponential spectral measure), and concentration (Herfindahl, Gini, effective number). */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); if (typeof require !== 'undefined' && !G.Risk) { require('./riskx12.js'); require('./riskx13.js'); }
  const X = Risk.x;

  // Expectile e_tau of a sample: the point where tau * E[(X-e)+] = (1-tau) * E[(e-X)+] (asymmetric least squares). tau = 0.5 is the mean.
  // Solved by bisection on the monotone first-order condition.
  
  // Loss-side risk from a sample of returns: the expectile at tau on losses (-returns) is the "expectile VaR"; compare with the quantile VaR and the ES of the same sample.
  // Level matching: the expectile at tau has the same value as the quantile at alpha(tau) = tau-dependent; we report the quantile level it corresponds to.
  

  // Exponential spectral risk measure of losses: weights the sorted losses by phi(u) = k exp(-k (1-u)) / (1 - exp(-k)), k > 0 the risk aversion.
  // k -> 0 gives the mean, large k approaches the maximum loss. Discretised on the n order statistics (midpoint rule).
  
  // Concentration of non-negative shares: Herfindahl index, effective number of positions 1/HHI, Gini coefficient (0 = equal, near 1 = one position).
  
  Object.assign(X, {    });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
