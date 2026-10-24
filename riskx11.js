'use strict';
/* Eleventh batch, added to Risk.x: structural credit risk of a collateralised loan (KMV distance to default, first-passage liquidation probability,
   empirical counterparts from a return history) and a loan-to-value migration matrix, in the style of CreditMetrics. */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); if (typeof require !== 'undefined' && !G.Risk) require('./riskx10.js');
  const X = Risk.x, { normCdf } = Risk, mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

  // Collateral V, debt D, ratio = V / D. Log collateral value is Brownian with drift mu - sigma^2/2 (mu, sigma annual), horizon T years.
  // KMV distance to default = (ln ratio + (mu - sigma^2 / 2) T) / (sigma sqrt T); default at T when V_T < D, probability Phi(-DD).
  // Liquidation can happen at any time: first passage of ln V below ln D (barrier b = -ln ratio < 0), P = Phi((b - mT)/s) + exp(2 m b / sigma^2) Phi((b + mT)/s), s = sigma sqrt T.
  

  // Empirical counterpart from daily log returns lr: every overlapping window of h days is one possible future.
  // pdEnd = share of windows ending below the barrier; pdTouch = share crossing it on any day. Loss on a crossing (seen on the first day of crossing):
  // the collateral is sold at the day's level less a penalty, loss = max(0, 1 - (1 - pen) V / D). Returns the sorted losses of all windows (0 when not crossed).
  

  // Migration matrix of the loan-to-value ratio. edges = ascending LTV boundaries below the liquidation level liq; the states are the bands
  // [0, e1), [e1, e2) ... [e_k, liq) and "liquidated" (absorbing: LTV reached liq on some day of the window). A loan starting at the band mid-point
  // has LTV_t = ltv0 exp(-cum return). Rows sum to one; the last column is the probability of liquidation, loss the expected loss per band.
  

  Object.assign(X, {   });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
