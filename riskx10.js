'use strict';
/* Tenth batch, added to Risk.x: FRTB standardised approach, sensitivities-based aggregation for one risk class
   (weighted sensitivities, within-bucket correlation, across-bucket gamma, three correlation scenarios). */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); if (typeof require !== 'undefined' && !G.Risk) require('./riskx9.js');
  const X = Risk.x;

  // buckets: [{rw, s:[sensitivities], rho (within-bucket correlation between different names)}]; gamma: across-bucket correlation.
  // scale 'high' = min(1.25 c, 1), 'low' = max(2 c - 1, 0.75 c), 'medium' = c.
  const sc = (c, m) => (m === 'high' ? Math.min(1, 1.25 * c) : m === 'low' ? Math.max(2 * c - 1, 0.75 * c) : c);
  
  // Capital = max over the three scenarios.
  
  Object.assign(X, {  });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
