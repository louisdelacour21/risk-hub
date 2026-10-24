'use strict';
/* Sixteenth batch, added to Risk.x: worst historical episodes (non-overlapping h-day windows) of a return series, and the convergence of a Monte Carlo VaR
   with the number of simulations (spread of the estimate over repeated runs). */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); if (typeof require !== 'undefined' && !G.Risk) { require('./riskx2.js'); require('./riskx15.js'); }
  const X = Risk.x;

  // Worst k non-overlapping windows of h days by cumulative simple return of a daily-rebalanced series r (compounded). Returns [{start, end, ret}] worst first.
  function episodes(r, h, k) {
    const cum = [1]; for (const x of r) cum.push(cum[cum.length - 1] * (1 + x));
    const w = []; for (let s = 0; s + h < cum.length; s++) w.push({ start: s, end: s + h - 1, ret: cum[s + h] / cum[s] - 1 });
    w.sort((a, b) => a.ret - b.ret); const out = [];
    for (const c of w) { if (out.length >= k) break; if (out.every((o) => c.start > o.end || c.end < o.start)) out.push(c); }
    return out;
  }
  // Monte Carlo VaR of a normal model (mean, sd) at level p with N draws, repeated `reps` times; returns the VaR estimates.
  function mcVarRuns(mu, sd, p, N, reps, seed) {
    const g = Risk.rng(seed), res = [];
    for (let j = 0; j < reps; j++) { const l = Array.from({ length: N }, () => -(mu + sd * g.n())).sort((a, b) => a - b); res.push(l[Math.min(N - 1, Math.ceil(N * p) - 1)]); }
    return res;
  }
  Object.assign(X, { episodes, mcVarRuns });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
