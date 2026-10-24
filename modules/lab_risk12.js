'use strict';
/* Risk, twelfth set: structural credit risk of a crypto-collateralised loan (KMV distance to default, liquidation probability, LTV migration matrix). Maths in riskx11.js (tested). */
const r12Sl = (id, label, min, max, step, val, fmt) => ({ id, label, min, max, step, val, fmt });
const r12Rets = async (ctx, yrs) => {
  const A = ctx.asset && byId(ctx.asset.id); if (!A || !Data.hasOhlcv(A.id)) throw new Error('Pick a single crypto asset with candles (BTC, ETH, SOL, XRP, ADA, DOGE, DOT, LTC, BCH, AVAX).');
  const o = await Data.ohlcv(A.id), c = o.close.slice(-Math.round(yrs * 365)), lr = c.slice(1).map((p, i) => Math.log(p / c[i]));
  return { A, lr, sigma: Risk.std(lr) * Math.sqrt(365), mu: Risk.mean(lr) * 365 + 0.5 * Math.pow(Risk.std(lr), 2) * 365 };
};

Lab.reg('kmvcrypto', {
  kicker: 'Credit risk', title: 'KMV on a crypto-backed loan: distance to default and liquidation',
  asset: true,
  lead: 'A loan secured by crypto behaves like the Merton firm: the collateral is the asset, the loan is the debt, and trouble starts when the collateral falls to the loan. The model gives a distance to default and a probability; the price history tells how far off the model is.',
  controls: [r12Sl('ltv', 'Loan to value at the start', 0.2, 0.9, 0.05, 0.6, (x) => pct(x, 0)), r12Sl('liq', 'Liquidation threshold (loan to value)', 0.5, 0.95, 0.05, 0.85, (x) => pct(x, 0)), r12Sl('h', 'Horizon (days)', 7, 180, 1, 30, (x) => x + ' d'), r12Sl('pen', 'Liquidation penalty', 0, 0.15, 0.01, 0.05, (x) => pct(x, 0)), r12Sl('yrs', 'History (years)', 1, 6, 0.5, 4, (x) => x + 'y'), { id: 'dr', label: 'Drift of the collateral', opts: [['0', 'Zero'], ['h', 'Historical']], val: '0' }],
  note: 'Collateral value follows a geometric Brownian motion with the volatility measured on the history. <b>Distance to default</b> = (ln(V/D) + (mu - sigma²/2) T) / (sigma sqrt T), with V/D = liquidation threshold / loan to value, the point where the loan is called. <b>Normal at horizon</b> is Phi(-DD); <b>first passage</b> is the probability of touching the threshold on any day (closed form, reflection principle). <b>Empirical</b> counts the share of overlapping windows of the history that end below, or touch, the threshold: the model has no jumps and constant volatility, and zero drift ignores the upward trend of the sample; so the two can disagree either way (on BTC over 2022-2026 the history shows fewer liquidations than the model). The loss on a liquidation is what the sale at the crossing day recovers net of the penalty. Overlapping windows are not independent, so the empirical figures are noisy; a single asset and a few years are a small sample. No interest, no fees, no oracle delay.',
  async draw(v, out, ctx) {
    const X = Risk.x, { A, lr, sigma, mu } = await r12Rets(ctx, v.yrs), ratio = v.liq / v.ltv, T = v.h / 365, m = v.dr === 'h' ? mu : 0;
    if (ratio <= 1) throw new Error('The liquidation threshold must be above the starting loan to value.');
    const k = X.kmv({ ratio, mu: m, sigma, T }), e = X.empirical(lr, v.h, ratio, v.pen), vr = (p) => e.loss[Math.min(e.loss.length - 1, Math.floor(p * e.loss.length))];
    const ls = Array.from({ length: 14 }, (_, i) => 0.2 + i * 0.05), curve = (f) => ls.map((l) => f(l));
    out.innerHTML = `<div class="kpis">${kpi('Distance to default', k.dd.toFixed(2), 'standard deviations to the threshold', k.dd < 1.5 ? 'bad' : '')}${kpi('Normal, at horizon', pct(k.pdEnd, 2), 'Phi(-DD)')}${kpi('Liquidated, model', pct(k.pdTouch, 2), 'first passage, any day')}${kpi('Liquidated, history', pct(e.pdTouch, 2), e.n + ' overlapping windows', e.pdTouch > 1.5 * k.pdTouch ? 'bad' : '')}${kpi('Expected loss', pct(e.el, 3), 'of the loan, history, after penalty')}</div>
      ${Lab.table([A.name || A.id.toUpperCase(), 'Model', 'History'], [['Collateral volatility (annual)', pct(sigma, 0), ''], ['Below the threshold at the horizon', pct(k.pdEnd, 2), pct(e.pdEnd, 2)], ['Touches the threshold before the horizon', pct(k.pdTouch, 2), pct(e.pdTouch, 2)], ['Loss given a liquidation, 99th percentile of all windows', '', pct(vr(0.99), 2)], ['Loss, worst window', '', pct(e.loss[e.loss.length - 1], 2)]])}
      ${Lab.card('c1', 'Probability of liquidation by starting loan to value, ' + v.h + ' days', [['a', 'model, first passage'], ['b', 'history']])}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: ls, y: curve((l) => X.kmv({ ratio: v.liq / l, mu: m, sigma, T }).pdTouch), c: 'a', w: 2 }, { x: ls, y: curve((l) => X.empirical(lr, v.h, v.liq / l, v.pen).pdTouch), c: 'b', w: 2 }], vlines: [{ x: v.ltv, c: 'm' }], hlines: [{ y: 0 }], xfmt: (x) => pct(x, 0), yfmt: (y) => pct(y, 0), h: 220 }));
  },
});

Lab.reg('ltvmig', {
  kicker: 'Credit risk', title: 'Loan-to-value migration matrix and loss, in the CreditMetrics style',
  asset: true,
  lead: 'Credit rating agencies publish migration matrices: the chance a borrower moves from one grade to another in a year. A crypto-backed loan has an observable grade, its loan to value, so the matrix can be built from prices. The last column is the absorbing state: liquidated.',
  controls: [r12Sl('liq', 'Liquidation threshold (loan to value)', 0.6, 0.95, 0.05, 0.85, (x) => pct(x, 0)), r12Sl('h', 'Horizon (days)', 7, 180, 1, 30, (x) => x + ' d'), r12Sl('pen', 'Liquidation penalty', 0, 0.15, 0.01, 0.05, (x) => pct(x, 0)), r12Sl('yrs', 'History (years)', 1, 6, 0.5, 4, (x) => x + 'y')],
  note: 'Bands of loan to value are 0-20%, 20-40%, 40-60%, 60-80% and 80% up to the liquidation threshold; a loan starts at the middle of its band and its value moves with the observed return of every overlapping window of the history, so the rows are estimated from the same sample, which is small and overlapping. A loan is liquidated the first day its loan to value reaches the threshold; the loss is then what the sale at that day\'s value, less the penalty, leaves unpaid, which is zero unless the price gapped past the threshold. CreditMetrics itself values the loan in each rating state and combines obligors with a Gaussian copula; here only the single-loan part is built: matrix, expected loss by band and the probability of liquidation.',
  async draw(v, out, ctx) {
    const X = Risk.x, { A, lr } = await r12Rets(ctx, v.yrs), M = X.migration(lr, v.h, [0.2, 0.4, 0.6, 0.8], v.liq, v.pen), nm = M.bands.map((b, i) => pct(b[0], 0) + ' - ' + pct(b[1], 0)), K = M.P.length;
    const sh = (x) => (x < 0.0005 ? '·' : pct(x, 1));
    out.innerHTML = `<div class="kpis">${kpi('Liquidation, 60-80% loans', pct(M.P[3][K], 1), 'within ' + v.h + ' days')}${kpi('Liquidation, 40-60% loans', pct(M.P[2][K], 1), 'within ' + v.h + ' days')}${kpi('Expected loss, 60-80% loans', pct(M.loss[3], 3), 'of the loan')}${kpi('Windows', M.n, A.id.toUpperCase() + ', overlapping')}</div>
      ${Lab.table(['From \\ to (' + v.h + ' days)', ...nm, 'Liquidated', 'Expected loss'], M.P.map((r, i) => [nm[i], ...r.map(sh), pct(M.loss[i], 3)]))}
      ${Lab.card('c1', 'Probability of liquidation by starting band', [['a', 'liquidated within ' + v.h + ' days']])}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: M.mid, y: M.P.map((r) => r[K]), c: 'a', w: 2, bar: true }], hlines: [{ y: 0 }], xfmt: (x) => pct(x, 0), yfmt: (y) => pct(y, 0), h: 200 }));
  },
});
