'use strict';
/* Risk, seventeenth set: worst historical episodes of a crypto book, and Monte Carlo VaR convergence. Maths in riskx16.js (tested). */
const r17Sl = (id, label, min, max, step, val, fmt) => ({ id, label, min, max, step, val, fmt });
const r17Book = [['btc', 'BTC'], ['eth', 'ETH'], ['sol', 'SOL'], ['xrp', 'XRP'], ['ada', 'ADA']];

Lab.reg('histscen', {
  kicker: 'Market risk', title: 'Historical stress episodes: what the worst weeks did to the book',
  lead: 'Replay the past on today’s book. Find the worst non-overlapping windows in the history of your portfolio and read what each would cost, asset by asset.',
  controls: [...r17Book.map(([id, nm], i) => r17Sl(id, nm + ' weight', 0, 100, 5, [40, 30, 10, 10, 10][i], (x) => x + '%')), r17Sl('h', 'Window (days)', 1, 60, 1, 10, (x) => x + ' d'), r17Sl('k', 'Episodes shown', 3, 8, 1, 5, String)],
  note: 'The book has constant weights, rebalanced daily, and its history is the common history of the five assets. Windows are found by the compounded return over <b>h</b> days; the worst ones that do not overlap are kept. “By asset” is each asset’s own return over the same window (buy and hold, not the rebalanced book). A historical scenario is only as bad as what the sample contains: the worst window here is a floor on what can happen, not a bound. Simplifications: no liquidity cost, no funding, no margin call during the window.',
  async draw(v, out) {
    const list = r17Book.map(([id]) => byId(id)).filter(Boolean); for (const a of list) await Data.ensure(a);
    const ws = r17Book.map(([id]) => v[id]), tot = ws.reduce((a, b) => a + b, 0); if (tot <= 0) throw new Error('Give at least one asset a positive weight.');
    const pr = Data.portfolioReturns(list, ws.map((w) => w / tot)), bk = pr.parts[0].r.map((_, t) => pr.parts.reduce((s, p, i) => s + (ws[i] / tot) * p.r[t], 0)), ep = Risk.x.episodes(bk, v.h, v.k), d = (t) => (pr.dates && pr.dates[t]) || 'day ' + t;
    const assetRet = (i, e) => pr.parts[i].r.slice(e.start, e.end + 1).reduce((p, x) => p * (1 + x), 1) - 1;
    out.innerHTML = `<div class="kpis">${kpi('Worst episode', pct(ep[0].ret, 1), d(ep[0].start) + ' to ' + d(ep[0].end), 'bad')}${kpi('Median of those shown', pct(ep[Math.floor(ep.length / 2)].ret, 1), ep.length + ' non-overlapping windows')}${kpi('Sample', bk.length + ' days', 'common history')}</div>
      ${Lab.table(['From', 'To', 'Book', ...r17Book.map(([, n]) => n)], ep.map((e) => [d(e.start), d(e.end), pct(e.ret, 1), ...r17Book.map((_, i) => pct(assetRet(i, e), 1))]))}
      ${Lab.card('c1', 'Return of the book over each episode', [['r', 'episode']])}`;
    const ix = ep.map((_, i) => i);
    later(() => Lab.plot($('#c1'), { series: [{ x: ix, y: ep.map((e) => e.ret), c: 'r', bar: true }], hlines: [{ y: 0 }], xfmt: (i) => (ep[Math.round(i)] ? String(d(ep[Math.round(i)].start)).slice(0, 7) : ''), yfmt: (y) => pct(y, 0), h: 200 }));
  },
});

Lab.reg('mcconv', {
  kicker: 'Market risk', title: 'Monte Carlo VaR: how many simulations are enough?',
  asset: true,
  lead: 'A simulated VaR is a random number. Repeat the run many times at each sample size and watch the spread of the estimate: it shrinks slowly, and the further out the tail, the slower.',
  controls: [{ id: 'cf', label: 'Confidence', opts: [[0.95, '95%'], [0.99, '99%'], [0.999, '99.9%']], val: 0.99 }, r17Sl('reps', 'Repeated runs', 50, 400, 50, 200, String), r17Sl('yrs', 'History (years)', 1, 6, 0.5, 3, (x) => x + 'y')],
  note: 'The model is a normal distribution with the mean and standard deviation of the asset’s daily returns, so the true VaR is known exactly (shown as the reference line) and the error of each run can be measured. For each number of simulations N the run is repeated; the lines show the 5th and 95th percentile of the estimates. The spread falls like 1/√N and rises with confidence: at 99.9% only N/1000 draws sit beyond the VaR. A fat-tailed asset makes the true VaR higher than this model says, which is a model error that more simulations do not remove. Simplifications: one asset, one day, independent draws, no variance reduction.',
  async draw(v, out, ctx) {
    const A = ctx.asset && byId(ctx.asset.id); if (!A || !Data.hasOhlcv(A.id)) throw new Error('Pick a single crypto asset with candles.');
    const o = await Data.ohlcv(A.id), c = o.close.slice(-Math.round(v.yrs * 365) - 1), r = c.slice(1).map((p, i) => p / c[i] - 1), mu = Risk.mean(r), sd = Risk.std(r), tv = -mu + sd * Risk.normInv(v.cf);
    const Ns = [250, 500, 1000, 2500, 5000, 10000, 25000], q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
    const st = Ns.map((N, i) => { const a = Risk.x.mcVarRuns(mu, sd, v.cf, N, v.reps, 11 + i); return { N, lo: q(a, 0.05), hi: q(a, 0.95), m: Risk.mean(a), sd: Risk.std(a) }; });
    out.innerHTML = `<div class="kpis">${kpi('True VaR (normal)', pct(tv, 2), pct(v.cf, 1) + ', 1 day', 'var')}${kpi('Spread at 1,000 draws', pct(st[2].sd, 2), 'std of the estimate')}${kpi('Spread at 25,000 draws', pct(st[6].sd, 3), 'ratio ' + (st[2].sd / st[6].sd).toFixed(1) + ' (5 if 1/√N)')}</div>
      ${Lab.table(['Simulations', 'Mean estimate', '5th pct', '95th pct', 'Std of the estimate', 'Relative error'], st.map((s) => [s.N.toLocaleString('en-US'), pct(s.m, 2), pct(s.lo, 2), pct(s.hi, 2), pct(s.sd, 3), pct(s.sd / tv, 1)]))}
      ${Lab.card('c1', 'VaR estimate against number of simulations (5th to 95th percentile)', [['a', '5th'], ['b', '95th'], ['m', 'true VaR']])}`;
    const lx = st.map((s) => Math.log10(s.N));
    later(() => Lab.plot($('#c1'), { series: [{ x: lx, y: st.map((s) => s.lo), c: 'a', w: 2 }, { x: lx, y: st.map((s) => s.hi), c: 'b', w: 2 }], hlines: [{ y: tv }], xfmt: (x) => Math.round(10 ** x).toLocaleString('en-US'), yfmt: (y) => pct(y, 1), h: 210 }));
  },
});
