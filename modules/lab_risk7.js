'use strict';
/* Risk, seventh set: funding (survival horizon, maturity ladder, funds transfer pricing), currency (FX VaR, hedge cost), parameter stability (CUSUM, Chow). Maths in riskx6.js (tested). */
const r7Sl = (id, label, min, max, step, val, fmt) => ({ id, label, min, max, step, val, fmt });
const r7Pc = (x) => (x * 100).toFixed(0) + '%';
const r7Rets = async (ids, n) => { const list = ids.map((id) => byId(id)).filter(Boolean); for (const a of list) await Data.ensure(a); const pr = Data.portfolioReturns(list, list.map(() => 1 / list.length)); return pr.parts.map((p) => p.r.slice(-n)); };

Lab.reg('runoff', {
  kicker: 'Funding risk', title: 'Deposit run-off and survival horizon',
  lead: 'Under a funding stress, deposits leave, wholesale lines are not renewed and committed lines are drawn, while loans keep paying back. The question is simple: how many days until the liquidity buffer is gone?',
  controls: [r7Sl('rcap', 'Retail deposits leaving (share, at the limit)', 0.02, 0.5, 0.01, 0.15, r7Pc), r7Sl('ccap', 'Corporate deposits leaving (share)', 0.05, 0.9, 0.01, 0.4, r7Pc), r7Sl('tau', 'Speed of the run (days, time constant)', 3, 60, 1, 15, (x) => x + ' d'), r7Sl('rr', 'Wholesale funding rolled over', 0, 1, 0.05, 0.3, r7Pc), r7Sl('hq', 'Liquid assets (HQLA)', 40, 250, 5, 120, (x) => x + ' bn'), r7Sl('hc', 'Haircut on liquid assets', 0, 0.4, 0.01, 0.1, r7Pc), r7Sl('keep', 'Loan repayments still received', 0, 1, 0.05, 0.6, r7Pc)],
  note: 'Illustrative balance sheet (bn): retail deposits 400, corporate deposits 250, wholesale funding 150 maturing over 60 days, undrawn committed lines 100 (30% drawn under stress, time constant 30 days), loans 700 repaying 0.15% of the book per day on contract, cash 40. <b>Retail leaves as cap·(1 − e<sup>−t/τ</sup>)</b>, corporate the same with its own cap; the buffer is cash plus HQLA after haircut, counted as sellable at once. Survival is the first day the cumulative net outflow exceeds the buffer. All sizes, caps and speeds are assumptions to replace by the institution’s own run-off assumptions (the Basel LCR uses 5–10% for stable retail and 25–40% for corporate over 30 days, which is the right order of magnitude for the caps here). No second-round effects: no market-wide haircut jump, no loss of access to central bank facilities.',
  draw(v, out) {
    const X = Risk.x, o = { deposits: [{ amount: 400, cap: v.rcap, tau: v.tau }, { amount: 250, cap: v.ccap, tau: v.tau }], wholesale: 150, rollover: v.rr, wholesaleLife: 60, commit: 100, draw: 0.3, loans: 700, inflow: 0.0015, inflowKeep: v.keep, cash: 40, hqla: v.hq, haircut: v.hc, horizon: 180 };
    const s = X.survival(o), base = X.survival({ ...o, haircut: 0 }), hz = s.survival === Infinity ? 'beyond 180 days' : s.survival + ' days';
    const at = (d) => s.net[Math.min(d, 180)], rows = [30, 60, 90, 180].map((d) => [d + ' days', at(d).toFixed(0), (s.buffer - at(d)).toFixed(0), s.buffer - at(d) < 0 ? '<b class="fail">short</b>' : 'covered']);
    out.innerHTML = `<div class="kpis">${kpi('Survival horizon', hz, 'until net outflow exceeds the buffer', s.survival <= 30 ? 'var' : '')}${kpi('Liquidity buffer', s.buffer.toFixed(0) + ' bn', 'cash + HQLA after haircut')}${kpi('Net outflow at 30 days', at(30).toFixed(0) + ' bn', 'LCR-style horizon')}${kpi('Coverage at 30 days', (s.buffer / at(30)).toFixed(2) + '×', s.buffer / at(30) >= 1 ? 'buffer covers the stress' : 'buffer is not enough')}</div>
      ${Lab.card('c1', 'Cumulative net outflow against the buffer (bn)', [['r', 'net outflow'], ['a', 'buffer']])}
      ${Lab.table(['Horizon', 'Net outflow (bn)', 'Buffer minus outflow (bn)', 'Status'], rows)}
      <p class="muted">Without the haircut the horizon would be ${base.survival === Infinity ? 'beyond 180 days' : base.survival + ' days'}.</p>`;
    later(() => Lab.plot($('#c1'), { series: [{ x: s.days, y: s.net, c: 'r', w: 2 }, { x: s.days, y: s.days.map(() => s.buffer), c: 'a', w: 2 }], hlines: [{ y: 0 }], xfmt: (d) => d + ' d', yfmt: (y) => y.toFixed(0), h: 230 }));
  },
});

Lab.reg('fundgap', {
  kicker: 'Funding risk', title: 'Funding gap ladder by maturity',
  lead: 'Assets and liabilities fall due at different dates. The ladder lines up what comes in and what must be paid or refinanced in each bucket, and the cumulative gap shows where the bank must find money.',
  controls: [r7Sl('roll', 'Maturing wholesale funding refinanced', 0, 1, 0.05, 0.8, r7Pc), r7Sl('delay', 'Loan repayments arriving late', 0, 0.5, 0.01, 0.1, r7Pc), r7Sl('lim', 'Internal limit on cumulative gap (bn)', 0, 120, 5, 40, (x) => x + ' bn')],
  note: 'Illustrative cash flows by bucket (bn): inflows are contractual loan and securities repayments, outflows are maturing wholesale funding and the contractual part of deposits. <b>Gap = inflow − outflow·(1 − refinanced)</b> in each bucket; cumulative gap is the running sum. A share of the repayments is shifted to the next bucket to model delays. Behavioural deposits (which mostly stay) are left out of the outflows: this is the contractual ladder, to be completed by the stress view in the run-off screen. All figures are assumptions.',
  draw(v, out) {
    const X = Risk.x, B = ['≤ 1 week', '1 month', '3 months', '6 months', '1 year', '2 years', '> 2 years'], inflow0 = [18, 30, 55, 60, 90, 120, 330], outflow = [40, 55, 75, 45, 60, 35, 40], inflow = inflow0.map((x, i) => x * (1 - v.delay) + (i ? inflow0[i - 1] * v.delay : 0));
    const L = X.ladder(inflow, outflow, [v.roll, v.roll, v.roll, v.roll, v.roll, v.roll, v.roll]), br = L.cum.findIndex((c) => c < -v.lim), xs = B.map((_, i) => i);
    out.innerHTML = `<div class="kpis">${kpi('Worst cumulative gap', L.worst.toFixed(0) + ' bn', 'lowest point of the ladder', L.worst < -v.lim ? 'var' : '')}${kpi('Limit breached', br < 0 ? 'No' : B[br], br < 0 ? 'within the internal limit' : 'first bucket beyond the limit')}${kpi('Total inflows', inflow.reduce((a, b) => a + b, 0).toFixed(0) + ' bn', 'all buckets')}${kpi('Refinancing needed', outflow.reduce((a, b) => a + b, 0) * v.roll > 0 ? (outflow.reduce((a, b) => a + b, 0) * v.roll).toFixed(0) + ' bn' : '0', 'maturing funding that must be rolled')}</div>
      ${Lab.card('c1', 'Gap per bucket and cumulative gap (bn)', [['a', 'gap'], ['r', 'cumulative gap']])}
      ${Lab.table(['Bucket', 'Inflow', 'Outflow', 'Refinanced', 'Gap', 'Cumulative'], B.map((b, i) => [b, inflow[i].toFixed(0), outflow[i], (outflow[i] * v.roll).toFixed(0), L.gap[i].toFixed(0), `<b${L.cum[i] < -v.lim ? ' class="fail"' : ''}>${L.cum[i].toFixed(0)}</b>`]))}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: xs, y: L.gap, c: 'a', bar: true }, { x: xs, y: L.cum, c: 'r', w: 2 }], hlines: [{ y: 0 }, { y: -v.lim, c: 'm' }], xfmt: (i) => B[Math.round(i)] || '', yfmt: (y) => y.toFixed(0), h: 230 }));
  },
});

Lab.reg('ftp', {
  kicker: 'Funding risk', title: 'Cost of funding: matched maturity against a pooled rate',
  lead: 'A bank charges its business lines a funding rate. Priced at one pooled rate, long loans look cheaper than they are; priced slice by slice at the cost of funding for each repayment date, the price follows the real liquidity cost.',
  controls: [r7Sl('T', 'Loan life (years)', 1, 30, 1, 10, (x) => x + ' y'), r7Sl('base', 'Funding spread at overnight', 0, 0.02, 0.0005, 0.003, (x) => (x * 1e4).toFixed(0) + ' bp'), r7Sl('liq', 'Extra spread for long funding', 0, 0.04, 0.0005, 0.015, (x) => (x * 1e4).toFixed(0) + ' bp'), r7Sl('theta', 'Speed at which the spread builds (years)', 0.5, 10, 0.5, 3, (x) => x + ' y'), r7Sl('pool', 'Pooled tenor (years)', 0.25, 10, 0.25, 2, (x) => x + ' y'), r7Sl('N', 'Loan notional (m)', 10, 1000, 10, 100, (x) => x + ' m')],
  note: 'Funding spread curve <i>s(t) = base + liq·(1 − e<sup>−t/θ</sup>)</i> over the risk-free rate, an assumed shape: in practice it is read from the bank’s own bond issuance, repo and deposit costs. The loan amortises linearly; slice <i>k</i> is repaid at <i>t<sub>k</sub></i> and funded for <i>t<sub>k</sub></i> years at <i>s(t<sub>k</sub>)</i>. <b>Matched rate</b> = average of <i>s(t<sub>k</sub>)</i> weighted by <i>t<sub>k</sub></i> (cost over outstanding × time); <b>pooled rate</b> = <i>s</i> at the pooled tenor. The gap is the annual misallocation in basis points and money. It is the same quantity that appears as funding valuation adjustment (FVA) on derivatives, where the funded amount is the exposure profile instead of a loan balance.',
  draw(v, out) {
    const X = Risk.x, f = X.ftp({ T: v.T, base: v.base, liq: v.liq, theta: v.theta, pool: v.pool, notional: v.N }), ts = Array.from({ length: 61 }, (_, i) => 0.1 + i * (Math.max(v.T, 10) / 60)), gap = f.pooled - f.matched;
    out.innerHTML = `<div class="kpis">${kpi('Matched-maturity rate', (f.matched * 1e4).toFixed(0) + ' bp', 'weighted by outstanding × time')}${kpi('Pooled rate', (f.pooled * 1e4).toFixed(0) + ' bp', 'spread at ' + v.pool + ' years')}${kpi('Misallocation', (gap * 1e4).toFixed(0) + ' bp', gap < 0 ? 'the pool undercharges this loan' : 'the pool overcharges this loan', gap < -0.0005 ? 'var' : '')}${kpi('Per year on the loan', (gap * v.N * 1e6 / 1e3).toFixed(0) + ' k', 'pooled minus matched, on ' + v.N + ' m')}</div>
      ${Lab.card('c1', 'Funding spread by tenor, with the two rates for this loan', [['a', 'spread curve'], ['r', 'matched'], ['y', 'pooled']])}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: ts, y: ts.map((t) => f.curve(t)), c: 'a', w: 2 }, { x: ts, y: ts.map(() => f.matched), c: 'r', w: 1.5 }, { x: ts, y: ts.map(() => f.pooled), c: 'y', w: 1.5 }], hlines: [{ y: 0 }], xfmt: (t) => t.toFixed(0) + 'y', yfmt: (y) => (y * 1e4).toFixed(0) + ' bp', h: 230 }));
  },
});

const r7Fx = [['eurusd', 'US dollar', 40], ['eurgbp', 'Pound sterling', 25], ['eurchf', 'Swiss franc', 15], ['eurjpy', 'Japanese yen', 20]];
Lab.reg('fxvar', {
  kicker: 'Currency risk', title: 'Currency VaR of foreign-currency assets (euro investor)',
  lead: 'A euro investor with assets in dollars, sterling, francs and yen loses when those currencies fall against the euro. Set the exposures and the share hedged, and read the risk that remains and which currency carries it.',
  controls: [...r7Fx.map(([id, nm, w]) => r7Sl(id, nm + ' exposure (m €)', 0, 100, 5, w, (x) => x + ' m')), r7Sl('h', 'Share hedged with forwards', 0, 1, 0.05, 0, r7Pc), { id: 'cf', label: 'Confidence', opts: [[0.95, '95%'], [0.99, '99%']], val: 0.99 }, r7Sl('yrs', 'History (years)', 2, 10, 1, 8, (x) => x + 'y')],
  note: 'Daily ECB reference rates (EUR per unit quoted as foreign currency per euro). A rise of the quote costs the euro investor. <b>P&L = −(1 − hedge) · Σ exposureᵢ · rᵢ</b> on the historical days; VaR and ES are historical, one day, in millions of euros. The hedge is assumed perfect and costless here (its carry cost is in the hedge-cost screen) and covers only the share chosen. Euler contributions split the ES exactly across currencies. Stable pairs such as EUR/CHF can still jump (the January 2015 franc move is outside this window unless history is long enough: it is not in the bundled series).',
  async draw(v, out) {
    await new Promise((r) => setTimeout(r, 10)); const X = Risk.x, n = Math.round(v.yrs * 252), rs = await r7Rets(r7Fx.map((b) => b[0]), n), T = Math.min(...rs.map((r) => r.length)), ex = r7Fx.map((b) => v[b[0]] || 0), tot = ex.reduce((a, b) => a + b, 0), cf = Number(v.cf);
    if (tot <= 0) throw new Error('Give at least one currency a positive exposure.');
    const R = Array.from({ length: T }, (_, t) => rs.map((r) => -r[r.length - T + t])), w = ex.map((e) => e * (1 - v.h) / tot), c = X.contrib(R, w, cf), vol = rs.map((r) => Risk.std(r.slice(-T)) * Math.sqrt(252));
    const un = X.contrib(R, ex.map((e) => e / tot), cf), share = c.cEs.map((x) => x / (c.es || 1));
    out.innerHTML = `<div class="kpis">${kpi('Exposure', tot.toFixed(0) + ' m €', 'hedged ' + r7Pc(v.h))}${kpi('1-day VaR ' + pct(cf, 0), (c.var * tot).toFixed(2) + ' m €', pct(c.var, 2) + ' of exposure')}${kpi('1-day ES', (c.es * tot).toFixed(2) + ' m €', pct(c.es, 2) + ' of exposure')}${kpi('Reduction by the hedge', pct(un.es > 0 ? 1 - c.es / un.es : 0, 0), 'ES against no hedge')}</div>
      ${Lab.table(['Currency', 'Exposure (m €)', 'Annual volatility', 'ES contribution (m €)', 'Share of ES'], r7Fx.map((b, i) => [b[1], ex[i], pct(vol[i], 1), (c.cEs[i] * tot).toFixed(3), pct(share[i], 0)]).concat([['<b>Total</b>', tot, '—', (c.es * tot).toFixed(3), '100%']]))}
      ${Lab.card('c1', 'Share of expected shortfall by currency', [['a', 'ES share']])}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: [0, 1, 2, 3], y: share, c: 'a', bar: true }], hlines: [{ y: 0 }], xfmt: (i) => (r7Fx[Math.round(i)] || [])[1] || '', yfmt: (y) => pct(y, 0), h: 200 }));
  },
});

Lab.reg('fxhedge', {
  kicker: 'Currency risk', title: 'FX hedge cost: carry, basis and the risk bought back',
  lead: 'Hedging a foreign asset removes currency swings but pays the interest-rate gap between the two currencies, plus any cross-currency basis. Compare the risk removed with the carry given up over the real history of EUR/USD.',
  controls: [r7Sl('re', 'Euro short rate', -0.01, 0.06, 0.0025, 0.02, (x) => (x * 100).toFixed(2) + '%'), r7Sl('rd', 'Dollar short rate', 0, 0.08, 0.0025, 0.045, (x) => (x * 100).toFixed(2) + '%'), r7Sl('bs', 'Cross-currency basis (negative = dearer to get dollars)', -0.008, 0.004, 0.0005, -0.002, (x) => (x * 1e4).toFixed(0) + ' bp'), r7Sl('h', 'Share hedged', 0, 1, 0.05, 1, r7Pc), r7Sl('yrs', 'History (years)', 2, 10, 1, 8, (x) => x + 'y')],
  note: 'A euro investor holds dollar assets and sells dollars forward. The forward gain per year is about <b>r<sub>EUR</sub> − r<sub>USD</sub> + basis</b> (covered interest parity, rates assumed constant over the history, which is a simplification: the real carry moved a lot). The unhedged FX return is the real monthly move of EUR/USD (21-day non-overlapping blocks of the ECB series); the hedged position keeps <i>(1 − h)</i> of it and earns the carry on <i>h</i>. This shows volatility removed and carry paid, not a forecast of either, and ignores margin and rolling costs. Choose rates for the period you want to read.',
  async draw(v, out) {
    await new Promise((r) => setTimeout(r, 10)); const X = Risk.x, fx = byId('eurusd'); await Data.ensure(fx); const r = Data.returnsOf(fx).r.slice(-Math.round(v.yrs * 252)), blocks = []; for (let i = 0; i + 21 <= r.length; i += 21) blocks.push(r.slice(i, i + 21).reduce((a, b) => a + b, 0));
    const carry = (v.re - v.rd + v.bs) / 12, un = X.hedged(blocks, 0, carry), hd = X.hedged(blocks, v.h, carry), vu = Risk.std(un) * Math.sqrt(12), vh = Risk.std(hd) * Math.sqrt(12), cum = (a) => { let s = 0; return a.map((x) => (s += x)); }, xs = hd.map((_, i) => i);
    out.innerHTML = `<div class="kpis">${kpi('Annual carry of the hedge', pct((v.re - v.rd + v.bs) * v.h, 2), v.re - v.rd + v.bs < 0 ? 'cost paid per year' : 'gain per year', v.re - v.rd + v.bs < 0 ? 'var' : '')}${kpi('Currency volatility, unhedged', pct(vu, 1), 'annualised, monthly blocks')}${kpi('Volatility after hedge', pct(vh, 1), 'share hedged ' + r7Pc(v.h))}${kpi('Cost per point of volatility removed', vu > vh ? pct(Math.abs((v.re - v.rd + v.bs) * v.h) / (vu - vh), 0) : '—', 'annual carry / volatility removed')}</div>
      ${Lab.card('c1', 'Cumulative currency return, unhedged and hedged (sum of monthly log returns)', [['r', 'unhedged'], ['a', 'hedged']])}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: xs, y: cum(un), c: 'r', w: 2 }, { x: xs, y: cum(hd), c: 'a', w: 2 }], hlines: [{ y: 0 }], xfmt: (i) => '+' + Math.round(i) + ' m', yfmt: (y) => pct(y, 0), h: 230 }));
  },
});

Lab.reg('cusum', {
  kicker: 'Model risk', title: 'Parameter stability: has the model’s relationship broken?',
  asset: true,
  lead: 'A beta, a hedge ratio or a factor loading is estimated on a past period and assumed constant. Two tests ask whether the relationship moved: the CUSUM of residuals, and the Chow test scanned over every possible break date.',
  controls: [{ id: 'bm', label: 'Benchmark (the asset is regressed on it)', opts: [['btc', 'Bitcoin'], ['eth', 'Ether']], val: 'btc' }, r7Sl('yrs', 'History (years)', 2, 10, 1, 6, (x) => x + 'y')],
  note: 'Regression of the asset’s daily return on the benchmark’s, <i>r = a + b·m + e</i>. <b>CUSUM</b>: running sum of the residuals divided by σ√n; under a stable model its largest absolute value stays below 1.358 about 95% of the time (Kolmogorov distribution, Ploberger and Krämer, 1992). <b>Chow sup-F</b>: F statistic for a break in (a, b) at every date in the central 70% of the sample, largest value reported with a <b>bootstrap p-value</b> (199 resamples of the residuals under no break), because the usual critical values are not valid when the date is picked from the data (Andrews, 1993). A break means the past estimate is a poor guide to the future, which is model risk. If the chosen asset is the benchmark itself, the other crypto benchmark is used instead.',
  async draw(v, out, ctx) {
    await new Promise((r) => setTimeout(r, 10)); const X = Risk.x, n = Math.round(v.yrs * PPY), A = ctx.asset && byId(ctx.asset.id), bm = byId(A && A.id === v.bm ? (v.bm === 'btc' ? 'eth' : 'btc') : v.bm); if (!A) throw new Error('Pick a single asset, not the portfolio.'); await Data.ensure(A); await Data.ensure(bm); const pr = Data.portfolioReturns([A, bm], [0.5, 0.5]);
    const y = pr.parts[0].r.slice(-n), m = pr.parts[1].r.slice(-n), N = Math.min(y.length, m.length), Y = y.slice(-N), M = m.slice(-N);
    const f = X.ols2(Y, M), cu = X.cusum(f.res), sf = X.supF(Y, M, { B: 199 }), roll = [], rx = [], win = 120;
    for (let i = win; i <= N; i += 10) { roll.push(X.ols2(Y.slice(i - win, i), M.slice(i - win, i)).beta); rx.push(i); }
    const verdict = sf.p < 0.05 || cu.sup > cu.crit;
    out.innerHTML = `<div class="kpis">${kpi('Beta, full sample', f.beta.toFixed(2), N + ' days')}${kpi('CUSUM maximum', cu.sup.toFixed(2), 'critical value 5%: ' + cu.crit, cu.sup > cu.crit ? 'var' : '')}${kpi('Chow sup-F', sf.supF.toFixed(1), 'bootstrap p = ' + sf.p.toFixed(3), sf.p < 0.05 ? 'var' : '')}${kpi('Most likely break', 'day ' + sf.breakAt + ' of ' + N, 'beta ' + sf.before.beta.toFixed(2) + ' before, ' + sf.after.beta.toFixed(2) + ' after')}</div>
      <p><b${verdict ? ' class="fail"' : ''}>${verdict ? 'The relationship is not stable over this window: re-estimate on the recent period or add a regime term.' : 'No evidence of a break at the 5% level in this window.'}</b></p>
      ${Lab.card('c1', 'Rolling beta over 120 days', [['a', 'rolling beta']])}
      ${Lab.card('c2', 'CUSUM of residuals against the 5% bounds', [['r', 'CUSUM'], ['y', 'bounds']])}`;
    later(() => { Lab.plot($('#c1'), { series: [{ x: rx, y: roll, c: 'a', w: 2 }], hlines: [{ y: f.beta, c: 'm' }], vlines: [{ x: sf.breakAt, c: 'r' }], xfmt: (i) => 'd' + Math.round(i), yfmt: (y) => y.toFixed(2), h: 200 }); Lab.plot($('#c2'), { series: [{ x: cu.W.map((_, i) => i), y: cu.W, c: 'r', w: 2 }], hlines: [{ y: 1.358, c: 'y' }, { y: -1.358, c: 'y' }, { y: 0 }], xfmt: (i) => 'd' + Math.round(i), yfmt: (y) => y.toFixed(1), h: 200 }); });
  },
});
