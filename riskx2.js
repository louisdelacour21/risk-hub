'use strict';
/* Second batch of risk maths, added to Risk.x: CDS bootstrap, CreditRisk+, SA-CCR, KVA/MVA, model-risk pricers (Black-Scholes, Merton jumps, Heston). */
((G) => {
  const Risk = G.Risk || require('./riskx.js');
  const { normCdf } = Risk;

  // ---------- Black-Scholes and implied volatility ----------
  const bs = (S, K, T, r, s, call = true) => {
    const d1 = (Math.log(S / K) + (r + 0.5 * s * s) * T) / (s * Math.sqrt(T)), d2 = d1 - s * Math.sqrt(T), c = S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
    return call ? c : c - S + K * Math.exp(-r * T);
  };
  

  // ---------- Merton jump-diffusion, Poisson series ----------
  

  // ---------- Heston call by Lewis integration (little-trap characteristic function) ----------
  
  
  
  // characteristic function of ln(S_T/S0) under Q at complex argument z (little-trap form, Albrecher et al.)
  
  // Lewis (2001): C = S - sqrt(S K) e^{-rT/2} / pi * int_0^inf Re[e^{iu k} phi_F(u - i/2)] / (u^2 + 1/4) du, with phi_F the cf of ln(S_T/F) and k = ln(F/K)
  

  // ---------- CDS: hazard bootstrap and pricing ----------
  // flat-forward piecewise-constant hazard; premium paid quarterly, accrual-on-default ignored in the bootstrap, continuous protection leg
  
  
  

  // ---------- CreditRisk+ (gamma-mixed Poisson, Panjer recursion) ----------
  // loans: [{nu: integer exposure bands, p: default probability}], sig2: variance of the common gamma factor (mean 1)
  const creditRiskPlus = (loans, sig2, nMax) => {
    const mu = loans.reduce((s, l) => s + l.p, 0), maxNu = Math.max(...loans.map((l) => l.nu)), f = Array(maxNu + 1).fill(0);
    for (const l of loans) f[l.nu] += l.p / mu;
    let a, b, g0;
    if (sig2 < 1e-9) { a = 0; b = mu; g0 = Math.exp(-mu); } else { const r = 1 / sig2, pn = 1 / (1 + sig2 * mu); a = 1 - pn; b = (r - 1) * (1 - pn); g0 = Math.pow(pn, r); }
    const g = new Float64Array(nMax + 1); g[0] = g0;
    for (let n = 1; n <= nMax; n++) { let s = 0; for (let j = 1; j <= Math.min(n, maxNu); j++) if (f[j]) s += (a + (b * j) / n) * f[j] * g[n - j]; g[n] = s; }
    const cdf = []; let c = 0; for (let n = 0; n <= nMax; n++) { c += g[n]; cdf.push(c); }
    const q = (p) => { for (let n = 0; n <= nMax; n++) if (cdf[n] >= p) return n; return nMax; };
    const mean = g.reduce((s, x, n) => s + x * n, 0), es = (p) => { const v = q(p); let t = 0, w = 0; for (let n = v + 1; n <= nMax; n++) { t += g[n] * n; w += g[n]; } const lft = cdf[v] - p; return (t + lft * v) / (w + lft || 1); };
    return { pmf: g, cdf, mean, q, es, mass: c, el: loans.reduce((s, l) => s + l.p * l.nu, 0) };
  };

  // ---------- SA-CCR for interest-rate swaps ----------
  // trades: [{N notional, S start (years from now, >=0), E end, dir +1/-1, mtm}]. Margined: variation margin with threshold th and mpor days.
  

  // ---------- KVA and MVA proxies on top of a swapXva result ----------
  // KVA = hurdle * sum D(t) * K(t) dt, K(t) = 8% * RW * 1.4 * EE(t); MVA = funding * sum D(t) * IM(t) dt, IM(t) = z99 * annuity(t) * sigma * sqrt(10/252) (sensitivity proxy)
  

  Object.assign(Risk.x, { bs,       creditRiskPlus,  });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
