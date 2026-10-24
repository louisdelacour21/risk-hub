'use strict';
/* Risk, sixteenth set: copula families fitted by maximum likelihood and compared by AIC, and the stability of crypto correlations. Maths in riskx15.js (tested). */
const r16Sl = (id, label, min, max, step, val, fmt) => ({ id, label, min, max, step, val, fmt });
const r16Book = [['btc', 'BTC'], ['eth', 'ETH'], ['sol', 'SOL'], ['xrp', 'XRP'], ['ada', 'ADA']];

Lab.reg('copfit', {
  kicker: 'Market risk', title: 'Which copula fits? Gaussian, t, Clayton or Gumbel',
  lead: 'Two assets with the same correlation can crash together or not, depending on the copula that ties them. Fit the four usual families by maximum likelihood and let the AIC say which one the data prefer, and how much joint crash risk it implies.',
  controls: [{ id: 'a', label: 'Asset A', sel: assetOpts, val: 'btc' }, { id: 'b', label: 'Asset B', sel: assetOpts, val: 'eth' }, r16Sl('yrs', 'History (years)', 1, 6, 0.5, 3, (x) => x + 'y')],
  note: 'Margins are removed by ranks (pseudo-observations rank/(n+1)), so only the dependence is fitted. Each family has its parameter estimated by maximum likelihood (the t copula also scans the degrees of freedom on a grid from 2 to 50). <b>AIC</b> = 2k − 2·log-likelihood, k the number of parameters: the lowest wins, a gap above 10 is decisive. <b>Tail dependence</b> is the probability that one asset is in its extreme tail given the other is: Gaussian has none, Clayton only in the lower (joint crash) tail, Gumbel only in the upper tail, t in both. Simplifications: static parameters (no time variation), daily returns treated as independent over time, no goodness-of-fit test beyond the AIC comparison.',
  async draw(v, out) {
    const A = byId(v.a), B = byId(v.b); if (!A || !B || A === B) throw new Error('Pick two different assets.'); await Data.ensure(A); await Data.ensure(B);
    const pr = Data.portfolioReturns([A, B], [1, 1]), n = Math.min(pr.parts[0].r.length, Math.round(v.yrs * 365)), x = pr.parts[0].r.slice(-n), y = pr.parts[1].r.slice(-n);
    const fits = Risk.x.fitCopulas(x, y), best = fits[0], tau = Risk.x.avgCorr([x, y]), par = (f) => Object.entries(f.par).map(([k, p]) => (k === 'rho' ? 'ρ' : k === 'nu' ? 'ν' : 'θ') + ' = ' + (+p).toFixed(2)).join(', ');
    out.innerHTML = `<div class="kpis">${kpi('Best fit', best.name, par(best), 'ok')}${kpi('Correlation', tau.toFixed(2), n + ' common days')}${kpi('Lower tail dependence', pct(best.lower, 0), 'joint crash given one crash, best model', best.lower > 0.3 ? 'bad' : '')}${kpi('AIC gap to second', (fits[1].aic - best.aic).toFixed(1), 'above 10 is decisive')}</div>
      ${Lab.table(['Family', 'Parameters', 'Log-likelihood', 'AIC', 'Δ AIC', 'Lower tail dep.', 'Upper tail dep.'], fits.map((f) => [f.name, par(f), f.ll.toFixed(1), f.aic.toFixed(1), (f.aic - best.aic).toFixed(1), pct(f.lower, 1), pct(f.upper, 1)]))}
      ${Lab.card('c1', 'Akaike information criterion by family (lower is better)', [['a', 'AIC'], ['m', 'best']])}`;
    const ix = fits.map((_, i) => i);
    later(() => Lab.plot($('#c1'), { series: [{ x: ix, y: fits.map((f) => f.aic), c: 'a', bar: true }], hlines: [{ y: best.aic }], xfmt: (i) => (fits[Math.round(i)] || { name: '' }).name, yfmt: (y) => y.toFixed(0), h: 200 }));
  },
});

Lab.reg('corrstab', {
  kicker: 'Market risk', title: 'Correlation stability: does diversification survive a crash?',
  lead: 'Diversification rests on correlations, and correlations move. Follow the average pairwise correlation of five large crypto assets through time, and compare it on the worst days of their basket with all other days.',
  controls: [r16Sl('w', 'Rolling window (days)', 60, 500, 10, 180, (x) => x + ' d'), r16Sl('f', 'Worst days of the basket', 0.02, 0.2, 0.01, 0.1, (x) => pct(x, 0)), r16Sl('yrs', 'History (years)', 1, 6, 0.5, 4, (x) => x + 'y')],
  note: 'The set is BTC, ETH, SOL, XRP and ADA. The <b>average correlation</b> is the mean of the 10 pairwise Pearson correlations. The rolling curve moves forward 5 days at a time. The “worst days” are the days when the equal-weight basket lost the most; the number reported there is computed on those days only. Selecting days by the sum of the returns removes part of the variation by construction, so the conditional correlation understates what happens in a real crisis: read the gap as a lower bound on the instability. Simplifications: Pearson correlation only, equal-weight basket, calendar days with no gaps (crypto trades every day).',
  async draw(v, out) {
    const list = r16Book.map(([id]) => byId(id)).filter(Boolean); for (const a of list) await Data.ensure(a);
    const pr = Data.portfolioReturns(list, list.map(() => 1)), n = Math.min(...pr.parts.map((p) => p.r.length), Math.round(v.yrs * 365)), R = pr.parts.map((p) => p.r.slice(-n));
    if (n <= v.w + 10) throw new Error('Window too long for this history.');
    const s = Risk.x.corrStability(R, v.w, v.f), lo = Math.min(...s.roll), hi = Math.max(...s.roll), cur = s.roll[s.roll.length - 1];
    out.innerHTML = `<div class="kpis">${kpi('Average correlation', s.all.toFixed(2), n + ' days')}${kpi('On the worst days', s.worst.toFixed(2), s.m + ' days of ' + n, s.worst > s.rest ? 'bad' : '')}${kpi('On all other days', s.rest.toFixed(2), 'gap ' + (s.worst - s.rest >= 0 ? '+' : '') + (s.worst - s.rest).toFixed(2))}${kpi('Rolling range', lo.toFixed(2) + ' to ' + hi.toFixed(2), 'now ' + cur.toFixed(2))}</div>
      ${Lab.card('c1', 'Average pairwise correlation over a rolling window', [['a', 'rolling correlation'], ['m', 'full-sample average']])}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: s.at.map((_, i) => i), y: s.roll, c: 'a', w: 2 }], hlines: [{ y: s.all }], xfmt: (i) => '', yfmt: (y) => y.toFixed(2), h: 220 }));
  },
});
