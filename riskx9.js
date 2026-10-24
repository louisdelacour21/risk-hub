'use strict';
/* Ninth batch, added to Risk.x: liquidity estimators from daily open/high/low/close/volume: Roll spread, Amihud illiquidity,
   Corwin-Schultz high-low spread, Parkinson volatility. */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); if (typeof require !== 'undefined' && !G.Risk) require('./riskx8.js');
  const X = Risk.x, mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

  // Roll: s = 2 sqrt(-cov(dp_t, dp_t-1)) of price changes; 0 when the covariance is not negative. Returned as a share of price.
  
  // Amihud: mean of |return| / dollar volume, per million dollars traded.
  
  // Corwin-Schultz (2012): two-day high-low ratio. Negative estimates are set to 0.
  const K = 3 - 2 * Math.SQRT2;
  
  
  // Parkinson daily volatility: sqrt(mean(ln(H/L)^2) / (4 ln 2)).
  

  Object.assign(X, {    });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
