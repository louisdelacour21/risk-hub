'use strict';
/* Ninth batch, added to Risk.x: liquidity estimators from daily open/high/low/close/volume: Roll spread, Amihud illiquidity,
   Corwin-Schultz high-low spread, Parkinson volatility. */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); if (typeof require !== 'undefined' && !G.Risk) require('./riskx8.js');
  const X = Risk.x, mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

  // Roll: s = 2 sqrt(-cov(dp_t, dp_t-1)) of price changes; 0 when the covariance is not negative. Returned as a share of price.
  function roll(close) {
    const d = close.slice(1).map((p, i) => p - close[i]), a = d.slice(1), b = d.slice(0, -1), ma = mean(a), mb = mean(b);
    const cov = mean(a.map((x, i) => (x - ma) * (b[i] - mb)));
    return cov < 0 ? 2 * Math.sqrt(-cov) / mean(close) : 0;
  }
  // Amihud: mean of |return| / dollar volume, per million dollars traded.
  const amihud = (ret, volUsd) => mean(ret.map((r, i) => (volUsd[i] > 0 ? Math.abs(r) / (volUsd[i] / 1e6) : 0)));
  // Corwin-Schultz (2012): two-day high-low ratio. Negative estimates are set to 0.
  const K = 3 - 2 * Math.SQRT2;
  function csDay(h0, l0, h1, l1) {
    const beta = Math.log(h0 / l0) ** 2 + Math.log(h1 / l1) ** 2, gam = Math.log(Math.max(h0, h1) / Math.min(l0, l1)) ** 2;
    const al = (Math.SQRT2 - 1) * Math.sqrt(beta) / K - Math.sqrt(gam / K), e = Math.exp(al);
    return Math.max(0, 2 * (e - 1) / (1 + e));
  }
  const corwinSchultz = (high, low) => high.slice(1).map((_, i) => csDay(high[i], low[i], high[i + 1], low[i + 1]));
  // Parkinson daily volatility: sqrt(mean(ln(H/L)^2) / (4 ln 2)).
  const parkinson = (high, low) => Math.sqrt(mean(high.map((h, i) => Math.log(h / low[i]) ** 2)) / (4 * Math.LN2));

  Object.assign(X, { roll, amihud, corwinSchultz, parkinson });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
