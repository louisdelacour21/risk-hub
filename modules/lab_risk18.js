'use strict';
/* Risk, eighteenth set: option book (Greeks, spot and volatility stress), margin calls on a leveraged long, liquidity ladder with a crypto buffer. Maths in riskx17.js (tested). */
const r18Sl = (id, label, min, max, step, val, fmt) => ({ id, label, min, max, step, val, fmt });
const r18Px = async (ctx, yrs) => {
  const A = ctx.asset && byId(ctx.asset.id); if (!A || !Data.hasOhlcv(A.id)) throw new Error('Pick a single crypto asset with candles (BTC, ETH, SOL, XRP, ADA, DOGE, DOT, LTC, BCH, AVAX).');
  const o = await Data.ohlcv(A.id), close = o.close.slice(-Math.round(yrs * 365) - 1); return { A, close, lr: close.slice(1).map((p, i) => Math.log(p / close[i])) };
};
const r18Fmt = (x) => Math.round(x).toLocaleString('en-US');

Lab.reg('optbook', {
  kicker: 'Market risk', title: 'Option book: Greeks, and what a spot and volatility shock does',
  asset: true,
  lead: 'A book of options hides its risk in the Greeks. Pick a strategy, read its delta, gamma, vega and theta, then revalue it in full on a grid of spot and volatility shocks to see where the Greeks stop telling the truth.',
  controls: [{ id: 'st', label: 'Strategy', opts: [['ss', 'Short straddle'], ['ls', 'Long straddle'], ['rr', 'Risk reversal (long call, short put)'], ['cs', 'Short strangle'], ['bf', 'Long butterfly']], val: 'ss' }, r18Sl('T', 'Maturity (days)', 3, 180, 1, 30, (x) => x + ' d'), r18Sl('n', 'Number of options', 1, 100, 1, 10, String), r18Sl('vs', 'Volatility shock (points)', 0.05, 0.4, 0.05, 0.2, (x) => '±' + Math.round(x * 100))],
  note: 'Spot is the last close, volatility the 30-day realised volatility (annualised on 365 days), a stand-in for the implied volatility that is not published here; one volatility for all strikes, so no smile. Strikes sit at 100%, with wings at ±10%. <b>Greeks</b> are central differences of Black-Scholes on the whole book: delta in units of the asset, gamma per unit of spot, vega for 1.00 of volatility, theta per year. The <b>grid</b> is a full revaluation, not a Greek expansion: compare its centre column with delta × shock + ½ gamma × shock² to see the error of the Taylor expansion. Gamma is largest at the money and explodes near expiry (pin risk): the chart shows it for the book as maturity shortens. Simplifications: zero interest rate, no smile, no early exercise, no margin.',
  async draw(v, out, ctx) {
    const X = Risk.x, { A, close, lr } = await r18Px(ctx, 1), S = close[close.length - 1], sg = Risk.std(lr.slice(-30)) * Math.sqrt(365), T = v.T / 365, N = v.n;
    const L = (call, k, q) => ({ call, K: k * S, T, qty: q * N }), legs = { ss: [L(true, 1, -1), L(false, 1, -1)], ls: [L(true, 1, 1), L(false, 1, 1)], rr: [L(true, 1.1, 1), L(false, 0.9, -1)], cs: [L(true, 1.1, -1), L(false, 0.9, -1)], bf: [L(true, 0.9, 1), L(true, 1, -2), L(true, 1.1, 1)] }[v.st];
    const g = X.bookGreeks(legs, S, sg), dS = [-0.3, -0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.2, 0.3], dV = [-v.vs, 0, v.vs], G = X.bookGrid(legs, S, sg, dS, dV);
    const taylor = (a) => g.delta * S * a + 0.5 * g.gamma * (S * a) ** 2, worst = Math.min(...G.flat());
    const days = Array.from({ length: 12 }, (_, i) => Math.max(1, Math.round(v.T * (1 - i / 12))) ), xs = Array.from({ length: 41 }, (_, i) => 0.7 + i * 0.0075);
    const gam = (d, s) => X.bookGreeks(legs.map((l) => ({ ...l, T: d / 365 })), s * S, sg).gamma;
    out.innerHTML = `<div class="kpis">${kpi('Delta', g.delta.toFixed(2), 'in units of ' + A.id.toUpperCase() + ' (' + r18Fmt(g.delta * S) + ' dollars)')}${kpi('Gamma', g.gamma.toExponential(2), 'per unit of spot')}${kpi('Vega', r18Fmt(g.vega / 100), 'dollars per volatility point', g.vega < 0 ? 'bad' : '')}${kpi('Theta', r18Fmt(g.theta / 365), 'dollars per day', g.theta > 0 ? 'ok' : '')}${kpi('Worst grid cell', r18Fmt(worst), 'full revaluation', worst < 0 ? 'bad' : '')}</div>
      ${Lab.table(['Spot shock', 'Vol −' + Math.round(v.vs * 100), 'Vol flat', 'Vol +' + Math.round(v.vs * 100), 'Greek expansion (flat vol)'], dS.map((a, i) => [pct(a, 0), r18Fmt(G[i][0]), r18Fmt(G[i][1]), r18Fmt(G[i][2]), r18Fmt(taylor(a))]))}
      ${Lab.card('c1', 'Gamma of the book against spot, for three times to expiry', [['a', v.T + ' days'], ['b', Math.max(1, Math.round(v.T / 4)) + ' days'], ['r', '1 day']])}`;
    later(() => Lab.plot($('#c1'), { series: [[v.T, 'a'], [Math.max(1, Math.round(v.T / 4)), 'b'], [1, 'r']].map(([d, c]) => ({ x: xs, y: xs.map((s) => gam(d, s)), c, w: 2 })), hlines: [{ y: 0 }], vlines: [{ x: 1, c: 'm' }], xfmt: (x) => pct(x, 0), yfmt: (y) => y.toExponential(0), h: 210 }));
  },
});

Lab.reg('margincall', {
  kicker: 'Liquidity', title: 'Margin calls on a leveraged long: how often, how much cash',
  asset: true,
  lead: 'A leveraged position does not only risk its loss: it risks being forced to add cash at the worst moment. Replay the history of the asset and count the margin calls a leveraged long would have received.',
  controls: [r18Sl('lev', 'Leverage (position / equity)', 1.5, 5, 0.5, 3, (x) => x + '×'), r18Sl('mt', 'Maintenance margin (equity / position)', 0.05, 0.4, 0.01, 0.25, (x) => pct(x, 0)), r18Sl('h', 'Holding period (days)', 3, 90, 1, 14, (x) => x + ' d'), r18Sl('yrs', 'History (years)', 1, 6, 0.5, 4, (x) => x + 'y')],
  note: 'Every possible start day in the history is a scenario. The position is worth lev × the equity at the start, the loan is (lev − 1) × equity and is never repaid. After each daily close, if equity / position falls under the maintenance ratio, the holder tops up cash to bring it back to the initial ratio 1/lev (a top-up repays part of the loan). Cash is expressed as a share of the initial equity. A call is also a loss realised if the holder cannot pay and is liquidated: this module counts the need, not the default. Simplifications: closes only (no intraday spikes, which make real calls more frequent), no funding rate, no liquidation fee, a single maintenance level.',
  async draw(v, out, ctx) {
    const X = Risk.x, { A, lr } = await r18Px(ctx, v.yrs), m = X.marginCalls(lr, v.h, v.lev, v.mt), levs = [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5], rows = levs.map((l) => [l, X.marginCalls(lr, v.h, l, v.mt)]);
    out.innerHTML = `<div class="kpis">${kpi('Windows with a call', pct(m.pHit, 1), m.n + ' start days, ' + v.h + ' days each', m.pHit > 0.1 ? 'bad' : '')}${kpi('Average calls per window', m.avgCalls.toFixed(2), 'top-ups made')}${kpi('Average cash called', pct(m.avgCash, 1), 'of the initial equity')}${kpi('Worst cash called', pct(m.worstCash, 0), 'of the initial equity', m.worstCash > 0.5 ? 'bad' : '')}</div>
      ${Lab.table(['Leverage', 'Windows with a call', 'Average cash', 'Worst cash'], rows.map(([l, r]) => [l + '×', pct(r.pHit, 1), pct(r.avgCash, 1), pct(r.worstCash, 0)]))}
      ${Lab.card('c1', 'Share of windows with a margin call, by leverage', [['a', 'with a call'], ['m', 'chosen leverage']])}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: levs, y: rows.map(([, r]) => r.pHit), c: 'a', w: 2, dots: true }], vlines: [{ x: v.lev, c: 'm' }], hlines: [{ y: 0 }], xfmt: (x) => x + '×', yfmt: (y) => pct(y, 0), h: 200 }));
  },
});

Lab.reg('fundwall', {
  kicker: 'Liquidity', title: 'Liquidity ladder: does a crypto buffer cover the outflows?',
  asset: true,
  lead: 'A liquidity buffer held in a volatile asset shrinks just when it is needed. Line up the expected outflows by horizon against the buffer, once at market value and once after the loss that asset has suffered over the same horizon.',
  controls: [r18Sl('buf', 'Buffer (value today)', 50, 500, 10, 100, String), { id: 'cf', label: 'Stress level', opts: [[0.95, '95%'], [0.99, '99%']], val: 0.99 }, r18Sl('o1', 'Outflow within 1 week', 0, 100, 5, 15, String), r18Sl('o2', 'Outflow week 2 to 1 month', 0, 100, 5, 25, String), r18Sl('o3', 'Outflow month 2 to 3', 0, 100, 5, 30, String), r18Sl('o4', 'Outflow month 4 to 6', 0, 100, 5, 20, String), r18Sl('o5', 'Outflow month 7 to 12', 0, 100, 5, 30, String)],
  note: 'Outflows are in the same unit as the buffer and add up over the buckets (the gap is the buffer minus the cumulative outflow). The <b>stressed buffer</b> is the buffer times (1 − haircut), the haircut being the expected shortfall of the asset over the horizon of the bucket at the chosen level, estimated on overlapping windows of its own history (7, 30, 90, 180 and 365 days). The first bucket where the gap turns negative is the <b>survival horizon</b>. Longer windows have fewer independent observations: the 365-day figure rests on a handful of episodes. Simplifications: the buffer is entirely in one asset, no sale cost or slippage, no inflows, outflows assumed certain.',
  async draw(v, out, ctx) {
    const { A, close } = await r18Px(ctx, 6), hs = [7, 30, 90, 180, 365], name = ['1 week', '1 month', '3 months', '6 months', '12 months'];
    const hc = hs.map((h) => { const r = []; for (let s = 0; s + h < close.length; s++) r.push(1 - close[s + h] / close[s]); r.sort((a, b) => b - a); const m = Math.max(1, Math.ceil(r.length * (1 - v.cf))); return Math.max(0, r.slice(0, m).reduce((t, x) => t + x, 0) / m); });
    const o = [v.o1, v.o2, v.o3, v.o4, v.o5], L0 = Risk.x.ladder(o, v.buf), gap = o.map((_, i) => v.buf * (1 - hc[i]) - L0.gap.map((g) => v.buf - g)[i]), br = gap.findIndex((g) => g < 0);
    out.innerHTML = `<div class="kpis">${kpi('Survival at market value', L0.breach < 0 ? 'beyond 12 months' : name[L0.breach], 'first bucket with a negative gap')}${kpi('Survival after haircut', br < 0 ? 'beyond 12 months' : name[br], 'buffer shrunk by the ' + pct(v.cf, 0) + ' expected shortfall', br >= 0 ? 'bad' : 'ok')}${kpi('Haircut at 1 month', pct(hc[1], 0), 'expected shortfall of the asset')}${kpi('Haircut at 12 months', pct(hc[4], 0), 'few independent windows')}</div>
      ${Lab.table(['Horizon', 'Outflow', 'Cumulative outflow', 'Haircut', 'Gap at market value', 'Gap after haircut'], hs.map((_, i) => [name[i], o[i], o.slice(0, i + 1).reduce((a, b) => a + b, 0), pct(hc[i], 0), r18Fmt(L0.gap[i]), r18Fmt(gap[i])]))}
      ${Lab.card('c1', 'Gap between buffer and cumulative outflows', [['a', 'at market value'], ['r', 'after haircut']])}`;
    const ix = hs.map((_, i) => i);
    later(() => Lab.plot($('#c1'), { series: [{ x: ix, y: L0.gap, c: 'a', w: 2, dots: true }, { x: ix, y: gap, c: 'r', w: 2, dots: true }], hlines: [{ y: 0 }], xfmt: (i) => name[Math.round(i)] || '', yfmt: (y) => r18Fmt(y), h: 210 }));
  },
});
