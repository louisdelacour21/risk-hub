'use strict';
/* Eighteenth batch, added to Risk.x: FRTB standardised default risk charge (non-securitisation), simplified: net jump-to-default per obligor,
   hedge benefit ratio, risk weights by credit quality (BCBS d457 table), one bucket per sector. */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); const X = Risk.x;
  const RW = { AAA: 0.005, AA: 0.02, A: 0.03, BBB: 0.06, BB: 0.15, B: 0.30, CCC: 0.50, NR: 0.15, DEF: 1 };
  // pos: [{id, bucket, rating, jtd}] jtd signed (long positive = loss on default, short negative = gain). Same obligor in one bucket nets before weighting.
  // Returns per bucket {netLong, netShort, hbr, charge} and the total (buckets add, no cross-bucket hedging).
  
  Object.assign(X, { DRC_RW: RW, });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
