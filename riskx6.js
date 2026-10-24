'use strict';
/* Sixth batch, added to Risk.x: funding and liquidity survival (stressed run-off, maturity ladder, funds transfer pricing),
   FX hedging (carry, basis) and parameter stability (CUSUM, Chow sup-F with a bootstrap p-value). */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); if (typeof require !== 'undefined' && !G.Risk) require('./riskx5.js');
  const X = Risk.x, mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

  // ---------- funding: survival horizon under stress ----------
  // Retail and corporate deposits leave as cap * (1 - exp(-t / tau)); wholesale funding rolls over at rate rr over its remaining life;
  // committed lines are drawn as draw * (1 - exp(-t / 30)); contractual loan inflows arrive at `inflow` of the book per day (stressed down by `inflowKeep`).
  // Buffer = cash + HQLA after haircut. Survival = first day the cumulative net outflow exceeds the buffer.
  function survival(o) {
    const H = o.horizon || 180, dep = o.deposits, days = Array.from({ length: H + 1 }, (_, t) => t), out = [], inn = [], net = [];
    for (const t of days) {
      let o1 = 0; for (const d of dep) o1 += d.amount * d.cap * (1 - Math.exp(-t / d.tau));
      o1 += o.wholesale * (1 - o.rollover) * Math.min(1, t / o.wholesaleLife) + o.commit * o.draw * (1 - Math.exp(-t / 30));
      const i1 = o.loans * o.inflow * o.inflowKeep * t;
      out.push(o1); inn.push(i1); net.push(o1 - i1);
    }
    const buffer = o.cash + o.hqla * (1 - o.haircut), hit = net.findIndex((x) => x > buffer);
    return { days, out, inn, net, buffer, survival: hit < 0 ? Infinity : hit };
  }

  // ---------- funding: maturity ladder ----------
  // gap_i = inflow_i - outflow_i * (1 - rollover_i) (the share of maturing liabilities that is refinanced reduces the outflow)
  function ladder(inflow, outflow, rollover) {
    const gap = inflow.map((x, i) => x - outflow[i] * (1 - (rollover[i] || 0))), cum = []; let s = 0; for (const g of gap) { s += g; cum.push(s); }
    return { gap, cum, worst: Math.min(...cum) };
  }

  // ---------- funding: transfer pricing of an amortising loan ----------
  // Funding spread curve s(t) = base + liq * (1 - exp(-t / theta)). Slice k of N repaid at t_k = T k / N is funded for t_k years at s(t_k).
  // Matched rate = cost / sum of (outstanding x time) = average of s(t_k) weighted by t_k. Pooled rate = one spread at `pool` years.
  function ftp(o) {
    const N = o.slices || 120, s = (t) => o.base + o.liq * (1 - Math.exp(-t / o.theta));
    let c = 0, w = 0; for (let k = 1; k <= N; k++) { const t = o.T * k / N; c += s(t) * t; w += t; }
    const matched = c / w, pooled = s(o.pool);
    return { matched, pooled, diff: pooled - matched, curve: (t) => s(t), annualCost: matched * o.notional };
  }

  // ---------- FX: hedged return of a foreign asset ----------
  // r = period FX return of the quote "foreign per home" (a rise hurts the home investor). Hedge ratio h; carry = per-period forward gain (negative = hedge cost).
  const hedged = (r, h, carry) => r.map((x) => -(1 - h) * x + h * carry);

  // ---------- parameter stability ----------
  // OLS y = a + b x with prefix sums, so any sub-sample is fitted in O(1).
  function prefix(y, x) {
    const n = y.length, S = { n: [0], x: [0], y: [0], xx: [0], xy: [0], yy: [0] };
    for (let i = 0; i < n; i++) { S.n.push(i + 1); S.x.push(S.x[i] + x[i]); S.y.push(S.y[i] + y[i]); S.xx.push(S.xx[i] + x[i] * x[i]); S.xy.push(S.xy[i] + x[i] * y[i]); S.yy.push(S.yy[i] + y[i] * y[i]); }
    return S;
  }
  function fitSeg(S, a, b) {
    const n = b - a, sx = S.x[b] - S.x[a], sy = S.y[b] - S.y[a], sxx = S.xx[b] - S.xx[a], sxy = S.xy[b] - S.xy[a], syy = S.yy[b] - S.yy[a], vx = sxx - sx * sx / n, cxy = sxy - sx * sy / n;
    const beta = vx > 1e-18 ? cxy / vx : 0, alpha = (sy - beta * sx) / n, rss = Math.max(0, syy - sy * sy / n - beta * cxy);
    return { n, alpha, beta, rss };
  }
  function ols2(y, x) { const S = prefix(y, x), f = fitSeg(S, 0, y.length); return { ...f, res: y.map((v, i) => v - f.alpha - f.beta * x[i]) }; }
  // Chow F statistic at every candidate break in the central (1 - 2 trim) of the sample; sup-F = largest. p-value: residual bootstrap under no break.
  function scanF(y, x, trim) {
    const n = y.length, S = prefix(y, x), full = fitSeg(S, 0, n), lo = Math.floor(trim * n), hi = Math.ceil((1 - trim) * n), F = [], at = [];
    for (let k = lo; k <= hi; k++) { const a = fitSeg(S, 0, k), b = fitSeg(S, k, n), rss = a.rss + b.rss; F.push(rss > 1e-18 ? ((full.rss - rss) / 2) / (rss / (n - 4)) : 0); at.push(k); }
    return { F, at, full };
  }
  function supF(y, x, o = {}) {
    const trim = o.trim ?? 0.15, B = o.B ?? 199, R = Risk.rng(o.seed || 11), sc = scanF(y, x, trim), m = Math.max(...sc.F), k = sc.F.indexOf(m), f = ols2(y, x); let ge = 0;
    for (let b = 0; b < B; b++) { const yb = x.map((xi, i) => f.alpha + f.beta * xi + f.res[Math.floor(R.u() * f.res.length)]); if (Math.max(...scanF(yb, x, trim).F) >= m) ge++; }
    return { ...sc, supF: m, breakAt: sc.at[k], p: (ge + 1) / (B + 1), before: fitSeg(prefix(y, x), 0, sc.at[k]), after: fitSeg(prefix(y, x), sc.at[k], y.length) };
  }
  // OLS-CUSUM: W_t = (1 / (sigma sqrt n)) sum of residuals up to t; under stability sup|W| is Kolmogorov distributed (5% critical value 1.358).
  function cusum(res) {
    const n = res.length, sd = Math.sqrt(res.reduce((s, e) => s + e * e, 0) / (n - 2)) || 1, W = []; let s = 0; for (const e of res) { s += e; W.push(s / (sd * Math.sqrt(n))); }
    return { W, sup: Math.max(...W.map(Math.abs)), crit: 1.358 };
  }

  Object.assign(X, { survival, ladder, ftp, hedged, ols2, supF, cusum });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
