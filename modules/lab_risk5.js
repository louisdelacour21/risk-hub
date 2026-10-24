'use strict';
/* Risk, fifth set: VaR scoring (tick loss, Diebold-Mariano), dependence beyond correlation, covariance cleaning, drawdown risk (CDaR), Black-Litterman, Almgren-Chriss optimal liquidation. Maths in riskx3.js (tested). */
const rzSl = (id, label, min, max, step, val, fmt) => ({ id, label, min, max, step, val, fmt });
const rzUni = [['btc', 'Bitcoin'], ['eth', 'Ether'], ['sol', 'Solana'], ['xrp', 'XRP'], ['doge', 'Dogecoin'], ['ada', 'Cardano'], ['avax', 'Avalanche'], ['ltc', 'Litecoin'], ['dot', 'Polkadot']];
const rzLoad = async (ids) => { const list = ids.map((id) => byId(id)).filter(Boolean); for (const a of list) await Data.ensure(a); return list; };
const rzRets = async (ids, n) => { const list = await rzLoad(ids), pr = Data.portfolioReturns(list, list.map(() => 1 / list.length)); return pr.parts.map((p) => p.r.slice(-n)); };
const rzCov = (rs, a, b) => { const ma = Risk.mean(rs[a]), mb = Risk.mean(rs[b]); let s = 0; for (let t = 0; t < rs[a].length; t++) s += (rs[a][t] - ma) * (rs[b][t] - mb); return s / rs[a].length; };

Lab.reg('btscore', {
  kicker: 'Market risk', title: 'VaR scoring: who forecasts the tail best',
  asset: true,
  lead: 'Counting breaches only tells you whether a VaR is about right on average. A scoring rule asks a harder question: between two models that both pass, which one tracks the tail better, and is the difference real or luck?',
  controls: [rzSl('win', 'Estimation window (days)', 120, 750, 10, 250, String), { id: 'cf', label: 'Confidence', opts: [[0.95, '95%'], [0.99, '99%']], val: 0.99 }],
  note: 'Each day the VaR is re-estimated on the previous window and compared with that day’s return. The <b>tick (quantile) loss</b> is (p − 1{r &lt; −VaR})·(r + VaR), p = 1 − confidence: it is the only simple score whose expected value is smallest at the true quantile, so a model cannot win by being systematically too high or too low. Lower is better. The <b>Diebold-Mariano</b> test takes the daily difference in loss between a model and the historical benchmark, with a Newey-West variance, and asks whether its mean is zero; a p-value below 5% means the gap is unlikely to be luck. Simplifications: four fast methods (historical, normal, Cornish-Fisher, EWMA; the filtered ones are in the Backtest page), one-day horizon so no overlap correction, the usual caveat that tail scores at 99% rest on a few breaches and have little power, and no joint VaR–ES score (Fissler-Ziegel).',
  async draw(v, out, ctx) {
    await new Promise((r) => setTimeout(r, 10)); const r = ctx.r.slice(-1500), cf = Number(v.cf), p = 1 - cf, M = [['Historical', 'historical', 'a'], ['Normal', 'normal', 'b'], ['Cornish-Fisher', 'cornishFisher', 'y'], ['EWMA', 'ewma', 'g']];
    const bt = M.map(([, m]) => Risk.rollingBacktest(r, m, cf, v.win)), rr = r.slice(v.win), L = bt.map((b) => Risk.x.tickLoss(rr, b.var, p)), avg = L.map((l) => Risk.mean(l)), best = avg.indexOf(Math.min(...avg));
    const rows = M.map(([n], i) => { const d = i ? Risk.x.dm(L[i], L[0]) : null, N = bt[i].hit.length, x = bt[i].hit.reduce((a, b) => a + b, 0); return [n + (i === best ? ' ★' : ''), pct(Risk.mean(bt[i].var), 2), `${x} (${pct(x / N, 2)})`, (avg[i] * 1e4).toFixed(3), i ? `${d.stat.toFixed(2)}` : '—', i ? (d.p < 0.05 ? `<b class="${d.mean < 0 ? 'pass' : 'fail'}">${d.p.toFixed(3)}</b>` : d.p.toFixed(3)) : '—']; });
    const cum = L.map((l) => { let s = 0; return l.map((x) => (s += x)); }), xs = rr.map((_, i) => i), rel = cum.map((c) => c.map((x, i) => (x - cum[0][i]) * 1e4));
    out.innerHTML = `<div class="kpis">${kpi('Best score', M[best][0], `tick loss ${(avg[best] * 1e4).toFixed(3)} (×1e-4)`)}${kpi('Days scored', String(rr.length), `${pct(cf, 0)} VaR, window ${v.win}`)}${kpi('Spread of scores', pct((Math.max(...avg) - Math.min(...avg)) / Math.min(...avg), 0), 'worst vs best model')}</div>
      ${Lab.card('c1', 'Cumulative loss relative to the historical VaR (below zero: better)', M.map(([n, , c]) => [c, n]))}
      ${Lab.table(['Method', 'Mean VaR', 'Breaches', 'Tick loss ×1e-4', 'DM stat vs historical', 'DM p-value'], rows)}`;
    later(() => Lab.plot($('#c1'), { series: M.slice(1).map(([, , c], i) => ({ x: xs, y: rel[i + 1], c, w: 2 })), hlines: [{ y: 0 }], xfmt: String, yfmt: (y) => y.toFixed(1), h: 230 }));
  },
});

Lab.reg('depend', {
  kicker: 'Correlation risk', title: 'Dependence beyond correlation',
  lead: 'Pearson correlation sees only a straight-line link and is dominated by calm days. Rank measures, distance correlation and mutual information each see something it misses, and correlations measured in falling and rising markets differ.',
  controls: [{ id: 'a', label: 'Asset A', sel: rzUni, val: 'btc' }, { id: 'b', label: 'Asset B', sel: rzUni, val: 'eth' }, rzSl('n', 'History (days)', 250, 1500, 50, 1000, String), rzSl('w', 'Rolling window (days)', 30, 250, 10, 90, String)],
  note: '<b>Pearson</b>: linear. <b>Spearman</b> and <b>Kendall</b>: the correlation of ranks and the share of concordant pairs, immune to outliers and unchanged by any monotone transform. <b>Distance correlation</b> (Székely): zero only if the variables are independent, so it catches non-linear links such as dependence through the variance. <b>Mutual information</b> (nats, on 10×10 equiprobable rank bins, bias-corrected by (bins−1)²/2n) measures how much knowing one tells you about the other. The conditional correlations split the days by the sign of asset A: the gap between “A falls” and “A rises” is the asymmetry that diversification forecasts miss in a crash. Simplifications: distance correlation and Kendall use the last 900 days to keep the O(n²) cost reasonable, the conditional correlations are noisy (each uses about half the days), and no confidence intervals.',
  async draw(v, out) {
    await new Promise((r) => setTimeout(r, 10)); const [x0, y0] = await rzRets([v.a, v.b], v.n); if (v.a === v.b) throw new Error('Choose two different assets.');
    const X = Risk.x, n = Math.min(x0.length, y0.length), x = x0.slice(-n), y = y0.slice(-n), m = Math.min(n, 900), xm = x.slice(-m), ym = y.slice(-m), mi = X.mutualInfo(x, y);
    const dn = [], up = [], dy = []; for (let i = 0; i < n; i++) (x[i] < 0 ? dn : up).push(i); const sub = (idx, a) => idx.map((i) => a[i]);
    const cDn = X.pearson(sub(dn, x), sub(dn, y)), cUp = X.pearson(sub(up, x), sub(up, y)), roll = [], rx = [];
    for (let t = v.w; t <= n; t += 5) { roll.push(X.pearson(x.slice(t - v.w, t), y.slice(t - v.w, t))); rx.push(t); }
    const full = X.pearson(x, y), rows = [['Pearson', full.toFixed(3), 'linear link'], ['Spearman', X.spearman(x, y).toFixed(3), 'monotone link, robust to outliers'], ['Kendall τ', X.kendall(xm, ym).toFixed(3), 'concordance of pairs'], ['Distance correlation', X.dcor(xm, ym).toFixed(3), 'any dependence, 0 only if independent'], ['Mutual information', Math.max(mi.mi - mi.bias, 0).toFixed(3), `nats, after subtracting bias ${mi.bias.toFixed(3)}`]];
    out.innerHTML = `<div class="kpis">${kpi('Pearson', full.toFixed(2), `${n} days`)}${kpi('Correlation when A falls', cDn.toFixed(2), `${dn.length} days`)}${kpi('Correlation when A rises', cUp.toFixed(2), `${up.length} days`)}${kpi('Rolling range', `${Math.min(...roll).toFixed(2)} to ${Math.max(...roll).toFixed(2)}`, `${v.w}-day windows: instability`)}</div>
      ${Lab.card('c1', 'Rolling correlation', [['a', 'Pearson, ' + v.w + ' days']])}
      ${Lab.table(['Measure', 'Value', 'What it sees'], rows)}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: rx, y: roll, c: 'a', w: 2.2 }], hlines: [{ y: 0 }, { y: full, c: 'y' }], xfmt: String, yfmt: (y) => y.toFixed(1), h: 220 }));
  },
});

Lab.reg('covclean', {
  kicker: 'Correlation risk', title: 'Covariance cleaning: sample vs Ledoit-Wolf vs random-matrix',
  lead: 'With nine assets and a few months of data the sample covariance matrix is mostly noise, and an optimiser loves noise. Two standard repairs, shrinkage and removing the eigenvalues that look random, are tested out of sample on a minimum-variance portfolio.',
  controls: [rzSl('T', 'Estimation window (days)', 30, 500, 10, 60, String), rzSl('h', 'Holding period (days)', 5, 60, 5, 20, String)],
  note: 'Every <i>h</i> days the covariance of nine assets is estimated on the previous <i>T</i> days and the <b>global minimum-variance portfolio</b> (long-short, weights sum to 1) is built from it; the realised volatility of the returns that follow is what counts. <b>Ledoit-Wolf</b> mixes the sample correlation matrix (returns standardised first, since the assets have very different volatilities) with the identity, with the shrinkage intensity estimated from the data. <b>Random-matrix cleaning</b> keeps the eigenvalues of the correlation matrix above the Marchenko-Pastur noise edge (1 + √(N/T))² and replaces the others by their average, preserving the trace. The spectrum chart shows how many eigenvalues stand out of the noise today. Simplifications: long-short weights make estimation error very visible (long-only would hide part of it), non-overlapping holding periods, no transaction costs, shrinkage target is the identity on standardised returns (not a constant-correlation target), the eigenvalue edge assumes independent returns.',
  async draw(v, out) {
    await new Promise((r) => setTimeout(r, 10)); const rs = await rzRets(rzUni.map(([id]) => id), 1500), n = rs[0].length, k = rs.length, X = Risk.x, row = (t) => rs.map((r) => r[t]);
    const names = ['Sample', 'Ledoit-Wolf', 'Random-matrix'], pr = [[], [], []]; let shrink = 0, cnt = 0, lastKept = 0;
    for (let t = v.T; t + v.h <= n; t += v.h) {
      const win = Array.from({ length: v.T }, (_, i) => row(t - v.T + i)), raw = X.sampleCov(win).S, sd = raw.map((r, i) => Math.sqrt(r[i])), lw = X.ledoitWolf(win.map((q) => q.map((x, a) => x / sd[a]))), mp = X.mpClean(X.toCorr(raw), v.T);
      const W = [X.minVar(raw), X.minVar(X.fromCorr(lw.S, sd)), X.minVar(X.fromCorr(mp.C, sd))]; shrink += lw.shrink; cnt++; lastKept = mp.kept;
      for (let i = 0; i < v.h; i++) { const q = row(t + i); W.forEach((w, j) => pr[j].push(w.reduce((s, x, a) => s + x * q[a], 0))); }
    }
    if (!cnt) throw new Error('Window and holding period are too long for the history.');
    const vol = pr.map((p) => Risk.std(p) * Math.sqrt(PPY)), eg = X.eigSym(X.toCorr(X.sampleCov(Array.from({ length: v.T }, (_, i) => row(n - v.T + i))).S)).vals, edge = (1 + Math.sqrt(k / v.T)) ** 2, xs = eg.map((_, i) => i + 1);
    out.innerHTML = `<div class="kpis">${kpi('Sample', pct(vol[0], 2), 'realised vol of the min-variance portfolio')}${kpi('Ledoit-Wolf', pct(vol[1], 2), `average shrinkage ${pct(shrink / cnt, 0)}`)}${kpi('Random-matrix', pct(vol[2], 2), `${lastKept} signal eigenvalue(s) kept out of ${k}`)}${kpi('Best estimate', names[vol.indexOf(Math.min(...vol))], vol.indexOf(Math.min(...vol)) ? `${pct(1 - Math.min(...vol) / vol[0], 0)} lower volatility than the sample matrix` : 'cleaning did not help on this window')}</div>
      ${Lab.card('c1', 'Eigenvalues of the correlation matrix (last window) vs the noise edge', [['a', 'eigenvalues'], ['r', 'Marchenko-Pastur edge']])}
      ${Lab.table(['Covariance estimate', 'Realised volatility', 'Periods', 'Conditioning (largest / smallest eigenvalue, last window)'], names.map((nm, i) => [nm, pct(vol[i], 2), String(cnt), i === 0 ? (eg[0] / Math.max(eg[k - 1], 1e-12)).toFixed(0) : i === 1 ? '—' : (eg[0] / Math.max(edge > eg[k - 1] ? eg.filter((x) => x <= edge).reduce((a, b) => a + b, 0) / Math.max(1, eg.filter((x) => x <= edge).length) : eg[k - 1], 1e-12)).toFixed(0)]))}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: xs, y: eg, c: 'a', bar: true }], hlines: [{ y: edge, c: 'r' }], xfmt: (i) => '#' + i, yfmt: (y) => y.toFixed(1), h: 220 }));
  },
});

Lab.reg('cdar', {
  kicker: 'Market risk', title: 'Drawdown risk: max drawdown and CDaR',
  asset: true,
  lead: 'Investors feel drawdowns, not daily volatility. Conditional drawdown at risk (CDaR) is to drawdowns what expected shortfall is to daily losses: the average of the worst ones.',
  controls: [{ id: 'cf', label: 'Confidence', opts: [[0.9, '90%'], [0.95, '95%'], [0.99, '99%']], val: 0.95 }, rzSl('yrs', 'History (years)', 2, 15, 1, 10, (x) => x + 'y')],
  note: 'The drawdown on a day is the fall from the running peak of the cumulative return. <b>Drawdown at risk</b> is the quantile of the daily drawdown values and <b>CDaR</b> is their average beyond it (Chekhlov-Uryasev-Zabarankin), a coherent measure that is also convex, so it can be minimised by linear programming. The chart is an “underwater” plot. Drawdowns come in episodes: the table lists the five deepest with their length and recovery time, which is what a client actually remembers. Simplifications: the whole series is used without regard to regime, simple compounding of daily returns, no fees and no cash flows, and the distribution is of daily values (an episode counts for each of its days).',
  draw(v, out, ctx) {
    const r = ctx.r.slice(-Math.round(v.yrs * PPY)), dd = Risk.x.drawdowns(r), c = Risk.x.cdar(dd, Number(v.cf)), mx = Math.max(...dd), under = dd.filter((x) => x > 0).length / dd.length, eps = [];
    let s = -1, peak = 0; for (let i = 0; i <= dd.length; i++) { if (i < dd.length && dd[i] > 0) { if (s < 0) s = i; peak = Math.max(peak, dd[i]); } else if (s >= 0) { eps.push({ s, e: i, d: peak, len: i - s, trough: s + dd.slice(s, i).indexOf(peak) }); s = -1; peak = 0; } }
    eps.sort((a, b) => b.d - a.d); const xs = dd.map((_, i) => i), top = eps.slice(0, 5);
    out.innerHTML = `<div class="kpis">${kpi('Maximum drawdown', pct(mx, 1), 'deepest fall from a peak')}${kpi('DaR ' + pct(v.cf, 0), pct(c.dar, 1), 'drawdown exceeded 1 − confidence of the days')}${kpi('CDaR ' + pct(v.cf, 0), pct(c.cdar, 1), 'average of the worst days')}${kpi('Time under water', pct(under, 0), 'of days below the previous peak')}</div>
      ${Lab.card('c1', 'Underwater curve', [['r', 'drawdown']])}
      ${Lab.table(['Episode', 'Depth', 'Days down', 'Days to trough', 'Recovered'], top.map((e, i) => ['#' + (i + 1), pct(e.d, 1), String(e.len), String(e.trough - e.s + 1), e.e >= dd.length ? '<b class="fail">not yet</b>' : 'yes']))}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: xs, y: dd.map((x) => -x), c: 'r', w: 1.8 }], hlines: [{ y: -c.dar, c: 'y' }], xfmt: (i) => '−' + ((dd.length - i) / PPY).toFixed(0) + 'y', yfmt: (y) => pct(y, 0), h: 220 }));
  },
});

Lab.reg('almgren', {
  kicker: 'Liquidity risk', title: 'Optimal liquidation (Almgren-Chriss)',
  lead: 'Selling fast moves the price against you; selling slowly leaves you exposed to it. The best schedule balances the two, and which one is “best” depends on how much risk you are willing to carry.',
  controls: [rzSl('X', 'Shares to sell (millions)', 0.1, 10, 0.1, 2, String), rzSl('T', 'Horizon (days)', 1, 20, 1, 5, String), rzSl('sig', 'Daily volatility', 0.005, 0.05, 0.005, 0.02, (x) => pct(x, 1)), rzSl('adv', 'Average daily volume (millions)', 1, 50, 1, 10, String), rzSl('lam', 'Risk aversion', 0, 10, 0.5, 2, String)],
  note: 'The price follows a random walk; each trade of <i>n</i> shares costs a <b>temporary impact</b> η·n/τ per share (it fades after the trade) and moves the price permanently by γ·n. Impact is calibrated from volume: trading a full day’s volume costs a half spread of 5 bp temporarily and 1 bp permanently. Minimising <b>expected cost + λ × variance</b> gives the schedule x(t) = X sinh(κ(T − t)) / sinh(κT) with κ = √(λσ² / η): with λ = 0 it is a straight line (TWAP), and the more risk-averse you are the more you sell at the start. The efficient frontier is the set of (risk, cost) pairs reached by varying λ. Simplifications: linear impact (the empirical one is closer to a square root), one asset, no intraday seasonality or volume forecast, impact parameters fixed by the volume rule above, no price drift or alpha.',
  draw(v, out) {
    const X = v.X * 1e6, N = Math.max(10, v.T * 4), P = 100, adv = v.adv * 1e6, sig = v.sig * P, eta = 0.0005 * P / adv, gam = 0.0001 * P / adv, ac = (l) => Risk.x.almgrenChriss(X, v.T, N, sig, eta, gam, l);
    const L = (m) => m * 1e-10, a = ac(L(v.lam)), tw = ac(0), ts = Array.from({ length: N + 1 }, (_, k) => (k * v.T) / N), fr = [0, 0.25, 0.5, 1, 2, 4, 8, 16, 32].map((m) => ac(L(m)));
    const bp = (c) => ((c / (X * P)) * 1e4).toFixed(1) + ' bp', sd = (s) => ((s / (X * P)) * 1e4).toFixed(0) + ' bp';
    out.innerHTML = `<div class="kpis">${kpi('Expected cost', bp(a.cost), `vs ${bp(tw.cost)} for an even (TWAP) schedule`)}${kpi('Risk (1 s.d.)', sd(a.sd), `vs ${sd(tw.sd)} for TWAP`)}${kpi('Sold in first day', pct(1 - a.x[Math.round(N / v.T)] / X, 0), `${pct(1 / v.T, 0)} if even`)}${kpi('Participation', pct(X / v.T / adv, 0), 'of daily volume on average')}</div>
      ${Lab.card('c1', 'Shares still held through time (fraction of the order)', [['a', 'optimal'], ['y', 'even (TWAP)']])}
      ${Lab.card('c2', 'Efficient frontier: cost vs risk for different risk aversions', [['a', 'frontier'], ['r', 'your choice']])}`;
    later(() => { Lab.plot($('#c1'), { series: [{ x: ts, y: a.x.map((x) => x / X), c: 'a', w: 2.6 }, { x: ts, y: tw.x.map((x) => x / X), c: 'y', w: 2, dash: true }], xfmt: (t) => t.toFixed(1) + 'd', yfmt: (y) => pct(y, 0), h: 200 });
      const pts = fr.map((f) => [f.sd / (X * P) * 1e4, f.cost / (X * P) * 1e4]).sort((p, q) => p[0] - q[0]); Lab.plot($('#c2'), { series: [{ x: pts.map((p) => p[0]), y: pts.map((p) => p[1]), c: 'a', w: 2.4, dots: true }, { x: [a.sd / (X * P) * 1e4], y: [a.cost / (X * P) * 1e4], c: 'r', dots: true }], xfmt: (x) => x.toFixed(0) + ' bp', yfmt: (y) => y.toFixed(1) + ' bp', h: 200 }); });
  },
});
