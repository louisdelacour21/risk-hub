'use strict';
/* Twenty-first batch, added to Risk.x: key-rate DV01 on a zero curve (triangular bumps) and the six BCBS interest-rate shock scenarios
   (IRRBB, d368) applied to a bond book with full revaluation. */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); const X = Risk.x;
  
  // Par bond with semi-annual coupon c (decimal) and maturity T (multiple of 0.5): flows [{t, amount}] per 1 of notional.
  
  // Present value of a book [{notional, flows}] on zero rates (decimals, continuous compounding) at nodes ys.
  
  // Key-rate DV01: loss-free sign convention, value change for a +1 bp bump of node i only (linear interpolation makes the bump a triangle). Sum over nodes = parallel DV01.
  
  // BCBS d368 shocks in decimals at maturity t: R = {par, short, long} in bp. Floor on the shocked rate: -1% at t=0 rising 5 bp a year to 0 (applied to the shocked zero rate).
  
  
  const floor = (t) => Math.min(-0.01 + 0.0005 * t, 0);
  
  Object.assign(X, {      BCBS: { usd: { par: 200, short: 300, long: 150 }, eur: { par: 200, short: 250, long: 100 } } });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
