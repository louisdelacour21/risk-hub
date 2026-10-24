'use strict';
/* Eighteenth batch, added to Risk.x: FRTB standardised default risk charge (non-securitisation), simplified: net jump-to-default per obligor,
   hedge benefit ratio, risk weights by credit quality (BCBS d457 table), one bucket per sector. */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); const X = Risk.x;
  const RW = { AAA: 0.005, AA: 0.02, A: 0.03, BBB: 0.06, BB: 0.15, B: 0.30, CCC: 0.50, NR: 0.15, DEF: 1 };
  // pos: [{id, bucket, rating, jtd}] jtd signed (long positive = loss on default, short negative = gain). Same obligor in one bucket nets before weighting.
  // Returns per bucket {netLong, netShort, hbr, charge} and the total (buckets add, no cross-bucket hedging).
  function drc(pos) {
    const by = {};
    pos.forEach((p) => { const b = (by[p.bucket] = by[p.bucket] || {}); const o = (b[p.id] = b[p.id] || { rating: p.rating, jtd: 0 }); o.jtd += p.jtd; });
    const res = Object.entries(by).map(([bucket, obl]) => {
      let L = 0, S = 0, wl = 0, ws = 0;
      Object.values(obl).forEach((o) => { const w = RW[o.rating]; if (o.jtd > 0) { L += o.jtd; wl += o.jtd * w; } else { S -= o.jtd; ws -= o.jtd * w; } });
      const hbr = L + S > 0 ? L / (L + S) : 0; return { bucket, netLong: L, netShort: S, hbr, charge: Math.max(wl - hbr * ws, 0) };
    });
    return { buckets: res, total: res.reduce((s, b) => s + b.charge, 0) };
  }
  Object.assign(X, { DRC_RW: RW, drc });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
