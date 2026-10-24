'use strict';
/* Seventh batch, added to Risk.x: probability-of-default backtesting (binomial test, Hosmer-Lemeshow, Brier), cross-currency basis,
   CDS-bond basis trade, and operational-risk scenarios aggregated with a Gaussian copula. */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); if (typeof require !== 'undefined' && !G.Risk) require('./riskx6.js');
  const X = Risk.x, mean = (a) => a.reduce((s, x) => s + x, 0) / a.length, { normCdf, normInv } = Risk;

  // ---------- chi-square survival function, any degrees of freedom (regularised upper incomplete gamma) ----------
  const lgam = (z) => { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = z, t = z + 5.5; t -= (z + 0.5) * Math.log(t); let s = 1.000000000190015; for (const k of c) s += k / ++y; return -t + Math.log(2.5066282746310005 * s / z); };
  function chi2sf(x, k) {
    if (x <= 0) return 1; const a = k / 2, xx = x / 2;
    if (xx < a + 1) { let sum = 1 / a, del = sum, ap = a; for (let n = 0; n < 500; n++) { ap++; del *= xx / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-14) break; } return 1 - sum * Math.exp(-xx + a * Math.log(xx) - lgam(a)); }
    let b = xx + 1 - a, c = 1e300, d = 1 / b, h = d; for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-14) break; }
    return Math.exp(-xx + a * Math.log(xx) - lgam(a)) * h;
  }

  // ---------- PD backtest ----------
  // P(X >= k) for X ~ Binomial(n, p): the chance of seeing at least k defaults if the PD is right (one-sided, exact).
  function binomUpper(k, n, p) {
    if (k <= 0) return 1; let term = Math.pow(1 - p, n), cdf = term; for (let i = 0; i < k - 1; i++) { term *= (n - i) / (i + 1) * p / (1 - p); cdf += term; } return Math.max(0, 1 - cdf);
  }
  // groups = equal-count bins of the predicted PD (ascending). Hosmer-Lemeshow: sum (O - E)^2 / (E (1 - E / n)), df = G - 2.
  function pdBacktest(pd, y, G0 = 10) {
    const idx = pd.map((_, i) => i).sort((a, b) => pd[a] - pd[b]), rows = []; let hl = 0, brier = 0;
    for (let g = 0; g < G0; g++) {
      const part = idx.slice(Math.floor(g * idx.length / G0), Math.floor((g + 1) * idx.length / G0)), n = part.length, E = part.reduce((s, i) => s + pd[i], 0), O = part.reduce((s, i) => s + y[i], 0);
      rows.push({ n, E, O, pdMean: E / n, rate: O / n, p: binomUpper(O, n, E / n) }); hl += (O - E) ** 2 / (E * (1 - E / n) || 1e-12);
    }
    for (let i = 0; i < pd.length; i++) brier += (pd[i] - y[i]) ** 2;
    const O = y.reduce((a, b) => a + b, 0), E = pd.reduce((a, b) => a + b, 0);
    return { rows, hl, hlP: chi2sf(hl, G0 - 2), brier: brier / pd.length, O, E, pTotal: binomUpper(O, pd.length, E / pd.length) };
  }

  // ---------- cross-currency basis ----------
  // Quote: S = dollars per euro, F = forward for T years, rE and rU simple rates. CIP forward: S (1 + rU T) / (1 + rE T).
  // The dollar rate implied by the market forward is ((F / S) (1 + rE T) - 1) / T; basis = implied - rU (positive: dollars cost more through the swap).
  function ccyBasis(o) {
    const fcip = o.S * (1 + o.rU * o.T) / (1 + o.rE * o.T), implied = ((o.F / o.S) * (1 + o.rE * o.T) - 1) / o.T, basis = implied - o.rU;
    return { fcip, implied, basis, hedgedYield: o.yU - (implied - o.rE), cipYield: o.yU - (o.rU - o.rE) };
  }
  // Forward that gives a quoted basis (inverse of the above).
  const fwdFromBasis = (o) => o.S * (1 + (o.rU + o.basis) * o.T) / (1 + o.rE * o.T);

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

  Object.assign(X, { chi2sf, binomUpper, pdBacktest, ccyBasis, fwdFromBasis, negBasis, opScenarios, lnFit });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
