'use strict';
/* Risk, thirteenth set: FRTB P&L attribution test and curvature risk charge on options over a crypto asset. Maths in riskx12.js (tested). */
const r13Sl = (id, label, min, max, step, val, fmt) => ({ id, label, min, max, step, val, fmt });
const r13Px = async (ctx, yrs) => {
  const A = ctx.asset && byId(ctx.asset.id); if (!A || !Data.hasOhlcv(A.id)) throw new Error('Pick a single crypto asset with candles (BTC, ETH, SOL, XRP, ADA, DOGE, DOT, LTC, BCH, AVAX).');
  const o = await Data.ohlcv(A.id), close = o.close.slice(-Math.round(yrs * 365) - 1), lr = close.slice(1).map((p, i) => Math.log(p / close[i])), v = Risk.x.rollVol(lr, 30);
  return { A, close, vol: [v[0], ...v] };
};
const r13Terms = { d: ['delta'], dg: ['delta', 'gamma'], dgv: ['delta', 'gamma', 'vega'], all: ['delta', 'gamma', 'vega', 'theta'] };
const r13Zone = (z) => (z === 'green' ? 'ok' : z === 'red' ? 'bad' : '');

Lab.reg('pla', {
  kicker: 'Market risk', title: 'FRTB P&L attribution test: does the risk model explain the desk P&L?',
  asset: true,
  lead: 'To use its internal model a desk must show that the P&L produced by the risk model follows the P&L from a full revaluation. Two statistics decide: the rank correlation and the Kolmogorov-Smirnov distance, giving a green, amber or red zone.',
  controls: [r13Sl('mny', 'Strike (share of the spot)', 0.7, 1.3, 0.05, 1, (x) => pct(x, 0)), r13Sl('T', 'Maturity (days)', 7, 180, 1, 30, (x) => x + ' d'), { id: 'cp', label: 'Option', opts: [['c', 'Call'], ['p', 'Put']], val: 'c' }, { id: 'tm', label: 'Risk model keeps', opts: [['d', 'Delta'], ['dg', '+ gamma'], ['dgv', '+ vega'], ['all', '+ theta']], val: 'd' }, r13Sl('yrs', 'History (years)', 1, 6, 0.5, 3, (x) => x + 'y')],
  note: 'The desk holds one option bought each morning at the chosen strike and valued the next day. <b>Hypothetical P&L</b> is the full Black-Scholes revaluation with the new spot, one day less and the new volatility (30-day realised volatility, a stand-in for the implied volatility, which is not published here). <b>Risk-theoretical P&L</b> keeps only the Greeks the risk model carries, computed the day before. The test uses the last 250 days: green if Spearman &gt; 0.80 and KS &lt; 0.09, red if Spearman &lt; 0.70 or KS &gt; 0.12, amber otherwise (BCBS d457). Spearman only checks that days are ordered alike, KS checks that the two distributions match, so a model can rank well and still fail on size. A desk in the red zone loses the internal model and falls back on the standardised approach. Simplifications: one option, daily rebalanced, no interest rate, realised volatility instead of the implied one, no transaction cost. Volatility is a free choice here, so the zone is only indicative.',
  async draw(v, out, ctx) {
    const X = Risk.x, { A, close, vol } = await r13Px(ctx, v.yrs), call = v.cp === 'c', T = v.T / 365, n = 250;
    const run = (tm) => { const r = X.optionPla(close, vol, { mny: v.mny, T, call, terms: r13Terms[tm] }); return { ...r, ...X.pla(r.hpl.slice(-n), r.rtpl.slice(-n)) }; }, R = run(v.tm);
    const h = R.hpl.slice(-n), q = R.rtpl.slice(-n), px = close.slice(-n - 1, -1), hp = h.map((x, i) => x / px[i]), qp = q.map((x, i) => x / px[i]), lo = Math.min(...hp, ...qp), hi = Math.max(...hp, ...qp);
    const rows = [['d', 'Delta'], ['dg', 'Delta + gamma'], ['dgv', 'Delta + gamma + vega'], ['all', 'Delta + gamma + vega + theta']].map(([k, t]) => { const r = run(k); return [t, r.rho.toFixed(3), r.ks.toFixed(3), r.zone]; });
    out.innerHTML = `<div class="kpis">${kpi('Zone', R.zone.toUpperCase(), 'last ' + n + ' days', r13Zone(R.zone))}${kpi('Spearman', R.rho.toFixed(3), 'green above 0.80, red below 0.70', R.rho < 0.7 ? 'bad' : '')}${kpi('Kolmogorov-Smirnov', R.ks.toFixed(3), 'green below 0.09, red above 0.12', R.ks > 0.12 ? 'bad' : '')}${kpi('Std of the gap', pct(Risk.std(hp.map((x, i) => x - qp[i])), 2), 'of the spot, per day')}</div>
      ${Lab.table(['Risk model keeps', 'Spearman', 'KS', 'Zone'], rows)}
      ${Lab.card('c1', 'One dot per day: risk-theoretical (across) against hypothetical (up), % of the spot', [['a', 'days'], ['m', 'perfect agreement']])}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: [lo, hi], y: [lo, hi], c: 'm', w: 1 }, { x: qp, y: hp, c: 'a', dots: true, r: 2.4 }], xfmt: (x) => pct(x, 1), yfmt: (y) => pct(y, 1), h: 240 }));
  },
});

Lab.reg('curvfrtb', {
  kicker: 'Market risk', title: 'FRTB curvature charge: what the delta charge misses on options',
  asset: true,
  lead: 'A delta charge assumes the position moves in a straight line with the price. An option does not, so the standard adds a curvature charge: revalue after a large up shock and a large down shock, and keep the shortfall against the straight line.',
  controls: [{ id: 'pos', label: 'Position', opts: [['lc', 'Long call'], ['sc', 'Short call'], ['ss', 'Short straddle'], ['ls', 'Long straddle'], ['bf', 'Short butterfly']], val: 'ss' }, r13Sl('mny', 'Strike (share of the spot)', 0.7, 1.3, 0.05, 1, (x) => pct(x, 0)), r13Sl('T', 'Maturity (days)', 7, 365, 1, 30, (x) => x + ' d'), r13Sl('w', 'Shock (curvature risk weight)', 0.1, 0.8, 0.05, 0.5, (x) => pct(x, 0)), r13Sl('n', 'Number of options', 1, 100, 1, 10, (x) => x)],
  note: 'Position value is Black-Scholes with the 30-day realised volatility of the asset held constant (the standard also shocks volatility in a separate vega charge, not built here). <b>Curvature charge</b> = max(0, CVR<sup>+</sup>, CVR<sup>-</sup>) with CVR<sup>±</sup> = −(V(S(1±w)) − V(S) ∓ delta × S × w): the loss in excess of what the delta charge already covers. A <b>long</b> option has convexity that works for it, so the charge is zero; a <b>short</b> option or straddle is exposed. The weight w is <b>illustrative</b>: the Basel text fixes it per risk class (for instance 55% for large-cap equity spot) and does not give crypto assets such a weight: Basel treats them in a separate, very conservative standard. Simplifications: one risk factor, one expiry, no interest rate, no vega charge, no netting between factors.',
  async draw(v, out, ctx) {
    const X = Risk.x, { A, close, vol } = await r13Px(ctx, 1), S0 = close[close.length - 1], sg = vol[vol.length - 1], T = v.T / 365, K = v.mny * S0, N = v.n;
    const leg = (S, k, call) => X.bs(S, k, T, 0, sg, call), K1 = K * 0.9, K2 = K * 1.1;
    const f = { lc: (S) => N * leg(S, K, true), sc: (S) => -N * leg(S, K, true), ss: (S) => -N * (leg(S, K, true) + leg(S, K, false)), ls: (S) => N * (leg(S, K, true) + leg(S, K, false)), bf: (S) => -N * (leg(S, K1, true) - 2 * leg(S, K, true) + leg(S, K2, true)) }[v.pos];
    const hh = S0 * 1e-4, dl = (S) => (f(S + hh) - f(S - hh)) / (2 * hh), d0 = dl(S0), c = X.curvature(f, S0, v.w, d0), ws = Array.from({ length: 15 }, (_, i) => 0.05 + i * 0.05);
    const deltaCharge = Math.abs(d0) * S0 * v.w, V0 = f(S0);
    out.innerHTML = `<div class="kpis">${kpi('Curvature charge', Math.round(c.charge).toLocaleString('en-US'), 'in dollars, ' + pct(v.w, 0) + ' shock', c.charge > 0 ? 'bad' : '')}${kpi('Delta charge (reference)', Math.round(deltaCharge).toLocaleString('en-US'), '|delta| × spot × shock')}${kpi('Curvature / delta', deltaCharge > 1e-9 ? pct(c.charge / deltaCharge, 0) : 'n/a', 'extra capital the delta charge misses')}${kpi('Position value', Math.round(V0).toLocaleString('en-US'), A.id.toUpperCase() + ' at ' + Math.round(S0).toLocaleString('en-US'))}</div>
      ${Lab.table(['Shock', 'Revalued gain or loss', 'Delta approximation', 'CVR (shortfall)'], [['Up ' + pct(v.w, 0), Math.round(f(S0 * (1 + v.w)) - V0).toLocaleString('en-US'), Math.round(d0 * S0 * v.w).toLocaleString('en-US'), Math.round(c.up).toLocaleString('en-US')], ['Down ' + pct(v.w, 0), Math.round(f(S0 * (1 - v.w)) - V0).toLocaleString('en-US'), Math.round(-d0 * S0 * v.w).toLocaleString('en-US'), Math.round(c.dn).toLocaleString('en-US')]])}
      ${Lab.card('c1', 'Curvature charge against the size of the shock', [['a', 'curvature charge'], ['b', 'delta charge']])}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: ws, y: ws.map((w) => X.curvature(f, S0, w, d0).charge), c: 'a', w: 2 }, { x: ws, y: ws.map((w) => Math.abs(d0) * S0 * w), c: 'b', w: 2, dash: true }], vlines: [{ x: v.w, c: 'm' }], hlines: [{ y: 0 }], xfmt: (x) => pct(x, 0), yfmt: (y) => (y / 1000).toFixed(0) + 'k', h: 210 }));
  },
});
