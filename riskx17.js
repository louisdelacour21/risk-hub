'use strict';
/* Seventeenth batch, added to Risk.x: an option book (aggregated Greeks, full-revaluation grid of spot and volatility shocks, gamma profile near expiry),
   margin calls on a leveraged long position replayed on history, and a liquidity ladder (cumulative outflows against a buffer). */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); if (typeof require !== 'undefined' && !G.Risk) { require('./riskx2.js'); require('./riskx16.js'); }
  const X = Risk.x;

  // legs: [{call: bool, K, T (years), qty}] (qty negative = short). Value, delta, gamma, vega (per 1.00 of vol), theta (per year) from central differences of Black-Scholes.
  
  
  
  // P&L of the book on a grid: rows = spot shocks (relative), columns = volatility shocks (absolute, in vol points), full revaluation.
  
  // Margin calls: a position bought with leverage lev (equity E0, loan E0 (lev - 1)); each day the equity ratio = equity / position value is compared with maint;
  // when below, the holder tops up cash to restore the initial ratio 1/lev. Replayed on every start day over h days. Returns the share of windows with a call,
  // the average number of calls, and the average and worst cash called (as a share of the initial equity) over all windows.
  
  // Liquidity ladder: outflows[i] at bucket i against a buffer already net of haircut; returns the cumulative gap (buffer minus cumulative outflows) and the first breach.
  
  Object.assign(X, {     });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
