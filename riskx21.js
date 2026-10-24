'use strict';
/* Twenty-first batch, added to Risk.x: key-rate DV01 on a zero curve (triangular bumps) and the six BCBS interest-rate shock scenarios
   (IRRBB, d368) applied to a bond book with full revaluation. */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); const X = Risk.x;
  const interp = (ys, rs, t) => { const n = ys.length - 1; if (t <= ys[0]) return rs[0]; if (t >= ys[n]) return rs[n]; let i = 1; while (ys[i] < t) i++; return rs[i - 1] + (rs[i] - rs[i - 1]) * (t - ys[i - 1]) / (ys[i] - ys[i - 1]); };
  // Par bond with semi-annual coupon c (decimal) and maturity T (multiple of 0.5): flows [{t, amount}] per 1 of notional.
  const bondFlows = (c, T) => Array.from({ length: Math.round(T * 2) }, (_, k) => ({ t: (k + 1) / 2, amount: c / 2 + (k + 1 === Math.round(T * 2) ? 1 : 0) }));
  // Present value of a book [{notional, flows}] on zero rates (decimals, continuous compounding) at nodes ys.
  const bookPv = (book, ys, zs) => book.reduce((s, b) => s + b.notional * b.flows.reduce((a, f) => a + f.amount * Math.exp(-interp(ys, zs, f.t) * f.t), 0), 0);
  // Key-rate DV01: loss-free sign convention, value change for a +1 bp bump of node i only (linear interpolation makes the bump a triangle). Sum over nodes = parallel DV01.
  function keyRateDv01(book, ys, zs) {
    const p0 = bookPv(book, ys, zs), kr = ys.map((_, i) => bookPv(book, ys, zs.map((z, j) => (j === i ? z + 1e-4 : z))) - p0);
    return { kr, total: kr.reduce((a, b) => a + b, 0), parallel: bookPv(book, ys, zs.map((z) => z + 1e-4)) - p0, pv: p0 };
  }
  // BCBS d368 shocks in decimals at maturity t: R = {par, short, long} in bp. Floor on the shocked rate: -1% at t=0 rising 5 bp a year to 0 (applied to the shocked zero rate).
  function bcbsShock(name, t, R) {
    const p = R.par / 1e4, s = R.short / 1e4, l = R.long / 1e4, es = Math.exp(-t / 4), el = 1 - es;
    switch (name) {
      case 'parallel up': return p; case 'parallel down': return -p;
      case 'short up': return s * es; case 'short down': return -s * es;
      case 'steepener': return -0.65 * s * es + 0.9 * l * el; case 'flattener': return 0.8 * s * es - 0.6 * l * el;
    }
    throw new Error('unknown scenario ' + name);
  }
  const SCEN = ['parallel up', 'parallel down', 'steepener', 'flattener', 'short up', 'short down'];
  const floor = (t) => Math.min(-0.01 + 0.0005 * t, 0);
  function bcbsScenarios(book, ys, zs, R) {
    const p0 = bookPv(book, ys, zs);
    return SCEN.map((n) => ({ name: n, pnl: bookPv(book, ys, zs.map((z, i) => Math.max(z + bcbsShock(n, ys[i], R), floor(ys[i])))) - p0 }));
  }
  Object.assign(X, { bondFlows, bookPv, keyRateDv01, bcbsShock, bcbsScenarios, BCBS: { usd: { par: 200, short: 300, long: 150 }, eur: { par: 200, short: 250, long: 100 } } });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
