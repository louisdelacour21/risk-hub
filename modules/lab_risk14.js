'use strict';
/* Risk, fourteenth set: wrong-way counterparty risk on a crypto position. Maths in riskx13.js (tested). */
const r14Sl = (id, label, min, max, step, val, fmt) => ({ id, label, min, max, step, val, fmt });

Lab.reg('wwrcrypto', {
  kicker: 'Counterparty risk', title: 'Wrong-way risk: a counterparty that fails when the crypto falls',
  asset: true,
  lead: 'Counterparty risk is usually priced as if default and exposure were unrelated. Crypto breaks that: a fund long the asset fails when the price drops, which is exactly when a put it sold you is worth most. Tying the two together raises the CVA.',
  controls: [{ id: 'pos', label: 'Position', opts: [['put', 'Put bought from them'], ['fwdShort', 'Short forward'], ['fwdLong', 'Long forward']], val: 'put' }, r14Sl('rho', 'Link between their default and a price fall', 0, 0.95, 0.05, 0.5, (x) => x.toFixed(2)), r14Sl('sp', 'Their credit spread (bp)', 50, 3000, 50, 600, (x) => x + ' bp'), r14Sl('lgd', 'Loss given default', 0.2, 1, 0.05, 0.6, (x) => pct(x, 0)), r14Sl('T', 'Maturity (years)', 0.25, 3, 0.25, 1, (x) => x + 'y'), r14Sl('mny', 'Strike (share of the spot)', 0.7, 1.3, 0.05, 1, (x) => pct(x, 0))],
  note: 'The asset follows a driftless geometric Brownian motion with its own historical volatility (365-day annualisation), zero interest rate. Exposure is the value of the position if positive; with a bought put it is the put value, with a short forward the strike minus the price. The default time has a constant hazard λ = spread / loss given default. <b>Independent CVA</b> = LGD × Σ E[exposure] × (default probability of the step). <b>Wrong-way CVA</b> replaces the step probability by one conditional on that step\'s price shock through a one-factor Gaussian copula, p(e) = Φ((Φ⁻¹(q) − √ρ e) / √(1 − ρ)), whose average over e is exactly q: only the link changes, not the credit quality. A <b>long forward</b> is right-way (exposure is high when the price is high and the counterparty healthy), so its CVA falls. Simplifications: monthly steps, a copula on the last step\'s shock only, no survival between steps, no collateral, no DVA or funding. Monte Carlo error is shown.',
  async draw(v, out, ctx) {
    const X = Risk.x, A = ctx.asset && byId(ctx.asset.id); if (!A || !Data.hasOhlcv(A.id)) throw new Error('Pick a single crypto asset with candles (BTC, ETH, SOL, XRP, ADA, DOGE, DOT, LTC, BCH, AVAX).');
    const o = await Data.ohlcv(A.id), c = o.close.slice(-1096), lr = c.slice(1).map((p, i) => Math.log(p / c[i])), sigma = Risk.std(lr) * Math.sqrt(365), S0 = c[c.length - 1];
    const lam = v.sp / 1e4 / v.lgd, steps = Math.max(3, Math.round(12 * v.T)), P = { S0, K: v.mny * S0, T: v.T, sigma, lam, lgd: v.lgd, pos: v.pos, steps };
    const r = X.wwrCva({ ...P, rho: v.rho, paths: 8000 }), rs = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9], cur = rs.map((x) => X.wwrCva({ ...P, rho: x, paths: 3000 }).cva / S0);
    const f = (x) => (x / S0 * 100).toFixed(3) + '%', pick = r.t.map((t, i) => [t, i]).filter(([, i], k, a) => (i + 1) % Math.max(1, Math.round(steps / 6)) === 0 || i === a.length - 1);
    out.innerHTML = `<div class="kpis">${kpi('CVA, wrong-way', f(r.cva), 'of the spot, ± ' + (r.se / S0 * 100).toFixed(3) + '%', r.ratio > 1.2 ? 'bad' : '')}${kpi('CVA, independent', f(r.cvaInd), 'default unrelated to the price')}${kpi('Ratio', r.ratio.toFixed(2) + '×', r.ratio > 1 ? 'wrong-way' : 'right-way')}${kpi('Annual volatility', pct(sigma, 0), A.id.toUpperCase() + ', history')}</div>
      ${Lab.table(['Date (years)', 'Expected exposure (% spot)', 'Default probability of the step', 'Share of CVA, wrong-way'], pick.map(([t, i]) => [t.toFixed(2), (r.ee[i] / S0 * 100).toFixed(2) + '%', pct(r.q[i], 2), pct(r.eeW[i] * v.lgd / r.cva, 0)]))}
      ${Lab.card('c1', 'CVA against the link between default and the price fall', [['a', 'CVA, % of the spot'], ['b', 'independent CVA']])}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: rs, y: cur, c: 'a', w: 2 }, { x: rs, y: rs.map(() => r.cvaInd / S0), c: 'b', w: 1.5, dash: true }], vlines: [{ x: v.rho, c: 'm' }], hlines: [{ y: 0 }], xfmt: (x) => x.toFixed(1), yfmt: (y) => (y * 100).toFixed(2) + '%', h: 210 }));
  },
});
