'use strict';
/* Market-risk labs: tail models (EVT), VaR confidence intervals, correlations, volatility cone. Maths in quant.js. */

Lab.reg('evt', {
  kicker: 'Market risk', title: 'Tails & extreme value theory', asset: true,
  lead: 'Normal VaR ignores fat tails; historical VaR cannot look beyond the worst day it has seen. Extreme value theory fits a Pareto-type law to the worst losses only (peaks over threshold) and extrapolates.',
  controls: [{ id: 'u', label: 'Threshold (quantile of losses)', min: 0.85, max: 0.98, step: 0.005, val: 0.95, fmt: (x) => (x * 100).toFixed(1) + '%' }, { id: 'c', label: 'Confidence', min: 0.95, max: 0.999, step: 0.001, val: 0.99, fmt: (x) => (x * 100).toFixed(1) + '%' }],
  note: '<b>How to read it.</b> Above a high threshold u, the excesses follow a generalised Pareto law with shape ξ and scale β. ξ &gt; 0 means a heavy tail (a power law with index 1/ξ); equity indices typically give ξ around 0.2-0.35. The <b>mean-excess plot</b> should be roughly a straight line above a good threshold; the <b>QQ-plot</b> bends away from the diagonal when the data are fatter-tailed than a normal; the <b>Hill plot</b> should be flat where the tail index is stable. VaR<sub>p</sub> = u + β/ξ·((n/N<sub>u</sub>·(1−p))<sup>−ξ</sup> − 1).',
  draw(v, out, { r, asset }) {
    const L = r.map((x) => -x), t = Risk.evtTail(L, v.u, v.c); if (!t) throw new Error('Too few exceedances above this threshold: lower it.');
    const h = Risk.historical(r, v.c), n = Risk.normal(r, v.c), f = (x) => pct(x, 2);
    out.innerHTML = `<div class="kpis">${kpi('Historical VaR / ES', f(h.var) + ' / ' + f(h.es), asset.name)}${kpi('Normal VaR / ES', f(n.var) + ' / ' + f(n.es), 'ignores fat tails')}${kpi('EVT VaR / ES', f(t.var) + ' / ' + (Number.isFinite(t.es) ? f(t.es) : '∞'), 'GPD extrapolation')}${kpi('Tail shape ξ', t.xi.toFixed(3), `β = ${t.beta.toFixed(4)} · ${t.Nu} exceedances`)}</div>
      <div class="duo">${Lab.card('c1', 'Mean-excess plot')}${Lab.card('c2', 'Normal QQ-plot of returns')}${Lab.card('c3', 'Hill plot (tail index α)')}${Lab.card('c4', 'Tail: P(loss > x), log10', [['a', 'empirical'], ['y', 'GPD fit'], ['r', 'normal']])}</div>`;
    const me = Risk.meanExcess(L); Lab.plot($('#c1'), { series: [{ x: me.map((a) => a.u), y: me.map((a) => a.e), c: 'a' }], xfmt: (x) => pct(x, 1), yfmt: (x) => pct(x, 2), vlines: [{ x: t.u, t: 'u' }], h: 230 });
    const q = Risk.qqPoints(r); Lab.plot($('#c2'), { series: [{ x: [-4, 4], y: [-4, 4], c: 'm', dash: [4, 4], w: 1 }, { x: q.map((a) => a.t), y: q.map((a) => a.z), c: 'a', dots: true, r: 1.8 }], xfmt: (x) => x.toFixed(0), yfmt: (x) => x.toFixed(0), xlim: [-4, 4], ylim: [-8, 6], h: 230 });
    const hl = Risk.hill(L, Math.min(400, Math.floor(L.length / 5))); Lab.plot($('#c3'), { series: [{ x: hl.map((a) => a.k), y: hl.map((a) => a.alpha), c: 'b' }], xfmt: (x) => Math.round(x), yfmt: (x) => x.toFixed(1), hlines: [{ y: 1 / t.xi, t: 'GPD 1/ξ', c: 'y' }], h: 230 });
    const s = L.slice().sort((a, b) => b - a), top = Math.max(t.Nu, 20), m = Risk.mean(L), sd = Risk.std(L), N = L.length, xs = s.slice(0, top).reverse(), rk = (x) => s.indexOf(x) + 1;
    const emp = xs.map((x) => Math.log10(rk(x) / N)), gp = xs.map((x) => Math.log10(Math.max(1 - t.cdf(Math.max(x, t.u)), 1e-12))), nm = xs.map((x) => Math.log10(Math.max(1 - Risk.normCdf((x - m) / sd), 1e-12)));
    Lab.plot($('#c4'), { series: [{ x: xs, y: nm, c: 'r' }, { x: xs, y: gp, c: 'y' }, { x: xs, y: emp, c: 'a', dots: true, r: 2 }], xfmt: (x) => pct(x, 0), yfmt: (x) => x.toFixed(1), h: 230 });
  },
});

Lab.reg('ci', {
  kicker: 'Market risk', title: 'How sure is your VaR?', asset: true,
  lead: 'A VaR computed from 500 days is an estimate, not a fact. Here is its error bar, in two ways: a distribution-free interval from order statistics, and a bootstrap that resamples the history.',
  controls: [{ id: 'c', label: 'Confidence', min: 0.9, max: 0.995, step: 0.005, val: 0.99, fmt: (x) => (x * 100).toFixed(1) + '%' }, { id: 'w', label: 'Window (days)', min: 250, max: 2500, step: 50, val: 750, fmt: String },
    { id: 'blk', label: 'Bootstrap', opts: [[1, 'iid'], [20, 'stationary (blocks of ~20)']], val: 1 }],
  note: '<b>Order statistics:</b> the VaR is the k-th worst loss, and the number of losses beyond the true quantile is Binomial(n, 1−p), so the 95% interval is read from the ranks where the binomial CDF crosses 2.5% and 97.5%. No distribution is assumed. <b>Bootstrap:</b> redraw the same number of days with replacement hundreds of times and recompute VaR each time; the <b>stationary</b> version draws blocks (Politis-Romano) so volatility clustering is kept. Expected Shortfall has no simple formula for its error, which is why the bootstrap is used for it.',
  draw(v, out, { r }) {
    const w = Math.min(v.w, r.length), x = r.slice(-w), h = Risk.historical(x, v.c), ci = Risk.varCI(x, v.c), bt = Risk.bootstrapVar(x, v.c, 500, v.blk), f = (z) => pct(z, 2);
    const hs = histo(bt.v, 28), ws = [250, 500, 1000, 1500, 2000, r.length].filter((a, i, arr) => a <= r.length && arr.indexOf(a) === i), wd = ws.map((k) => { const c = Risk.varCI(r.slice(-k), v.c); return (c.hi - c.lo) / Risk.historical(r.slice(-k), v.c).var; });
    out.innerHTML = `<div class="kpis">${kpi('Historical VaR', f(h.var), `${w} days`)}${kpi('95% interval (ranks)', `${f(ci.lo)} – ${f(ci.hi)}`, `ranks ${ci.ranks[0]} to ${ci.ranks[1]}`)}${kpi('95% interval (bootstrap)', `${f(bt.vCI[0])} – ${f(bt.vCI[1])}`, 'VaR')}${kpi('ES and its error', f(h.es), `bootstrap 95%: ${f(bt.eCI[0])} – ${f(bt.eCI[1])}`)}</div>
      <div class="duo">${Lab.card('c1', 'Bootstrap distribution of the VaR')}${Lab.card('c2', 'Relative width of the 95% interval vs window')}</div>`;
    Lab.plot($('#c1'), { series: [{ x: hs.x, y: hs.y, bar: true, c: 'a', alpha: 0.7 }], xfmt: (z) => pct(z, 1), yfmt: (z) => Math.round(z), vlines: [{ x: h.var, t: 'VaR', c: 'y' }], h: 230 });
    Lab.plot($('#c2'), { series: [{ x: ws, y: wd, c: 'b', w: 1.2 }, { x: ws, y: wd, c: 'b', dots: true, r: 4 }], xfmt: (z) => Math.round(z), yfmt: (z) => pct(z, 0), h: 230 });
  },
});

Lab.reg('corr', {
  kicker: 'Market risk', title: 'Correlations that move',
  lead: 'Diversification rests on correlation, and correlation is not a constant: it jumps in crises, exactly when you need it to stay low. Compare an exponentially weighted estimate with the full-sample number.',
  controls: [{ id: 'a', label: 'Asset A', sel: assetOpts, val: 'btc' }, { id: 'b', label: 'Asset B', sel: assetOpts, val: 'eth' }, { id: 'l', label: 'EWMA λ', min: 0.8, max: 0.995, step: 0.005, val: 0.94, fmt: (x) => x.toFixed(3) }],
  note: '<b>EWMA correlation:</b> ρ<sub>t</sub> = σ<sub>12,t</sub> / √(σ<sub>1,t</sub>² σ<sub>2,t</sub>²) where each term is updated as λ·previous + (1−λ)·today (RiskMetrics). A low λ reacts fast and is noisy; λ near 1 is smooth and slow. The 250-day rolling window is shown for comparison.',
  async draw(v, out) {
    const A = byId(v.a), B = byId(v.b); if (!A || !B || A === B) throw new Error('Pick two different assets.'); await Data.ensure(A); await Data.ensure(B);
    const pr = Data.portfolioReturns([A, B], [1, 1]), x = pr.parts[0].r, y = pr.parts[1].r, e = Risk.ewmaCorr(x, y, v.l), full = Risk.corr(x, y), dates = pr.dates.slice(1);
    const roll = []; for (let i = 250; i <= x.length; i++) roll.push(Risk.corr(x.slice(i - 250, i), y.slice(i - 250, i)));
    out.innerHTML = `<div class="kpis">${kpi('Full-sample ρ', full.toFixed(2), `${x.length} common days`)}${kpi('EWMA today', e[e.length - 1].toFixed(2), dates[dates.length - 1])}${kpi('EWMA minimum', Math.min(...e.slice(60)).toFixed(2), '')}${kpi('EWMA maximum', Math.max(...e.slice(60)).toFixed(2), '')}</div>${Lab.card('c1', 'Correlation over time', [['a', 'EWMA'], ['y', '250-day rolling']])}
      ${Lab.card('c2', 'Scatter of daily returns (last 500 days)')}`;
    const ix = e.map((_, i) => i + 1), rx = roll.map((_, i) => i + 250);
    Lab.plot($('#c1'), { series: [{ x: rx, y: roll, c: 'y', w: 1.4 }, { x: ix, y: e, c: 'a', w: 1.6 }], hlines: [{ y: full, c: 'm', t: 'full ' + full.toFixed(2) }, { y: 0 }], xfmt: dateAxis(dates), yfmt: (z) => z.toFixed(1), ylim: [-1, 1], h: 260 });
    Lab.plot($('#c2'), { series: [{ x: x.slice(-500), y: y.slice(-500), c: 'b', dots: true, r: 2, alpha: 0.6 }], xfmt: (z) => pct(z, 0), yfmt: (z) => pct(z, 0), h: 260 });
  },
});

Lab.reg('volcone', {
  kicker: 'Market risk', title: 'Volatility cone', asset: true,
  lead: 'Is today\'s volatility high or low? Compare realised volatility over several horizons with the range it has covered in the past. Short horizons swing widely, long ones are calm.',
  controls: [],
  note: 'For each window length (5 to 252 days), every possible rolling window in the history gives one annualised volatility; the cone shows the minimum, quartiles and maximum, and the red dot is the latest value. A dot near the top of the cone means vol is unusually high for that horizon.',
  draw(v, out, { r }) {
    const vc = Risk.volCone(r); if (!vc.length) throw new Error('Not enough data.');
    const where = (c) => { const q = (c.now - c.min) / (c.max - c.min || 1); return q > 0.66 ? 'high' : q < 0.33 ? 'low' : 'middle'; };
    out.innerHTML = Lab.card('c1', 'Annualised volatility by horizon', [['m', 'min / max'], ['b', 'quartiles'], ['a', 'median'], ['r', 'now']]) + Lab.table(['Window', 'Now', 'Min', '25%', 'Median', '75%', 'Max', 'Now is'], vc.map((c) => [c.w + ' d', pct(c.now, 1), pct(c.min, 1), pct(c.p25, 1), pct(c.med, 1), pct(c.p75, 1), pct(c.max, 1), where(c)]));
    const x = vc.map((c) => c.w);
    Lab.plot($('#c1'), { series: [{ x, y: vc.map((c) => c.max), c: 'm', w: 1 }, { x, y: vc.map((c) => c.p75), c: 'b', w: 1.2 }, { x, y: vc.map((c) => c.med), c: 'a', w: 2 }, { x, y: vc.map((c) => c.p25), c: 'b', w: 1.2 }, { x, y: vc.map((c) => c.min), c: 'm', w: 1 }, { x, y: vc.map((c) => c.now), c: 'r', dots: true, r: 5 }], xfmt: (z) => Math.round(z) + 'd', yfmt: (z) => pct(z, 0), h: 300 });
  },
});
