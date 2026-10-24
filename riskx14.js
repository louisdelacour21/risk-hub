'use strict';
/* Fourteenth batch, added to Risk.x: risk measures other than VaR and ES (expectile, exponential spectral measure), and concentration (Herfindahl, Gini, effective number). */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); if (typeof require !== 'undefined' && !G.Risk) { require('./riskx12.js'); require('./riskx13.js'); }
  const X = Risk.x;

  // Expectile e_tau of a sample: the point where tau * E[(X-e)+] = (1-tau) * E[(e-X)+] (asymmetric least squares). tau = 0.5 is the mean.
  // Solved by bisection on the monotone first-order condition.
  function expectile(x, tau) {
    let lo = Math.min(...x), hi = Math.max(...x);
    const g = (e) => { let a = 0, b = 0; for (const v of x) { if (v > e) a += v - e; else b += e - v; } return tau * a - (1 - tau) * b; };
    for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (g(m) > 0) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  // Loss-side risk from a sample of returns: the expectile at tau on losses (-returns) is the "expectile VaR"; compare with the quantile VaR and the ES of the same sample.
  // Level matching: the expectile at tau has the same value as the quantile at alpha(tau) = tau-dependent; we report the quantile level it corresponds to.
  function matchLevel(losses, e) { return losses.filter((v) => v <= e).length / losses.length; }

  // Exponential spectral risk measure of losses: weights the sorted losses by phi(u) = k exp(-k (1-u)) / (1 - exp(-k)), k > 0 the risk aversion.
  // k -> 0 gives the mean, large k approaches the maximum loss. Discretised on the n order statistics (midpoint rule).
  function spectral(losses, k) {
    const s = [...losses].sort((a, b) => a - b), n = s.length, z = 1 - Math.exp(-k); let r = 0, w0 = 0;
    for (let i = 0; i < n; i++) { const u1 = i / n, u2 = (i + 1) / n, w = (Math.exp(-k * (1 - u2)) - Math.exp(-k * (1 - u1))) / z; r += w * s[i]; w0 += w; }
    return r / w0;
  }
  // Concentration of non-negative shares: Herfindahl index, effective number of positions 1/HHI, Gini coefficient (0 = equal, near 1 = one position).
  function concentration(a) {
    const v = a.map(Math.abs), t = v.reduce((s, x) => s + x, 0), n = v.length, p = v.map((x) => x / t), hhi = p.reduce((s, x) => s + x * x, 0), srt = [...p].sort((x, y) => x - y);
    const gini = srt.reduce((s, x, i) => s + (2 * (i + 1) - n - 1) * x, 0) / n;
    return { hhi, eff: 1 / hhi, gini, share: p };
  }
  Object.assign(X, { expectile, matchLevel, spectral, concentration });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
