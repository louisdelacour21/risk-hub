'use strict';
/* Thirteenth batch, added to Risk.x: wrong-way counterparty risk on a position in one crypto asset. The default of the counterparty is tied to the
   price move of the step by a one-factor Gaussian copula, so each step's default probability keeps its unconditional value on average. */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); if (typeof require !== 'undefined' && !G.Risk) { require('./riskx2.js'); require('./riskx12.js'); }
  const X = Risk.x, { normCdf } = Risk, Ninv = Risk.normInv || Risk.Ninv;

  // Position seen by us, per unit of the asset: 'put' = put bought from the counterparty, 'fwdShort' = short forward, 'fwdLong' = long forward.
  // Driftless price, zero rate. Default is tied to the asset falling: step default probability given the shock e is
  // Phi((Phi^-1(q) - sqrt(rho) * e) / sqrt(1 - rho)), q the unconditional default probability of the step (hazard lam, constant).
  function wwrCva({ S0 = 100, K = 100, T = 1, sigma = 0.8, lam = 0.05, lgd = 0.6, rho = 0, pos = 'put', steps = 12, paths = 8000, seed = 3 } = {}) {
    const R = Risk.rng(seed), dt = T / steps, a = sigma * Math.sqrt(dt), val = (S, tau) => {
      if (tau <= 1e-12) return pos === 'put' ? Math.max(K - S, 0) : pos === 'fwdShort' ? K - S : S - K;
      return pos === 'put' ? X.bs(S, K, tau, 0, sigma, false) : pos === 'fwdShort' ? K - S : S - K;
    };
    const q = Array.from({ length: steps }, (_, i) => Math.exp(-lam * i * dt) - Math.exp(-lam * (i + 1) * dt)), z = q.map((x) => Ninv(x));
    const ee = Array(steps).fill(0), eeW = Array(steps).fill(0), cp = Array(paths).fill(0), ci = Array(paths).fill(0);
    for (let p = 0; p < paths; p++) {
      let S = S0;
      for (let i = 0; i < steps; i++) {
        const e = R.n(); S *= Math.exp(a * e - 0.5 * a * a); // price at the end of step i (time (i+1) dt)
        const E = Math.max(val(S, T - (i + 1) * dt), 0), pd = rho > 0 ? normCdf((z[i] - Math.sqrt(rho) * e) / Math.sqrt(1 - rho)) : q[i];
        ee[i] += E / paths; eeW[i] += (E * pd) / paths; cp[p] += lgd * E * pd; ci[p] += lgd * E * q[i];
      }
    }
    const cva = cp.reduce((s, x) => s + x, 0) / paths, cvaInd = ci.reduce((s, x) => s + x, 0) / paths, d = cp.map((x, p) => x - ci[p]), md = d.reduce((s, x) => s + x, 0) / paths;
    const se = Math.sqrt(d.reduce((s, x) => s + (x - md) * (x - md), 0) / (paths - 1) / paths);
    return { cva, cvaInd, ratio: cvaInd > 0 ? cva / cvaInd : NaN, se, ee, q, t: q.map((_, i) => (i + 1) * dt), eeW };
  }
  Object.assign(X, { wwrCva });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
