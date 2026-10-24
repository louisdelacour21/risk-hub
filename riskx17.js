'use strict';
/* Seventeenth batch, added to Risk.x: an option book (aggregated Greeks, full-revaluation grid of spot and volatility shocks, gamma profile near expiry),
   margin calls on a leveraged long position replayed on history, and a liquidity ladder (cumulative outflows against a buffer). */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); if (typeof require !== 'undefined' && !G.Risk) { require('./riskx2.js'); require('./riskx16.js'); }
  const X = Risk.x;

  // legs: [{call: bool, K, T (years), qty}] (qty negative = short). Value, delta, gamma, vega (per 1.00 of vol), theta (per year) from central differences of Black-Scholes.
  const legValue = (l, S, sg, r) => (l.T <= 1e-9 ? Math.max(l.call ? S - l.K : l.K - S, 0) : X.bs(S, l.K, l.T, r, sg, l.call));
  function bookValue(legs, S, sg, r = 0) { return legs.reduce((s, l) => s + l.qty * legValue(l, S, sg, r), 0); }
  function bookGreeks(legs, S, sg, r = 0) {
    const h = S * 1e-4, hv = 1e-4, v0 = bookValue(legs, S, sg, r), up = bookValue(legs, S + h, sg, r), dn = bookValue(legs, S - h, sg, r);
    const dt = 1 / 365, aged = legs.map((l) => ({ ...l, T: Math.max(l.T - dt, 0) }));
    return { value: v0, delta: (up - dn) / (2 * h), gamma: (up - 2 * v0 + dn) / (h * h), vega: (bookValue(legs, S, sg + hv, r) - bookValue(legs, S, sg - hv, r)) / (2 * hv), theta: (bookValue(aged, S, sg, r) - v0) / dt };
  }
  // P&L of the book on a grid: rows = spot shocks (relative), columns = volatility shocks (absolute, in vol points), full revaluation.
  function bookGrid(legs, S, sg, dS, dV, r = 0) {
    const v0 = bookValue(legs, S, sg, r);
    return dS.map((a) => dV.map((b) => bookValue(legs, S * (1 + a), Math.max(sg + b, 0.01), r) - v0));
  }
  // Margin calls: a position bought with leverage lev (equity E0, loan E0 (lev - 1)); each day the equity ratio = equity / position value is compared with maint;
  // when below, the holder tops up cash to restore the initial ratio 1/lev. Replayed on every start day over h days. Returns the share of windows with a call,
  // the average number of calls, and the average and worst cash called (as a share of the initial equity) over all windows.
  function marginCalls(lr, h, lev, maint) {
    let hit = 0, calls = 0, cash = 0, worst = 0, n = 0;
    for (let s = 0; s + h <= lr.length; s++) {
      let pos = lev, loan = lev - 1, c = 0, k = 0; // position value in units of the initial equity
      for (let t = 0; t < h; t++) {
        pos *= Math.exp(lr[s + t]); const eq = pos - loan;
        if (eq / pos < maint) { const need = pos / lev - eq; if (need > 0) { loan -= need; c += need; k++; } }
      }
      n++; if (k > 0) hit++; calls += k; cash += c; worst = Math.max(worst, c);
    }
    return { pHit: hit / n, avgCalls: calls / n, avgCash: cash / n, worstCash: worst, n };
  }
  // Liquidity ladder: outflows[i] at bucket i against a buffer already net of haircut; returns the cumulative gap (buffer minus cumulative outflows) and the first breach.
  function ladder(outflows, buffer) {
    let c = 0; const gap = outflows.map((o) => { c += o; return buffer - c; }); const i = gap.findIndex((g) => g < 0);
    return { gap, breach: i };
  }
  Object.assign(X, { bookValue, bookGreeks, bookGrid, marginCalls, ladder });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
