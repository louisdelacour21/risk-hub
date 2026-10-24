'use strict';
/* Nineteenth batch, added to Risk.x: SR 11-7 style model tiering (weighted score of materiality, complexity, uncertainty, reliance) and
   the overall rating from open findings, with the review frequency that follows. Weights and cut-offs are illustrative house choices, not a regulatory table. */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); const X = Risk.x;
  const W = { materiality: 0.4, complexity: 0.2, uncertainty: 0.2, reliance: 0.2 };
  // scores 1..5 each; returns the weighted score (1..5), tier 1 (highest risk) to 3, and the months between full validations
  
  // findings: counts by severity; rating 'satisfactory' | 'needs improvement' | 'unsatisfactory'; points weigh high 5, medium 2, low 0.5
  
  Object.assign(X, { MODEL_W: W,  });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
