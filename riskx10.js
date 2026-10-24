'use strict';
/* Tenth batch, added to Risk.x: FRTB standardised approach, sensitivities-based aggregation for one risk class
   (weighted sensitivities, within-bucket correlation, across-bucket gamma, three correlation scenarios). */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); if (typeof require !== 'undefined' && !G.Risk) require('./riskx9.js');
  const X = Risk.x;

  // buckets: [{rw, s:[sensitivities], rho (within-bucket correlation between different names)}]; gamma: across-bucket correlation.
  // scale 'high' = min(1.25 c, 1), 'low' = max(2 c - 1, 0.75 c), 'medium' = c.
  const sc = (c, m) => (m === 'high' ? Math.min(1, 1.25 * c) : m === 'low' ? Math.max(2 * c - 1, 0.75 * c) : c);
  function sba(buckets, gamma, mode = 'medium') {
    const B = buckets.map((b) => {
      const ws = b.s.map((x) => x * b.rw), r = sc(b.rho, mode); let q = 0;
      ws.forEach((a, i) => ws.forEach((c, j) => { q += i === j ? a * a : r * a * c; }));
      const K = Math.sqrt(Math.max(0, q)), S = ws.reduce((a, c) => a + c, 0);
      return { K, S: Math.max(-K, Math.min(K, S)), raw: S };
    });
    const g = sc(gamma, mode); let t = B.reduce((a, b) => a + b.K * b.K, 0);
    B.forEach((a, i) => B.forEach((b, j) => { if (i !== j) t += g * a.S * b.S; }));
    // if the radicand is negative, the rule replaces S_b by the unclipped sum limited to K_b (kept: S already clipped)
    return { K: Math.sqrt(Math.max(0, t)), buckets: B };
  }
  // Capital = max over the three scenarios.
  function sbaMax(buckets, gamma) {
    const r = ['low', 'medium', 'high'].map((m) => ({ mode: m, ...sba(buckets, gamma, m) })), best = r.reduce((a, b) => (b.K > a.K ? b : a));
    return { scenarios: r, capital: best.K, mode: best.mode };
  }
  Object.assign(X, { sba, sbaMax });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
