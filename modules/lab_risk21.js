'use strict';
/* Risk, twenty-first set: conditional multi-day simulation (filtered historical simulation). Maths in riskx20.js (tested). */
Lab.reg('condsim', {
  kicker: 'Market risk', title: 'Conditional simulation: the same asset, a calm start and a stormy start',
  asset: true,
  lead: 'A multi-day VaR depends on where volatility stands today. Filter the history by its own volatility, then simulate paths from a calm, a median, the current or a stormy starting state, and compare with the square-root-of-time rule and with plain history.',
  controls: [{ id: 'cf', label: 'Confidence', opts: [[0.95, '95%'], [0.99, '99%']], val: 0.99 }, { id: 'h', label: 'Horizon (days)', min: 1, max: 30, step: 1, val: 10, fmt: (x) => x + ' d' }, { id: 'yrs', label: 'History (years)', min: 1, max: 6, step: 0.5, val: 4, fmt: (x) => x + 'y' }, { id: 'lam', label: 'EWMA decay λ', min: 0.85, max: 0.99, step: 0.01, val: 0.94, fmt: (x) => x.toFixed(2) }],
  note: 'Daily log returns are divided by an EWMA volatility forecast (made before seeing the return) to give standardised residuals. Each simulated path then draws residuals at random from that set, multiplies them by a volatility that starts at the chosen state and updates with the simulated return (same λ), and adds up the h days. States are percentiles of the filtered volatility over the history (10th, 50th, 90th) and the last forecast ("current"), which can lie outside the 10th to 90th range. 20,000 paths, fixed seed. The <b>square-root rule</b> scales the one-day figure from the current volatility, which ignores both the fat tails of the residuals and the persistence of volatility. <b>Plain history</b> is the 99th or 95th percentile of overlapping h-day losses in the sample, blind to the present state. Simplifications: one volatility model (no leverage effect), residuals independent of each other, a single asset, no drift.',
  async draw(v, out, ctx) {
    const X = Risk.x, A = ctx.asset && byId(ctx.asset.id); if (!A || !Data.hasOhlcv(A.id)) throw new Error('Pick a single crypto asset with candles (BTC, ETH, SOL, XRP, ADA, DOGE, DOT, LTC, BCH, AVAX).');
    const o = await Data.ohlcv(A.id), close = o.close.slice(-Math.round(v.yrs * 365) - 1), lr = close.slice(1).map((p, i) => Math.log(p / close[i]));
    const f = X.ewmaFilter(lr, v.lam), srt = f.sig.slice(30).sort((a, b) => a - b), pc = (p) => srt[Math.floor(p * (srt.length - 1))];
    const states = [['Calm (10th percentile)', pc(0.1)], ['Median', pc(0.5)], ['Current', f.next], ['Stormy (90th percentile)', pc(0.9)]];
    const rows = states.map(([nm, s]) => { const l = X.fhsPaths(f.z, s, v.h, 20000, 11, v.lam); return [nm, s, X.qtile(l, v.cf), X.esSorted(l, v.cf)]; });
    const hist = []; for (let i = 0; i + v.h <= lr.length; i++) { let c = 0; for (let d = 0; d < v.h; d++) c += lr[i + d]; hist.push(-c); } hist.sort((a, b) => a - b);
    const z = { 0.95: 1.6449, 0.99: 2.3263 }[v.cf], sq = f.next * Math.sqrt(v.h) * z, plain = X.qtile(hist, v.cf), cur = rows[2][2];
    out.innerHTML = `<div class="kpis">${kpi('Conditional VaR, current state', pct(cur, 1), v.h + ' days, ' + pct(v.cf, 0))}${kpi('Square-root rule', pct(sq, 1), pct(sq / cur - 1, 0) + ' against the simulation', sq < cur ? 'bad' : '')}${kpi('Plain history', pct(plain, 1), pct(plain / cur - 1, 0) + ' against the simulation')}${kpi('Stormy over calm', (rows[3][2] / rows[0][2]).toFixed(1) + '×', 'same asset, same residuals')}</div>
      ${Lab.table(['Starting state', 'Daily volatility', 'VaR', 'Expected shortfall'], rows.map(([nm, s, a, b]) => [nm, pct(s, 2), pct(a, 1), pct(b, 1)]))}
      ${Lab.card('c1', 'VaR and expected shortfall by starting state', [['a', 'VaR'], ['r', 'expected shortfall']])}`;
    const ix = [0, 1, 2, 3];
    later(() => Lab.plot($('#c1'), { series: [{ x: ix.map((i) => i - 0.15), y: rows.map((r) => r[2]), c: 'a', bar: true }, { x: ix.map((i) => i + 0.15), y: rows.map((r) => r[3]), c: 'r', bar: true }], hlines: [{ y: 0 }, { y: plain, c: 'm' }], xfmt: (i) => ['Calm', 'Median', 'Current', 'Stormy'][Math.round(i)] || '', yfmt: (y) => pct(y, 0), h: 200 }));
  },
});
