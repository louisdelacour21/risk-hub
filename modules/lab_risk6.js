'use strict';
/* Risk, sixth set: Euler risk contributions and incremental VaR, stressed VaR (Basel 2.5), Higham nearest correlation matrix, DCC-GARCH correlation. Maths in riskx4.js (tested). */
const rwSl = (id, label, min, max, step, val, fmt) => ({ id, label, min, max, step, val, fmt });
const rwUni = [['btc', 'Bitcoin'], ['eth', 'Ether'], ['sol', 'Solana'], ['xrp', 'XRP'], ['doge', 'Dogecoin'], ['ada', 'Cardano'], ['avax', 'Avalanche'], ['ltc', 'Litecoin'], ['dot', 'Polkadot']];
const rwRets = async (ids, n) => { const list = ids.map((id) => byId(id)).filter(Boolean); for (const a of list) await Data.ensure(a); const pr = Data.portfolioReturns(list, list.map(() => 1 / list.length)); return pr.parts.map((p) => p.r.slice(-n)); };

const rwBook = [['btc', 'Bitcoin', 35], ['eth', 'Ether', 25], ['sol', 'Solana', 15], ['xrp', 'XRP', 10], ['ltc', 'Litecoin', 10], ['doge', 'Dogecoin', 5]];
Lab.reg('euler', {
  kicker: 'Market risk', title: 'Who owns the risk: component and incremental VaR',
  lead: 'Portfolio risk does not split by weight. Euler’s rule splits expected shortfall exactly into contributions that add up, and shows which positions carry a share of the tail bigger than their share of the money.',
  controls: [...rwBook.map(([id, nm, w]) => rwSl(id, nm + ' weight', 0, 100, 5, w, (x) => x + '%')), { id: 'cf', label: 'Confidence', opts: [[0.95, '95%'], [0.975, '97.5%'], [0.99, '99%']], val: 0.975 }, rwSl('yrs', 'History (years)', 2, 15, 1, 10, (x) => x + 'y')],
  note: 'On the historical scenarios, the loss is L = −Σ wᵢrᵢ. Because ES is homogeneous of degree one, <b>ES = Σ wᵢ ∂ES/∂wᵢ</b> (Euler), and the derivative is the expected loss of asset <i>i</i> given the portfolio is in its tail, so the contributions are the average loss of each position over the tail days and add up exactly. <b>Component VaR</b> uses the same idea at the quantile, estimated from the 2m+1 days nearest the VaR (m = 1% of the sample, at least 3): it is noisy and sums to the VaR only approximately, which is why ES is preferred for allocation. <b>Incremental VaR</b> is the VaR minus the VaR with the position removed; unlike the component it is a finite change, and with diversification the incrementals do not add up. A negative number means the position is a hedge. Simplifications: weights are held constant (daily rebalancing), history is equally weighted with no volatility scaling, no estimation error bars, positions are long-only cash assets.',
  async draw(v, out) {
    await new Promise((r) => setTimeout(r, 10)); const n = Math.round(v.yrs * PPY), rs = await rwRets(rwBook.map((b) => b[0]), n), tot = rwBook.reduce((s, b) => s + (v[b[0]] || 0), 0);
    if (tot <= 0) throw new Error('Give at least one position a positive weight.');
    const w = rwBook.map((b) => (v[b[0]] || 0) / tot), T = Math.min(...rs.map((r) => r.length)), R = Array.from({ length: T }, (_, t) => rs.map((r) => r[r.length - T + t])), cf = Number(v.cf);
    const X = Risk.x, c = X.contrib(R, w, cf), inc = X.incrementalVar(R, w, cf), cvSum = c.cVar.reduce((a, b) => a + b, 0);
    const alone = w.map((wi, i) => { const L = R.map((row) => -wi * row[i]).sort((a, b) => a - b), k = Math.max(1, Math.ceil((1 - cf) * L.length)); return Risk.mean(L.slice(L.length - k)); });
    const share = c.cEs.map((x) => x / c.es), top = share.map((s, i) => s - w[i]), big = top.indexOf(Math.max(...top)), xs = rwBook.map((_, i) => i);
    out.innerHTML = `<div class="kpis">${kpi('Portfolio VaR ' + pct(cf, 1), pct(c.var, 2), `${T} daily scenarios`)}${kpi('Expected shortfall', pct(c.es, 2), 'average of the tail days')}${kpi('Diversification', pct(1 - c.es / alone.reduce((a, b) => a + b, 0), 0), 'ES saved versus adding standalone ES')}${kpi('Most over-weight in risk', rwBook[big][1], `${pct(share[big], 0)} of ES for ${pct(w[big], 0)} of money`)}</div>
      ${Lab.card('c1', 'Share of expected shortfall minus share of capital (above zero: carries more risk than money)', [['a', 'ES share − weight']])}
      ${Lab.table(['Position', 'Weight', 'Standalone ES', 'ES contribution', 'Share of ES', 'VaR component', 'Incremental VaR'], rwBook.map((b, i) => [b[1], pct(w[i], 0), pct(alone[i], 2), pct(c.cEs[i], 3), `<b${share[i] > w[i] + 0.02 ? ' class="fail"' : ''}>${pct(share[i], 0)}</b>`, pct(c.cVar[i], 3), pct(inc[i], 3) + (inc[i] < 0 ? ' (hedge)' : '')]).concat([['<b>Total</b>', '100%', '—', pct(c.cEs.reduce((a, b) => a + b, 0), 3), '100%', pct(cvSum, 3) + ` (VaR ${pct(c.var, 3)})`, '—']]))}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: xs, y: top, c: 'a', bar: true }], hlines: [{ y: 0 }], xfmt: (i) => (rwBook[Math.round(i)] || [])[1] || '', yfmt: (y) => pct(y, 0), h: 220 }));
  },
});

Lab.reg('svar', {
  kicker: 'Market risk', title: 'Stressed VaR: the worst year in the history',
  asset: true,
  lead: 'A VaR computed on a calm year says little about a crisis. Basel 2.5 added a second VaR calibrated on the most stressful 12 months available, and charges capital on the sum of the two.',
  controls: [{ id: 'cf', label: 'Confidence', opts: [[0.975, 'ES 97.5%'], [0.99, 'VaR 99%']], val: 0.975 }, rwSl('win', 'Window (days)', 120, 500, 10, 250, String), rwSl('mult', 'Regulatory multiplier', 3, 4, 0.25, 3, (x) => x.toFixed(2))],
  note: 'The risk figure (historical expected shortfall at 97.5%, or VaR at 99%) is recomputed on every rolling window of the chosen length. The <b>current</b> figure uses the latest window; the <b>stressed</b> figure uses the window with the highest value in the whole history, which is the 12-month period that would have hurt this position most. The Basel 2.5 market-risk charge is <b>(multiplier_c × VaR + multiplier_s × sVaR)</b> with multipliers of at least 3 and the 10-day figure obtained by √10 scaling; the table shows the bare ratio, since the multiplier only rescales. Simplifications: a single asset, the stress window is chosen on the position itself (banks must pick the one that is worst for the whole portfolio and justify it), calendar quirks of the 12-month window are ignored, the √10 scaling is the regulatory shortcut and is wrong under autocorrelated or volatility-clustered returns, and the FRTB framework replaces all of this by a stressed ES with a reduced factor set.',
  draw(v, out, ctx) {
    const r = ctx.r, cf = Number(v.cf), X = Risk.x, es = X.rollingEs(r, v.win, cf);
    if (es.length < 2) throw new Error('Not enough history for this window.');
    let b = 0; for (let i = 1; i < es.length; i++) if (es[i] > es[b]) b = i;
    const cur = es[es.length - 1], st = es[b], xs = es.map((_, i) => i), end = b + v.win - 1, yrs = (i) => (new Date().getFullYear() - Math.round((r.length - i) / PPY));
    const charge = Math.sqrt(10) * (v.mult * cur + v.mult * st);
    out.innerHTML = `<div class="kpis">${kpi('Current', pct(cur, 2), 'last window, 1 day')}${kpi('Stressed', pct(st, 2), `window ending day ${end + 1} of ${r.length}`)}${kpi('Stressed / current', '×' + (st / cur).toFixed(2), cur < st ? 'today is calmer than the worst period' : 'today is the worst period')}${kpi('10-day charge, % of position', pct(charge, 1), `√10 × ${v.mult.toFixed(2)} × (current + stressed)`)}</div>
      ${Lab.card('c1', 'Rolling ' + v.win + '-day risk figure; the line marks the stressed level', [['r', 'rolling ES/VaR']])}
      ${Lab.table(['', 'Value', 'Period'], [['Current', pct(cur, 2), `last ${v.win} days`], ['Stressed', pct(st, 2), `days ${b + 1}–${end + 1}, about ${yrs(end)}`], ['Calmest', pct(Math.min(...es), 2), 'lowest window in the history'], ['Average', pct(Risk.mean(es), 2), `${es.length} windows`]])}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: xs, y: es, c: 'r', w: 1.8 }], hlines: [{ y: st, c: 'y' }, { y: cur, c: 'a' }], xfmt: (i) => '−' + ((es.length - i) / PPY).toFixed(0) + 'y', yfmt: (y) => pct(y, 1), h: 220 }));
  },
});

Lab.reg('higham', {
  kicker: 'Correlation risk', title: 'Repairing an impossible correlation matrix',
  lead: 'Correlations set by hand, or estimated pair by pair on different samples, can describe no real portfolio: A and B tightly linked, B and C tightly linked, yet A and C opposite. Simulation then fails. Higham’s algorithm finds the closest valid matrix.',
  controls: [rwSl('ab', 'ρ(A, B)', -1, 1, 0.05, 0.9, (x) => x.toFixed(2)), rwSl('bc', 'ρ(B, C)', -1, 1, 0.05, 0.9, (x) => x.toFixed(2)), rwSl('ac', 'ρ(A, C)', -1, 1, 0.05, -0.9, (x) => x.toFixed(2))],
  note: 'A correlation matrix must be symmetric, have a unit diagonal and be <b>positive semi-definite</b> (no negative eigenvalue); otherwise some portfolio has negative variance and a Cholesky decomposition fails. With three assets the condition is 1 + 2ρ<sub>AB</sub>ρ<sub>BC</sub>ρ<sub>AC</sub> − ρ<sub>AB</sub>² − ρ<sub>BC</sub>² − ρ<sub>AC</sub>² ≥ 0. <b>Higham (2002)</b> finds the nearest correlation matrix in Frobenius norm by Dykstra’s alternating projections between “positive semi-definite” (clip negative eigenvalues) and “unit diagonal”. Simplifications: the Frobenius norm treats all entries equally (weighted versions exist when some correlations are better known), the result is semi-definite, not strictly positive, so add a small ridge before inverting, and the repair is mechanical: it does not say which input was wrong.',
  draw(v, out) {
    const X = Risk.x, A = [[1, v.ab, v.ac], [v.ab, 1, v.bc], [v.ac, v.bc, 1]], e0 = X.eigSym(A).vals, h = X.higham(A), e1 = X.eigSym(h.C).vals, bad = e0[2] < -1e-9, det = 1 + 2 * v.ab * v.bc * v.ac - v.ab ** 2 - v.bc ** 2 - v.ac ** 2;
    const mt = (M) => Lab.table(['', 'A', 'B', 'C'], M.map((r, i) => ['ABC'[i], ...r.map((x, j) => (i === j ? '1' : x.toFixed(3)))]));
    out.innerHTML = `<div class="kpis">${kpi('Input matrix', bad ? 'invalid' : 'valid', bad ? 'a negative eigenvalue' : 'positive semi-definite', bad ? 'var' : '')}${kpi('Smallest eigenvalue', e0[2].toFixed(3), `after repair ${Math.max(e1[2], 0).toFixed(3)}`)}${kpi('Distance moved', h.dist.toFixed(3), `Frobenius, ${h.iters} iterations`)}${kpi('Determinant', det.toFixed(3), det < 0 ? 'negative: impossible' : 'non-negative')}</div>
      <div class="grid2"><div><h3>Input</h3>${mt(A)}</div><div><h3>Nearest valid matrix</h3>${mt(h.C)}</div></div>
      ${Lab.card('c1', 'Eigenvalues before and after (a negative bar is the problem)', [['r', 'input'], ['a', 'repaired']])}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: [1, 2, 3], y: e0, c: 'r', bar: true }, { x: [1, 2, 3], y: e1.map((x) => Math.max(x, 0)), c: 'a', bar: true }], hlines: [{ y: 0 }], xfmt: (i) => 'λ' + Math.round(i), yfmt: (y) => y.toFixed(1), h: 200 }));
  },
});

Lab.reg('dcc', {
  kicker: 'Correlation risk', title: 'Dynamic correlation: DCC-GARCH',
  lead: 'Correlations move, usually up when markets fall. DCC estimates a correlation for every day: each asset’s volatility is first removed with a GARCH(1,1), then the correlation of what remains is allowed to drift.',
  controls: [{ id: 'a', label: 'Asset A', sel: rwUni, val: 'btc' }, { id: 'b', label: 'Asset B', sel: rwUni, val: 'eth' }, rwSl('n', 'History (days)', 500, 2500, 100, 1500, String)],
  note: 'Step 1: a GARCH(1,1) is fitted to each asset by maximum likelihood and the returns are divided by their conditional volatility, giving standardised residuals z. Step 2 (Engle 2002): Q<sub>t</sub> = (1−a−b)·Q̄ + a·z<sub>t−1</sub>z′<sub>t−1</sub> + b·Q<sub>t−1</sub> and ρ<sub>t</sub> = q<sub>12</sub>/√(q<sub>11</sub>q<sub>22</sub>), where Q̄ is the unconditional correlation of z; (a, b) maximise the correlation likelihood on a grid. a + b close to 1 means correlation shocks are persistent; the likelihood gain over a = b = 0 says whether time variation is worth modelling. The “stress” correlation is the average ρ<sub>t</sub> on the 10% of days when asset A has its lowest conditional volatility-adjusted return. Simplifications: two assets only (the multivariate version estimates a and b once for the whole matrix), two-step estimation is consistent but not efficient, Gaussian likelihood, no asymmetric terms (ADCC) and no standard errors.',
  async draw(v, out) {
    await new Promise((r) => setTimeout(r, 10)); if (v.a === v.b) throw new Error('Choose two different assets.');
    const [x, y] = await rwRets([v.a, v.b], v.n), X = Risk.x, g1 = Risk.eco.garchMle(x.map((r) => r * 100)), g2 = Risk.eco.garchMle(y.map((r) => r * 100)), f = X.dccFit(g1.z, g2.z), n = f.rho.length;
    const idx = g1.z.map((z, t) => t).sort((i, j) => g1.z[i] - g1.z[j]).slice(0, Math.round(0.1 * n)), idy = g1.z.map((z, t) => t).sort((i, j) => g1.z[j] - g1.z[i]).slice(0, Math.round(0.1 * n)), full = X.pearson(x, y);
    const rS = Risk.mean(idx.map((t) => f.rho[t])), rU = Risk.mean(idy.map((t) => f.rho[t])), xs = f.rho.map((_, i) => i);
    out.innerHTML = `<div class="kpis">${kpi('Correlation today', f.rho[n - 1].toFixed(2), `tomorrow ${f.next.toFixed(2)}`)}${kpi('Constant (full sample)', full.toFixed(2), `range of ρₜ: ${Math.min(...f.rho).toFixed(2)} to ${Math.max(...f.rho).toFixed(2)}`)}${kpi('A’s worst days', rS.toFixed(2), `A’s best days ${rU.toFixed(2)}`)}${kpi('DCC a, b', `${f.a.toFixed(2)}, ${f.b.toFixed(2)}`, `persistence ${(f.a + f.b).toFixed(2)}, likelihood gain ${(f.ll - f.ll0).toFixed(0)}`)}</div>
      ${Lab.card('c1', 'Daily conditional correlation', [['a', 'DCC ρₜ']])}
      ${Lab.table(['Asset', 'GARCH α', 'GARCH β', 'Persistence', 'Half-life of a vol shock', 'Vol today (annual)'], [[byId(v.a).name || v.a, g1.a.toFixed(3), g1.b.toFixed(3), g1.persistence.toFixed(3), g1.halfLife.toFixed(0) + ' d', pct(Math.sqrt(g1.next) / 100 * Math.sqrt(PPY), 1)], [byId(v.b).name || v.b, g2.a.toFixed(3), g2.b.toFixed(3), g2.persistence.toFixed(3), g2.halfLife.toFixed(0) + ' d', pct(Math.sqrt(g2.next) / 100 * Math.sqrt(PPY), 1)]])}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: xs, y: f.rho, c: 'a', w: 1.8 }], hlines: [{ y: 0 }, { y: full, c: 'y' }], xfmt: (i) => '−' + ((n - i) / PPY).toFixed(0) + 'y', yfmt: (y) => y.toFixed(1), h: 220 }));
  },
});
