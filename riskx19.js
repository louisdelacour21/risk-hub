'use strict';
/* Nineteenth batch, added to Risk.x: SR 11-7 style model tiering (weighted score of materiality, complexity, uncertainty, reliance) and
   the overall rating from open findings, with the review frequency that follows. Weights and cut-offs are illustrative house choices, not a regulatory table. */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); const X = Risk.x;
  const W = { materiality: 0.4, complexity: 0.2, uncertainty: 0.2, reliance: 0.2 };
  // scores 1..5 each; returns the weighted score (1..5), tier 1 (highest risk) to 3, and the months between full validations
  function modelTier(s) {
    const score = Object.keys(W).reduce((t, k) => t + W[k] * s[k], 0), tier = score >= 3.6 - 1e-9 ? 1 : score >= 2.6 - 1e-9 ? 2 : 3;
    return { score, tier, months: { 1: 12, 2: 24, 3: 36 }[tier] };
  }
  // findings: counts by severity; rating 'satisfactory' | 'needs improvement' | 'unsatisfactory'; points weigh high 5, medium 2, low 0.5
  function findingsRating(f) {
    const pts = 5 * f.high + 2 * f.medium + 0.5 * f.low;
    return { pts, rating: f.high >= 2 || pts >= 12 ? 'unsatisfactory' : f.high >= 1 || pts >= 4 ? 'needs improvement' : 'satisfactory' };
  }
  Object.assign(X, { MODEL_W: W, modelTier, findingsRating });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
