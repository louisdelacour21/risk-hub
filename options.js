'use strict';
/* Options: Black-Scholes-Merton with continuous dividend yield q (generalised: S = spot, r = rate, q = yield; use S = forward and r = q = 0 for Black-76 on a future).
   Time is in years; volatility is a decimal (0.60 = 60%). Prices and greeks are for ONE unit of the underlying. Added to Risk (after risk.js). */
(function (root) {
  const Risk = root.Risk || require('./risk.js');
  const { normPdf } = Risk;
  // Hart/West double-precision normal CDF (about 1e-15), because Risk.normCdf is only good to about 1e-7, which would show in option prices
  function normCdf(x) {
    const a = Math.abs(x); let c;
    if (a > 37) c = 0;
    else {
      const e = Math.exp(-a * a / 2);
      if (a < 7.07106781186547) {
        let b = 3.52624965998911e-02 * a + 0.700383064443688; b = b * a + 6.37396220353165; b = b * a + 33.912866078383; b = b * a + 112.079291497871; b = b * a + 221.213596169931; b = b * a + 220.206867912376; c = e * b;
        b = 8.83883476483184e-02 * a + 1.75566716318264; b = b * a + 16.064177579207; b = b * a + 86.7807322029461; b = b * a + 296.564248779674; b = b * a + 637.333633378831; b = b * a + 793.826512519948; b = b * a + 440.413735824752; c /= b;
      } else { let b = a + 0.65; b = a + 4 / b; b = a + 3 / b; b = a + 2 / b; b = a + 1 / b; c = e / b / 2.506628274631; }
    }
    return x > 0 ? 1 - c : c;
  }

  function d12(S, K, T, v, r, q) { const s = v * Math.sqrt(T), d1 = (Math.log(S / K) + (r - q + v * v / 2) * T) / s; return [d1, d1 - s]; }

  /** Price and greeks. type: 'C' or 'P'. Vega is per 1.00 of volatility, theta per year, rho per 1.00 of rate (the UI rescales to 1 vol point, 1 day, 1 bp). */
  function bs(S, K, T, v, r, q, type) {
    const call = type === 'C', eq = Math.exp(-q * T), er = Math.exp(-r * T);
    if (T <= 0 || v <= 0) { const intr = call ? Math.max(S - K, 0) : Math.max(K - S, 0); return { price: intr, delta: call ? (S > K ? 1 : 0) : (S < K ? -1 : 0), gamma: 0, vega: 0, theta: 0, rho: 0 }; }
    const [d1, d2] = d12(S, K, T, v, r, q), pdf = normPdf(d1), sq = Math.sqrt(T);
    const price = call ? S * eq * normCdf(d1) - K * er * normCdf(d2) : K * er * normCdf(-d2) - S * eq * normCdf(-d1);
    const delta = call ? eq * normCdf(d1) : -eq * normCdf(-d1);
    const gamma = eq * pdf / (S * v * sq), vega = S * eq * pdf * sq;
    const theta = call ? -S * eq * pdf * v / (2 * sq) - r * K * er * normCdf(d2) + q * S * eq * normCdf(d1)
                       : -S * eq * pdf * v / (2 * sq) + r * K * er * normCdf(-d2) - q * S * eq * normCdf(-d1);
    const rho = call ? K * T * er * normCdf(d2) : -K * T * er * normCdf(-d2);
    return { price, delta, gamma, vega, theta, rho };
  }

  /** Implied volatility by bisection (robust: the price is increasing in volatility). Returns null when the price is outside the no-arbitrage bounds. */
  

  /** Linear interpolation of implied vol in log-moneyness (flat beyond the quoted strikes). pts: [{k, iv}] sorted by k. */
  

  // Full revaluation after a shock: spot moves by dS (relative), volatility by dv (absolute, 0.05 = 5 vol points), dDays days pass. The greeks give first- and second-order estimates.
  

  Object.assign(Risk, { bs,   });
  if (typeof module !== 'undefined' && module.exports) module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
