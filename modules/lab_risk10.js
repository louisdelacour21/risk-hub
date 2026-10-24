'use strict';
/* Risk, tenth set: crypto liquidity from daily open/high/low/close/volume. Maths in riskx9.js (tested). */
const r10Sl = (id, label, min, max, step, val, fmt) => ({ id, label, min, max, step, val, fmt });

Lab.reg('liqcrypto', {
  kicker: 'Liquidity risk', title: 'Crypto liquidity from daily prices: spread, impact, cost of exit',
  asset: true,
  lead: 'Without order-book data, liquidity can still be read from daily prices and volumes: the bid-ask spread from the high-low range and from the bounce of closes, and the price impact per dollar traded. Then the cost of selling a given position.',
  controls: [r10Sl('yrs', 'History (years)', 0.5, 4, 0.5, 2, (x) => x + 'y'), r10Sl('pos', 'Position to sell (million dollars)', 1, 2000, 1, 100, (x) => x + ' m'), r10Sl('pr', 'Share of daily volume you accept to trade', 0.01, 0.3, 0.01, 0.1, (x) => (x * 100).toFixed(0) + '%')],
  note: 'Data: daily exchange candles bundled with the app. <b>Corwin-Schultz</b> (2012): spread from the high-low ratios of two consecutive days; days with a negative estimate are set to zero, which biases the average up when the true spread is small. <b>Roll</b> (1984): 2√(−cov of successive price changes); zero when the covariance is positive (trending markets). <b>Amihud</b>: mean of |return| / dollar volume, the return moved per million dollars traded. <b>Parkinson</b>: volatility from the high-low range. Exit cost = half the spread (Corwin-Schultz) plus an impact term: <i>Amihud × position</i> (linear, a rough rule) over the days needed when trading the chosen share of daily volume; waiting adds price risk of <i>σ √(days/2)</i>, shown separately. Daily candles hide intraday spread and depth; centralised-exchange volume may include wash trading; estimates are orders of magnitude, not execution quotes. For the most liquid pairs (Bitcoin, Ether) the real quoted spread is a few hundredths of a percent: these estimators overstate it, and are mostly useful to rank assets and to see how liquidity changes over time.',
  async draw(v, out, ctx) {
    const X = Risk.x, A = ctx.asset && byId(ctx.asset.id); if (!A || !Data.hasOhlcv(A.id)) throw new Error('Pick a single crypto asset with candles (BTC, ETH, SOL, XRP, ADA, DOGE, DOT, LTC, BCH, AVAX).');
    const o = await Data.ohlcv(A.id), n = Math.round(v.yrs * 365), sl = (a) => a.slice(-n), H = sl(o.high), L = sl(o.low), C = sl(o.close), V = sl(o.volumeUsd), ret = C.slice(1).map((c, i) => Math.log(c / C[i]));
    const cs = X.corwinSchultz(H, L), csm = Risk.mean(cs), rl = X.roll(C), am = X.amihud(ret, V.slice(1)), pk = X.parkinson(H, L), adv = Risk.mean(V), days = Math.max(1, v.pos * 1e6 / (v.pr * adv)), half = csm / 2, imp = Math.min(0.5, am * v.pos / 2), risk = pk * Math.sqrt(days / 2);
    const rc = [], rx = []; for (let i = 30; i <= cs.length; i += 5) { rc.push(Risk.mean(cs.slice(i - 30, i))); rx.push(i); }
    out.innerHTML = `<div class="kpis">${kpi('Spread, Corwin-Schultz', pct(csm, 2), 'average of the daily estimates')}${kpi('Spread, Roll', pct(rl, 2), rl === 0 ? 'zero: no negative autocovariance' : 'from the bounce of closes')}${kpi('Amihud impact', (am * 100).toFixed(4) + '%', 'return per million dollars traded')}${kpi('Average daily volume', (adv / 1e6).toFixed(0) + ' m', 'dollars, over ' + C.length + ' days')}${kpi('Daily volatility, Parkinson', pct(pk, 2), 'from the high-low range')}</div>
      ${Lab.table(['Selling ' + v.pos + ' m', 'Value'], [['Days to exit at ' + (v.pr * 100).toFixed(0) + '% of volume', days.toFixed(1)], ['Half-spread cost', pct(half, 2) + ' = ' + (half * v.pos).toFixed(2) + ' m'], ['Price impact (Amihud, linear)', pct(imp, 2) + ' = ' + (imp * v.pos).toFixed(2) + ' m'], ['Total exit cost', pct(half + imp, 2) + ' = ' + ((half + imp) * v.pos).toFixed(2) + ' m'], ['Price risk while waiting (1σ)', pct(risk, 2) + ' = ' + (risk * v.pos).toFixed(2) + ' m']])}
      ${Lab.card('c1', 'Corwin-Schultz spread, 30-day average', [['a', 'spread']])}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: rx, y: rc, c: 'a', w: 2 }], hlines: [{ y: 0 }, { y: csm, c: 'm' }], xfmt: (i) => 'd' + Math.round(i), yfmt: (y) => pct(y, 2), h: 200 }));
  },
});
