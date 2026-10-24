'use strict';
/* Performance labs: risk-adjusted ratios, Markowitz frontier, beta/alpha. */
const benchOpt = { id: 'bm', label: 'Benchmark', sel: () => assetOptsPf(), val: 'btc' };
async function alignedPair(a, bId) {
  const b = await resolveAsset(bId);
  if (a.id === b.id) { const r = Data.returnsOf(a).r; return { y: r, x: r, dates: Data.returnsOf(a).dates }; }
  const p = Data.portfolioReturns([a, b], [1, 0]); return { y: p.parts[0].r, x: p.parts[1].r, dates: p.dates };
}

Lab.reg('factor', {
  kicker: 'Performance', title: 'Beta, alpha and the single-factor model',
  lead: 'How much of an asset is just the market? Regress its returns on a benchmark: the slope is beta, the intercept is alpha, and what is left is the idiosyncratic risk.',
  asset: true, controls: [benchOpt, { id: 'w', label: 'Rolling window (days)', min: 40, max: 500, step: 10, val: 126, fmt: String }],
  note: 'R<sub>asset</sub> = α + β·R<sub>benchmark</sub> + ε, estimated by least squares on daily returns that share the same dates. <b>β</b> is the sensitivity to the market: a stock with β = 1.3 moves 1.3% for 1% of the index. <b>α</b> (annualised) is the average return not explained by the market. <b>R²</b> is the share of the variance that comes from the market; the rest is specific risk that diversification removes. Beta is not stable: the rolling estimate shows how much it drifts, and it usually jumps in crises when correlations rise.',
  async draw(v, out, ctx) {
    const pr = await alignedPair(ctx.asset, v.bm), g = Risk.regress(pr.y, pr.x), rb = Risk.rollingBeta(pr.y, pr.x, v.w), sv = Math.sqrt(1 - g.r2) * Risk.std(pr.y) * Math.sqrt(PPY), tv = Risk.std(pr.y) * Math.sqrt(PPY);
    const step = Math.max(1, Math.floor(pr.y.length / 700)), sx = [], sy = []; for (let i = 0; i < pr.y.length; i += step) { sx.push(pr.x[i]); sy.push(pr.y[i]); }
    const lo = Math.min(...sx), hi = Math.max(...sx);
    out.innerHTML = `<div class="kpis">${kpi('Beta', g.beta.toFixed(2), `vs ${esc(byId(v.bm).name)}`)}${kpi('Alpha (annual)', pct(g.alpha * PPY, 2), 'return unexplained by the market')}${kpi('R²', g.r2.toFixed(2), `${pct(g.r2, 0)} of variance is market`)}${kpi('Specific volatility', pct(sv, 1), `of total ${pct(tv, 1)}`)}</div>
      <div class="duo">${Lab.card('c1', 'Daily returns: asset vs benchmark', [['m', 'days'], ['a', 'regression line']])}${Lab.card('c2', `Rolling beta (${v.w} days)`, null)}</div>`;
    Lab.plot($('#c1'), { series: [{ x: sx, y: sy, c: 'm', dots: true, r: 1.8, alpha: 0.5 }, { x: [lo, hi], y: [g.alpha + g.beta * lo, g.alpha + g.beta * hi], c: 'a', w: 2.4 }], hlines: [{ y: 0 }], xfmt: (z) => pct(z, 0), yfmt: (z) => pct(z, 0), h: 260 });
    const dd = pr.dates ? pr.dates.slice(v.w - 1) : null;
    Lab.plot($('#c2'), { series: [{ x: rb.map((_, i) => i), y: rb, c: 'a', w: 1.6 }], hlines: [{ y: g.beta, c: 'y', t: 'full sample' }, { y: 1, c: 'm' }], xfmt: dateAxis(dd), yfmt: (z) => z.toFixed(1), h: 260 });
  },
});
