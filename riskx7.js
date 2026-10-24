'use strict';
/* Seventh batch, added to Risk.x: probability-of-default backtesting (binomial test, Hosmer-Lemeshow, Brier), cross-currency basis,
   CDS-bond basis trade, and operational-risk scenarios aggregated with a Gaussian copula. */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); if (typeof require !== 'undefined' && !G.Risk) require('./riskx6.js');
  const X = Risk.x, mean = (a) => a.reduce((s, x) => s + x, 0) / a.length, { normCdf, normInv } = Risk;

  // ---------- chi-square survival function, any degrees of freedom (regularised upper incomplete gamma) ----------
  const lgam = (z) => { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = z, t = z + 5.5; t -= (z + 0.5) * Math.log(t); let s = 1.000000000190015; for (const k of c) s += k / ++y; return -t + Math.log(2.5066282746310005 * s / z); };
  

  // ---------- PD backtest ----------
  // P(X >= k) for X ~ Binomial(n, p): the chance of seeing at least k defaults if the PD is right (one-sided, exact).
  
  // groups = equal-count bins of the predicted PD (ascending). Hosmer-Lemeshow: sum (O - E)^2 / (E (1 - E / n)), df = G - 2.
  

  // ---------- cross-currency basis ----------
  // Quote: S = dollars per euro, F = forward for T years, rE and rU simple rates. CIP forward: S (1 + rU T) / (1 + rE T).
  // The dollar rate implied by the market forward is ((F / S) (1 + rE T) - 1) / T; basis = implied - rU (positive: dollars cost more through the swap).
  
  // Forward that gives a quoted basis (inverse of the above).
  

  // ---------- CDS-bond basis trade ----------
  // Buy the bond (spread z over the funding benchmark) and buy protection (cds). Funding costs f above the benchmark on the financed part (1 - haircut).
  // Basis = cds - z (negative: the bond is cheap). Carry per year on notional = z - cds - f (1 - haircut). If the basis converges to zero by maturity, the mark-to-market gain is -basis x annuity.
  function negBasis(o) {
    const carry = o.z - o.cds - o.f * (1 - o.haircut), basis = o.cds - o.z, ann = o.T, conv = -basis * ann;
    return { basis, carry, convergence: conv, total: carry * o.T + conv, onCapital: carry / o.haircut, breakevenFund: (o.z - o.cds) / (1 - o.haircut), widen: (d) => (carry - d * (1 - o.haircut)) * o.T + conv };
  }

  // ---------- operational scenarios with a Gaussian copula ----------
  // Scenario: frequency lam per year, severity lognormal with the median m and the q99 s of one event. Annual loss = sum over a Poisson count.
  // The counts are linked by a one-factor Gaussian copula: U_i = Phi(sqrt(rho) Z + sqrt(1 - rho) e_i), N_i = Poisson inverse at U_i.
  const lnFit = (m, q99) => ({ mu: Math.log(m), sigma: Math.max(1e-6, Math.log(q99 / m) / normInv(0.99)) });
  function poisInv(u, lam) { let k = 0, p = Math.exp(-lam), c = p; while (c < u && k < 500) { k++; p *= lam / k; c += p; } return k; }
  function opScenarios(sc, o) {
    const R = Risk.rng(o.seed || 9), S = o.sims || 20000, rho = o.rho, fits = sc.map((s) => lnFit(s.m, s.q99)), tot = [], alone = sc.map(() => []);
    for (let s = 0; s < S; s++) {
      const z = R.n(); let t = 0;
      sc.forEach((c, i) => { const u = normCdf(Math.sqrt(rho) * z + Math.sqrt(1 - rho) * R.n()), n = poisInv(u, c.lam); let l = 0; for (let j = 0; j < n; j++) l += Math.exp(fits[i].mu + fits[i].sigma * R.n()); alone[i].push(l); t += l; });
      tot.push(t);
    }
    const q = (a, p) => { const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; }, p = o.q || 0.999;
    const sa = alone.map((a) => q(a, p)), es = (a) => { const b = a.slice().sort((x, y) => x - y), k = Math.floor(p * b.length); return mean(b.slice(k)); };
    return { var: q(tot, p), es: es(tot), mean: mean(tot), standalone: sa, sumStandalone: sa.reduce((a, b) => a + b, 0), fits };
  }

  Object.assign(X, {      negBasis, opScenarios, lnFit });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
