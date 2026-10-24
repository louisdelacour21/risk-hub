'use strict';
/* Risk, twenty-second set: key-rate DV01 and the six BCBS interest-rate shock scenarios on a bond book. Maths in riskx21.js (tested). */
Lab.reg('krd', {
  kicker: 'Rates', title: 'Key-rate DV01 and the six Basel rate-shock scenarios',
  lead: 'One DV01 hides where on the curve a book is exposed. Bump each maturity on its own to see the exposure by key rate, then apply the six standard Basel shocks (parallel, steepener, flattener, short up, short down) and revalue in full.',
  controls: [{ id: 'cv', label: 'Curve', opts: [['usd', 'US Treasury'], ['eur', 'Euro area']], val: 'usd' },
    ...[['n2', '2-year par bond (notional)', 50], ['n5', '5-year par bond', 0], ['n10', '10-year par bond', 100], ['n30', '30-year par bond', -20]].map(([id, label, val]) => ({ id, label, min: -100, max: 100, step: 10, val, fmt: (x) => String(x) }))],
  note: 'Bonds are par bonds with a semi-annual coupon equal to the interpolated zero rate; the book is priced on the latest zero curve of the data folder (US par yields are bootstrapped first). A key-rate DV01 is the value change for +1 bp on one curve node, the neighbours kept, with linear interpolation between nodes, so the key rates add up to the parallel DV01 up to a second-order term. The scenarios follow the BCBS IRRBB standard (d368): parallel ±, short ± decaying as e<sup>−t/4</sup>, steepener and flattener mixing short and long shocks, with the standard size by currency (USD 200/300/150 bp, EUR 200/250/100 bp). The floor on shocked rates (−1% at the front, rising 5 bp a year to zero) is applied to the zero rates. Simplifications: no credit spread, no optionality, no behavioural assumptions, the shocks hit zero rates instead of the swap curve.',
  async draw(v, out) {
    const X = Risk.x, c = await Data.loadRates(v.cv), i = c.rates.length - 1, z = c.zero(i).map((x) => x / 100), ys = [], zs = [], tn = [];
    c.years.forEach((y, j) => { if (Number.isFinite(z[j])) { ys.push(y); zs.push(z[j]); tn.push(c.tenors[j]); } });
    const at = (T) => Risk.interpRate(ys, zs, T), book = [[2, v.n2], [5, v.n5], [10, v.n10], [30, v.n30]].filter(([, n]) => n !== 0).map(([T, n]) => ({ notional: n, flows: X.bondFlows(at(T), T) }));
    if (!book.length) throw new Error('Set at least one notional different from zero.');
    const k = X.keyRateDv01(book, ys, zs), sc = X.bcbsScenarios(book, ys, zs, X.BCBS[v.cv]), worst = sc.reduce((a, b) => (b.pnl < a.pnl ? b : a)), gross = book.reduce((s, b) => s + Math.abs(b.notional), 0);
    const f2 = (x) => x.toFixed(3), shocks = X.BCBS[v.cv];
    out.innerHTML = `<div class="kpis">${kpi('Parallel DV01', f2(k.parallel), 'per +1 bp, notional in millions')}${kpi('Worst Basel scenario', worst.name, f2(worst.pnl) + ' (' + pct(worst.pnl / gross, 1) + ' of gross notional)', 'bad')}${kpi('Largest key rate', tn[k.kr.reduce((a, x, j) => (Math.abs(x) > Math.abs(k.kr[a]) ? j : a), 0)], 'sum of key rates ' + f2(k.total))}${kpi('Shock sizes', `${shocks.par}/${shocks.short}/${shocks.long} bp`, 'parallel / short / long')}</div>
      ${Lab.card('c1', 'Key-rate DV01 by curve node', [['a', 'DV01 per +1 bp']])}
      ${Lab.table(['Scenario', 'P&L (full revaluation)', '% of gross notional'], sc.map((s) => [s.name, f2(s.pnl), pct(s.pnl / gross, 2)]))}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: ys.map((_, j) => j), y: k.kr, c: 'a', bar: true }], hlines: [{ y: 0 }], xfmt: (j) => tn[Math.round(j)] || '', yfmt: (y) => y.toFixed(2), h: 220 }));
  },
});
