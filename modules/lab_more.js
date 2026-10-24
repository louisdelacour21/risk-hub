'use strict';
/* Labs linked to the portfolio and the risk modules: futures hedging, autocorrelation, unexpected loss. */
const frmN = (x) => Math.round(x).toLocaleString('en-US');
const frmSl = (id, label, min, max, step, val, fmt) => ({ id, label, min, max, step, val, fmt });
const frmP = (d) => (x) => pct(x, d);
const frmBench = { id: 'bm', label: 'Benchmark / futures underlying', sel: () => assetOptsPf(), val: 'btc' };
async function frmPair(a, bId) {
  const b = await resolveAsset(bId);
  if (a.id === b.id) { const r = Data.returnsOf(a).r; return { y: r, x: r }; }
  const p = Data.portfolioReturns([a, b], [1, 0]); return { y: p.parts[0].r, x: p.parts[1].r };
}

Lab.reg('hedge', {
  kicker: 'Performance', title: 'Hedging with futures',
  lead: 'To hedge an exposure with a futures contract that does not match it exactly, you pick the hedge ratio that minimises the variance of the hedged position. Here the futures is the benchmark, the exposure is the selected asset or your portfolio.',
  asset: true, controls: [frmBench, frmSl('val', 'Exposure (k)', 100, 50000, 100, 10000, frmN), frmSl('fut', 'Value of one futures contract (k)', 10, 1000, 10, 250, frmN), frmSl('tb', 'Target beta', -1, 2, 0.05, 0, (x) => x.toFixed(2))],
  note: 'Minimum-variance hedge ratio <b>HR = ρ·σ<sub>S</sub>/σ<sub>F</sub></b> (the slope of the regression of spot on futures returns). Number of contracts = HR × exposure / contract value. To move a stock portfolio from beta β to β*, trade <b>(β* − β)·P/A</b> index futures. Hedge effectiveness is the R² of the regression: the share of variance removed.',
  async draw(v, out, ctx) {
    const pr = await frmPair(ctx.asset, v.bm), g = Risk.regress(pr.y, pr.x), rho = Math.sqrt(g.r2) * Math.sign(g.beta), sS = Risk.std(pr.y), sF = Risk.std(pr.x), hr = rho * sS / sF;
    const n = hr * v.val / v.fut, n2 = (v.tb - g.beta) * v.val / v.fut, hedged = pr.y.map((y, i) => y - hr * pr.x[i]), sH = Risk.std(hedged);
    const hs = Array.from({ length: 41 }, (_, i) => i * hr * 1.5 / 40), vs = hs.map((h) => Risk.std(pr.y.map((y, i) => y - h * pr.x[i])) * Math.sqrt(PPY));
    out.innerHTML = `<div class="kpis">${kpi('Hedge ratio', hr.toFixed(2), `ρ ${rho.toFixed(2)} × ${pct(sS * Math.sqrt(PPY), 1)} / ${pct(sF * Math.sqrt(PPY), 1)}`)}${kpi('Contracts (short)', n.toFixed(1), 'HR × exposure / contract')}${kpi('Variance removed', pct(g.r2, 0), 'hedge effectiveness R²')}${kpi('Volatility', pct(sS * Math.sqrt(PPY), 1) + ' → ' + pct(sH * Math.sqrt(PPY), 1), 'before → after hedge')}</div>
      <div class="kpis">${kpi('Beta of the exposure', g.beta.toFixed(2), 'vs the futures underlying')}${kpi(`Futures to reach beta ${v.tb.toFixed(2)}`, (n2 >= 0 ? 'buy ' : 'sell ') + Math.abs(n2).toFixed(1), '(β* − β)·P/A')}</div>
      ${Lab.card('c1', 'Volatility of the hedged position against the hedge ratio', null)}`;
    Lab.plot($('#c1'), { series: [{ x: hs, y: vs, c: 'a', w: 2.4 }], vlines: [{ x: hr, c: 'y', t: 'minimum variance' }], xfmt: (x) => x.toFixed(2), yfmt: (y) => pct(y, 0), h: 250 });
  },
});

Lab.reg('acf', {
  kicker: 'Risk', title: 'Autocorrelation, AR(1) and normality',
  lead: 'Returns are almost uncorrelated, but their squares are not: volatility clusters. This is the empirical reason GARCH exists, and why √T scaling of VaR is only an approximation.',
  asset: true, controls: [frmSl('lags', 'Lags', 5, 60, 1, 25, String)],
  note: 'Autocorrelation <b>ρ(τ) = γ<sub>τ</sub>/γ<sub>0</sub></b>; under an AR(1) with parameter β it equals β<sup>|τ|</sup> and the stationary variance is σ²/(1 − β²). Bars outside ±1.96/√n are significant at 5%. <b>Jarque-Bera = (T−1)(S²/6 + (K−3)²/24)</b> tests normality.',
  draw(v, out, ctx) {
    const r = ctx.r, n = r.length, m = Risk.mean(r), d = r.map((x) => x - m), sq = r.map((x) => x * x), ms = Risk.mean(sq), ds = sq.map((x) => x - ms);
    const ac = (x) => { const g0 = x.reduce((a, b) => a + b * b, 0); return Array.from({ length: v.lags }, (_, k) => { let s = 0; for (let i = k + 1; i < n; i++) s += x[i] * x[i - k - 1]; return s / g0; }); };
    const a1 = ac(d), a2 = ac(ds), band = 1.96 / Math.sqrt(n), beta = a1[0], mo = Risk.moments(r), jb = Risk.jarqueBera(r), ks = a1.map((_, i) => i + 1);
    const lbq = (a) => { let q = 0; for (let k = 1; k <= Math.min(10, a.length); k++) q += a[k - 1] ** 2 / (n - k); return n * (n + 2) * q; };
    const q1 = lbq(a1), q2 = lbq(a2);
    const bars = (a) => ({ x: ks, y: a, c: 'a', bar: true });
    out.innerHTML = `<div class="kpis">${kpi('AR(1) β of returns', beta.toFixed(3), `${Math.abs(beta) > band ? 'significant' : 'not significant'} (band ±${band.toFixed(3)})`)}${kpi('AR(1) β of squares', a2[0].toFixed(3), 'volatility clustering')}${kpi('Box-Ljung Q(10), returns / squares', q1.toFixed(0) + ' / ' + q2.toFixed(0), 'χ²(10) 5% critical value: 18.3')}${kpi('Jarque-Bera', jb.jb.toFixed(0), jb.p < 0.01 ? 'normality rejected' : `p = ${jb.p.toFixed(3)}`)}</div>
      <div class="duo">${Lab.card('c1', 'Autocorrelation of returns', null)}${Lab.card('c2', 'Autocorrelation of squared returns', null)}</div>
      ${Lab.table(['Statistic', 'Value'], [['Skewness', mo.skew.toFixed(2)], ['Excess kurtosis', mo.exkurt.toFixed(2)], ['Innovation volatility σ = s·√(1 − β²), annual', pct(Risk.std(r) * Math.sqrt((1 - beta * beta) * PPY), 2)], ['Number of observations', n]])}`;
    Lab.plot($('#c1'), { series: [bars(a1)], hlines: [{ y: band, c: 'm' }, { y: -band, c: 'm' }], xfmt: String, yfmt: (y) => y.toFixed(2), h: 220 });
    Lab.plot($('#c2'), { series: [bars(a2)], hlines: [{ y: band, c: 'm' }, { y: -band, c: 'm' }], xfmt: String, yfmt: (y) => y.toFixed(2), h: 220 });
  },
});

Lab.reg('creditul', {
  kicker: 'Credit', title: 'Unexpected loss of a loan portfolio',
  lead: 'Expected loss is a cost of business, priced into the loan. Capital protects against the unexpected part: the volatility of losses, which depends on default correlation between borrowers.',
  controls: [frmSl('e1', 'Loan 1 exposure', 10, 1000, 10, 500, frmN), frmSl('p1', 'PD 1', 0.001, 0.2, 0.001, 0.02, frmP(1)), frmSl('l1', 'LGD 1', 0.1, 1, 0.01, 0.45, frmP(0)), frmSl('e2', 'Loan 2 exposure', 10, 1000, 10, 300, frmN), frmSl('p2', 'PD 2', 0.001, 0.2, 0.001, 0.05, frmP(1)), frmSl('l2', 'LGD 2', 0.1, 1, 0.01, 0.6, frmP(0)), frmSl('rho', 'Correlation of default events', -0.2, 1, 0.01, 0.25, (x) => x.toFixed(2))],
  note: 'Single loan: <b>EL = PD·LGD·EAD</b> and <b>UL = EAD·√(PD·σ<sub>LR</sub>² + LR²·PD(1−PD))</b>; with a fixed loss rate this is EAD·LGD·√(PD(1−PD)), the standard deviation of a Bernoulli loss. Two loans: <b>UL<sub>P</sub> = √(UL₁² + UL₂² + 2ρUL₁UL₂)</b>. The diversification benefit is the gap to the plain sum UL₁ + UL₂.',
  draw(v) {
    const ul = (e, p, l) => e * l * Math.sqrt(p * (1 - p)), el = (e, p, l) => e * p * l, u1 = ul(v.e1, v.p1, v.l1), u2 = ul(v.e2, v.p2, v.l2), up = (r) => Math.sqrt(u1 * u1 + u2 * u2 + 2 * r * u1 * u2);
    const rs = Array.from({ length: 41 }, (_, i) => -0.2 + i * 0.03), elp = el(v.e1, v.p1, v.l1) + el(v.e2, v.p2, v.l2);
    later(() => Lab.plot($('#c1'), { series: [{ x: rs, y: rs.map(up), c: 'r', w: 2.4 }], hlines: [{ y: u1 + u2, c: 'm', t: 'sum, ρ = 1' }], vlines: [{ x: v.rho, c: 'y', t: 'yours' }], xfmt: (x) => x.toFixed(1), yfmt: (y) => y.toFixed(0), h: 240 }));
    return `<div class="kpis">${kpi('Portfolio expected loss', elp.toFixed(1), `${el(v.e1, v.p1, v.l1).toFixed(1)} + ${el(v.e2, v.p2, v.l2).toFixed(1)}`)}${kpi('UL loan 1 / loan 2', u1.toFixed(1) + ' / ' + u2.toFixed(1), 'EAD·LGD·√(PD(1−PD))')}${kpi('Portfolio UL', up(v.rho).toFixed(1), `ρ = ${v.rho.toFixed(2)}`)}${kpi('Diversification benefit', pct(1 - up(v.rho) / (u1 + u2), 0), 'vs the sum of the two UL')}</div>
      ${Lab.card('c1', 'Portfolio unexpected loss against default correlation', null)}`;
  },
});

/* Deterministic normal draws for the Monte Carlo below. */
function mxNormals(n, seed) { let s = seed >>> 0; const u = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) + 0.5) / 4294967296; return Array.from({ length: n }, () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u())); }
const mxBin = (k, n, p) => { let c = 1; for (let i = 0; i < k; i++) c *= (n - i) / (i + 1); return c * p ** k * (1 - p) ** (n - k); };
const mxPmf = (n, p) => Array.from({ length: n + 1 }, (_, k) => mxBin(k, n, p));
function mxVar(pmf, step, c) { let a = 0; for (let k = 0; k < pmf.length; k++) { a += pmf[k]; if (a >= c - 1e-12) return k * step; } return (pmf.length - 1) * step; }
function mxEs(pmf, step, c) { let left = 1 - c, s = 0; for (let k = pmf.length - 1; k >= 0 && left > 1e-15; k--) { const w = Math.min(pmf[k], left); s += w * k * step; left -= w; } return s / (1 - c); }

Lab.reg('subadd', {
  kicker: 'Risk', title: 'VaR is not subadditive, ES is',
  lead: 'Diversification should never increase risk. Spread credit exposure over several independent loans and the VaR of the pool can come out higher than the sum of the VaRs of each loan. Expected Shortfall never does.',
  controls: [frmSl('n', 'Number of loans', 2, 30, 1, 2, String), frmSl('p', 'Default probability of each', 0.005, 0.1, 0.005, 0.04, frmP(1)), frmSl('c', 'Confidence level', 0.9, 0.995, 0.005, 0.95, frmP(1)), frmSl('L', 'Loss if one defaults', 10, 200, 10, 100, String)],
  note: 'Each loan loses L with probability p, independently. One loan alone has VaR 0 whenever p &lt; 1 − confidence, because the default sits beyond the quantile. Put two together and the chance of at least one default, about 2p, can exceed 1 − confidence: the pool VaR jumps to L while the sum of stand-alone VaRs stays 0. Subadditivity, VaR(A+B) ≤ VaR(A) + VaR(B), is one of the four axioms of a coherent risk measure; ES satisfies it, VaR does not.',
  draw(v) {
    const one = mxPmf(1, v.p), v1 = mxVar(one, v.L, v.c), e1 = mxEs(one, v.L, v.c), pm = mxPmf(v.n, v.p), vn = mxVar(pm, v.L, v.c), en = mxEs(pm, v.L, v.c);
    const ns = Array.from({ length: 29 }, (_, i) => i + 2), gap = ns.map((n) => mxVar(mxPmf(n, v.p), v.L, v.c) - n * v1), bad = vn > v.n * v1 + 1e-9;
    later(() => Lab.plot($('#c1'), { series: [{ x: ns, y: gap, c: 'r', w: 2.4, bar: true }], hlines: [{ y: 0 }], xfmt: String, yfmt: (y) => y.toFixed(0), h: 230 }));
    return `<div class="kpis">${kpi('Stand-alone VaR', v1.toFixed(0), `each loan, ${pct(v.c, 1)}`)}${kpi(`VaR of the ${v.n} loans`, vn.toFixed(0), `sum of stand-alone: ${(v.n * v1).toFixed(0)}`)}${kpi('VaR diversification', bad ? 'NEGATIVE' : 'ok', bad ? `pool VaR is ${(vn - v.n * v1).toFixed(0)} higher` : 'VaR(sum) ≤ sum of VaR')}${kpi('ES of the pool vs sum of ES', en.toFixed(1) + ' vs ' + (v.n * e1).toFixed(1), 'subadditive, always')}</div>
      ${Lab.card('c1', 'Pool VaR minus the sum of stand-alone VaRs, by number of loans (above zero = VaR rewards concentration)', null)}`;
  },
});

Lab.reg('deltagamma', {
  kicker: 'Risk', title: 'Delta-normal, delta-gamma and full revaluation',
  lead: 'A VaR for an option book can be computed three ways, and they disagree exactly when it matters. The delta approximation sees a straddle as risk-free; full revaluation does not.',
  controls: [{ id: 'pos', label: 'Position', opts: [['ss', 'Short straddle'], ['sc', 'Short call'], ['lc', 'Long call'], ['ls', 'Long straddle']], val: 'ss' }, frmSl('vol', 'Implied volatility', 0.1, 0.8, 0.01, 0.3, frmP(0)), frmSl('T', 'Maturity (years)', 0.05, 2, 0.05, 0.25, (x) => x.toFixed(2)), frmSl('h', 'Horizon (days)', 1, 20, 1, 10, String), frmSl('c', 'Confidence', 0.9, 0.995, 0.005, 0.99, frmP(1)), frmSl('k', 'Strike / spot', 0.8, 1.2, 0.01, 1, (x) => x.toFixed(2))],
  note: 'Underlying return over the horizon ~ N(0, σ²h/252). <b>Delta-normal</b>: P&amp;L ≈ Δ·dS. <b>Delta-gamma</b>: P&amp;L ≈ Δ·dS + ½Γ·dS². <b>Full</b>: reprice with Black-Scholes at the shocked spot and the shortened maturity. A short straddle has Δ ≈ 0, so the first method reports almost nothing, while the loss in a large move is real.',
  draw(v) {
    const S = 100, K = S * v.k, r = 0.02, sd = v.vol * Math.sqrt(v.h / PPY), legs = { ss: [['P', -1], ['C', -1]], ls: [['P', 1], ['C', 1]], sc: [['C', -1]], lc: [['C', 1]] }[v.pos];
    const val = (s, T) => legs.reduce((a, [t, w]) => a + w * Risk.bs(s, K, Math.max(T, 1e-6), v.vol, r, 0, t).price, 0);
    const g0 = legs.reduce((a, [t, w]) => { const b = Risk.bs(S, K, v.T, v.vol, r, 0, t); a.d += w * b.delta; a.g += w * b.gamma; return a; }, { d: 0, g: 0 }), V0 = val(S, v.T);
    const z = mxNormals(20000, 7), Tn = v.T - v.h / PPY;
    if (Tn <= 0) throw new Error('Horizon must be shorter than the maturity.');
    const q = (a) => { const s = a.slice().sort((x, y) => x - y); return -s[Math.floor((1 - v.c) * s.length)]; }, pF = [], pD = [], pG = [];
    for (const e of z) { const ds = S * (Math.exp(sd * e - sd * sd / 2) - 1); pF.push(val(S + ds, Tn) - V0); pD.push(g0.d * ds); pG.push(g0.d * ds + 0.5 * g0.g * ds * ds); }
    const vF = q(pF), vD = q(pD), vG = q(pG), xs = Array.from({ length: 61 }, (_, i) => (i - 30) / 30 * 4 * sd);
    later(() => Lab.plot($('#c1'), { series: [{ x: xs, y: xs.map((x) => val(S * (1 + x), Tn) - V0), c: 'a', w: 2.4 }, { x: xs, y: xs.map((x) => g0.d * S * x), c: 'm', w: 1.6, dash: [5, 4] }, { x: xs, y: xs.map((x) => g0.d * S * x + 0.5 * g0.g * (S * x) ** 2), c: 'g', w: 1.6, dash: [2, 3] }], hlines: [{ y: 0 }], xfmt: (x) => pct(x, 0), yfmt: (y) => y.toFixed(1), h: 250 }));
    return `<div class="kpis">${kpi('Delta-normal VaR', vD.toFixed(2), `Δ = ${g0.d.toFixed(2)}`)}${kpi('Delta-gamma VaR', vG.toFixed(2), `Γ = ${g0.g.toFixed(3)}`)}${kpi('Full revaluation VaR', vF.toFixed(2), 'the reference')}${kpi('Delta-normal error', vF > 1e-9 ? pct(vD / vF - 1, 0) : 'n/a', 'vs full revaluation')}</div>
      ${Lab.card('c1', 'P&amp;L of the position against the underlying move over the horizon', [['a', 'full revaluation'], ['m', 'delta only'], ['g', 'delta + gamma']])}`;
  },
});

Lab.reg('irrbb', {
  kicker: 'Rates', title: 'Banking-book rate risk: duration gap and EVE',
  lead: 'A bank borrows short and lends long. When rates move, assets and liabilities lose value by different amounts and the difference hits equity. The duration gap sizes that exposure; the repricing gap sizes the effect on interest income.',
  controls: [frmSl('da', 'Duration of assets (y)', 0.5, 12, 0.1, 5, (x) => x.toFixed(1)), frmSl('dl', 'Duration of liabilities (y)', 0.1, 8, 0.1, 1.5, (x) => x.toFixed(1)), frmSl('e', 'Equity / assets', 0.02, 0.2, 0.005, 0.08, frmP(1)), frmSl('y', 'Level of rates', 0.005, 0.1, 0.0025, 0.03, frmP(2)), frmSl('s', 'Rate shock (bp)', -300, 300, 25, 200, String), frmSl('ra', 'Assets repricing within 1y', 0, 1, 0.05, 0.3, frmP(0)), frmSl('rl', 'Liabilities repricing within 1y', 0, 1, 0.05, 0.7, frmP(0))],
  note: '<b>Duration gap DG = D<sub>A</sub> − (L/A)·D<sub>L</sub></b>; the change in economic value of equity is ΔEVE ≈ −DG·A·Δy/(1+y). The exact curve revalues each side as a zero-coupon at its duration, so the curvature is visible. <b>Repricing gap</b> = RSA − RSL over one year; ΔNII ≈ gap × Δy. A positive duration gap loses value when rates rise, a negative one when they fall.',
  draw(v) {
    const A = 100, L = A * (1 - v.e), E = A - L, dg = v.da - L / A * v.dl, dy = v.s / 1e4, pv = (x, D, d) => x * ((1 + v.y) / (1 + v.y + d)) ** D;
    const eve = (d) => pv(A, v.da, d) - pv(L, v.dl, d) - E, shocks = Array.from({ length: 61 }, (_, i) => -0.03 + i * 0.001), gap = A * v.ra - L * v.rl;
    later(() => Lab.plot($('#c1'), { series: [{ x: shocks, y: shocks.map(eve), c: 'a', w: 2.4 }, { x: shocks, y: shocks.map((d) => -dg * A * d / (1 + v.y)), c: 'm', w: 1.5, dash: [5, 4] }], hlines: [{ y: 0 }], xfmt: (x) => Math.round(x * 1e4) + 'bp', yfmt: (y) => y.toFixed(1), h: 250 }));
    const rows = [-200, -100, 100, 200].map((b) => [(b > 0 ? '+' : '') + b + ' bp', eve(b / 1e4).toFixed(2), pct(eve(b / 1e4) / E, 1), (gap * b / 1e4).toFixed(2)]);
    return `<div class="kpis">${kpi('Duration gap', dg.toFixed(2) + ' y', `${v.da.toFixed(1)} − ${(L / A).toFixed(2)} × ${v.dl.toFixed(1)}`)}${kpi(`ΔEVE for ${v.s} bp`, eve(dy).toFixed(2), `${pct(eve(dy) / E, 1)} of equity (per 100 of assets)`)}${kpi('Repricing gap (1y)', gap.toFixed(1), gap > 0 ? 'asset-sensitive: income rises with rates' : 'liability-sensitive: income falls with rates')}${kpi(`ΔNII for ${v.s} bp`, (gap * dy).toFixed(2), 'gap × shock, one year')}</div>
      ${Lab.card('c1', 'Change in economic value of equity against the rate shock', [['a', 'exact'], ['m', 'duration gap']])}${Lab.table(['Parallel shock', 'ΔEVE', 'ΔEVE / equity', 'ΔNII (1y)'], rows)}`;
  },
});

Lab.reg('netting', {
  kicker: 'Credit', title: 'Counterparty exposure and netting',
  lead: 'What you could lose if a counterparty defaults is the positive part of what it owes you. Netting lets gains and losses across trades offset, and the benefit depends on how correlated the trades are.',
  controls: [frmSl('n', 'Trades in the netting set', 1, 50, 1, 10, String), frmSl('rho', 'Correlation between trades', -0.02, 1, 0.02, 0.3, (x) => x.toFixed(2)), frmSl('sg', 'Annual MtM volatility of one trade', 0.5, 20, 0.5, 5, (x) => x.toFixed(1)), frmSl('T', 'Horizon (years)', 1, 10, 1, 5, String), frmSl('q', 'PFE quantile', 0.9, 0.99, 0.01, 0.95, frmP(0)), frmSl('mp', 'Margin period of risk (days)', 0, 30, 1, 10, String)],
  note: 'Trade MtM follows a driftless random walk, so exposure at t is N(0, σ²t). Without netting EE(t) = n·σ√t/√(2π). With netting the set has variance σ²t·(n + n(n−1)ρ) and <b>netting factor = √(n + n(n−1)ρ)/n</b>. EPE is the time average of EE; PFE is the quantile of the exposure. With collateral, exposure is only what can move during the margin period of risk (MPOR), which behaves like a horizon of MPOR/252 years.',
  draw(v) {
    const vf = v.n + v.n * (v.n - 1) * v.rho, nf = Math.sqrt(Math.max(vf, 0)) / v.n, ts = Array.from({ length: 41 }, (_, i) => 0.05 + i * (v.T - 0.05) / 40), z = Risk.normInv(v.q), c = 1 / Math.sqrt(2 * Math.PI);
    const eeG = (t) => v.n * v.sg * Math.sqrt(t) * c, eeN = (t) => eeG(t) * nf, pfe = (t) => z * v.sg * Math.sqrt(t * Math.max(vf, 0)), avg = (f) => ts.reduce((a, t) => a + f(t), 0) / ts.length;
    later(() => Lab.plot($('#c1'), { series: [{ x: ts, y: ts.map(eeG), c: 'm', w: 2, dash: [5, 4] }, { x: ts, y: ts.map(eeN), c: 'a', w: 2.4 }, { x: ts, y: ts.map(pfe), c: 'r', w: 1.8 }], xfmt: (x) => x.toFixed(0) + 'y', yfmt: (y) => y.toFixed(0), h: 250 }));
    return `<div class="kpis">${kpi('Netting factor', nf.toFixed(2), `${pct(1 - nf, 0)} less exposure than gross`)}${kpi('EPE, netted', avg(eeN).toFixed(1), `gross ${avg(eeG).toFixed(1)}`)}${kpi(`Peak PFE ${pct(v.q, 0)}`, Math.max(...ts.map(pfe)).toFixed(1), 'netted, at the horizon')}${kpi(`Margined exposure (MPOR ${v.mp}d)`, (z * v.sg * Math.sqrt(v.mp / PPY * Math.max(vf, 0))).toFixed(1), 'PFE over the margin period only')}</div>
      ${Lab.card('c1', 'Exposure profile over time', [['m', 'EE, no netting'], ['a', 'EE, netted'], ['r', 'PFE, netted']])}`;
  },
});

Lab.reg('sma', {
  kicker: 'Risk', title: 'Operational risk: the SMA and its echo effect',
  lead: 'Basel III replaces internal models with one formula: a charge on the size of the business, scaled up or down by the bank\'s own loss history. One big loss then raises capital for ten years and drops out suddenly, the echo effect.',
  controls: [frmSl('bi', 'Business indicator (bn)', 1.5, 60, 0.5, 10, String), frmSl('al', 'Average annual operational loss (m)', 1, 300, 1, 30, String), frmSl('ev', 'One-off loss event (m)', 0, 3000, 50, 800, String)],
  note: '<b>SMA = BIC × ILM.</b> BIC = 12% of the first 1bn of business indicator, 15% from 1 to 30bn, 18% above. <b>ILM = ln(e − 1 + (LC/BIC)<sup>0.8</sup>)</b> with LC = 15 × average annual loss over ten years; ILM = 1 when LC = BIC. A one-off loss L adds 1.5·L to LC for ten years (15/10), so capital jumps at the event and falls back exactly ten years later. Simplified: the 1bn bucket is not a separate regime here, and the full rule has further conditions.',
  draw(v) {
    const B = 1000 * (v.bi <= 30 ? 0.12 + 0.15 * (v.bi - 1) : 0.12 + 0.15 * 29 + 0.18 * (v.bi - 30)), LC = 15 * v.al, ilm = (lc) => Math.log(Math.E - 1 + (lc / B) ** 0.8), sma = (extra) => B * ilm(LC + extra);
    const yrs = Array.from({ length: 25 }, (_, i) => i - 2), cap = yrs.map((y) => sma(y >= 0 && y < 10 ? 1.5 * v.ev : 0));
    later(() => Lab.plot($('#c1'), { series: [{ x: yrs, y: cap, c: 'r', w: 2.4, fill: true }], hlines: [{ y: sma(0), c: 'm' }], xfmt: (x) => 'y' + x, yfmt: (y) => y.toFixed(0), h: 240 }));
    return `<div class="kpis">${kpi('BIC', B.toFixed(0) + ' m', 'size-based charge')}${kpi('ILM', ilm(LC).toFixed(2), `LC = ${LC.toFixed(0)} m`)}${kpi('SMA capital', sma(0).toFixed(0) + ' m', 'BIC × ILM')}${kpi('Capital after the event', sma(1.5 * v.ev).toFixed(0) + ' m', `+${(sma(1.5 * v.ev) - sma(0)).toFixed(0)} m for ten years`)}</div>
      ${Lab.card('c1', 'SMA capital through time: the event happens in year 0', null)}`;
  },
});

Lab.reg('xva', {
  kicker: 'Credit', title: 'XVA: CVA, DVA and FVA',
  lead: 'The price of a derivative with no default risk is not what you can book. CVA is the cost of the counterparty defaulting, DVA the benefit of your own default, FVA the cost of funding the uncollateralised exposure.',
  controls: [frmSl('n', 'Trades in the netting set', 1, 50, 1, 10, String), frmSl('rho', 'Correlation between trades', -0.02, 1, 0.02, 0.3, (x) => x.toFixed(2)), frmSl('sg', 'Annual MtM volatility of one trade', 0.5, 20, 0.5, 5, (x) => x.toFixed(1)), frmSl('T', 'Maturity (years)', 1, 10, 1, 5, String), frmSl('cs', 'Counterparty CDS spread (bp)', 20, 1000, 10, 200, String), frmSl('os', 'Own CDS spread (bp)', 20, 1000, 10, 100, String), frmSl('R', 'Recovery rate', 0, 0.8, 0.05, 0.4, frmP(0)), frmSl('fs', 'Funding spread (bp)', 0, 300, 10, 80, String), frmSl('r', 'Discount rate', 0, 0.06, 0.005, 0.03, frmP(1))],
  note: 'Exposure is the driftless netted set of the Exposure and netting module: EE(t) = ENE(t) = σ√t·√(n + n(n−1)ρ)/√(2π). Hazard rate λ = spread / (1 − R). <b>CVA = (1 − R)·Σ EE(tᵢ)·DF(tᵢ)·[Q(tᵢ₋₁) − Q(tᵢ)]</b> with survival Q(t) = e^(−λt). DVA is the same with the own spread and ENE; FVA = funding spread × Σ EE·DF·Δt, a simplification that ignores the overlap with DVA. All amounts are in the units of σ, so read them relative to each other.',
  draw(v) {
    const vf = Math.max(v.n + v.n * (v.n - 1) * v.rho, 0), c = 1 / Math.sqrt(2 * Math.PI), N = v.T * 12, dt = v.T / N, ts = Array.from({ length: N + 1 }, (_, i) => i * dt);
    const ee = (t) => v.sg * Math.sqrt(t * vf) * c, df = (t) => Math.exp(-v.r * t);
    const lam = (bp) => bp / 1e4 / (1 - v.R), Q = (bp, t) => Math.exp(-lam(bp) * t);
    const cva = (bp) => { let s = 0; for (let i = 1; i <= N; i++) s += ee((ts[i] + ts[i - 1]) / 2) * df(ts[i]) * (Q(bp, ts[i - 1]) - Q(bp, ts[i])); return (1 - v.R) * s; };
    let fva = 0; for (let i = 1; i <= N; i++) fva += ee((ts[i] + ts[i - 1]) / 2) * df(ts[i]) * dt * v.fs / 1e4;
    const C = cva(v.cs), D = cva(v.os), spreads = Array.from({ length: 30 }, (_, i) => 20 + i * 30), net = D - C - fva;
    later(() => Lab.plot($('#c1'), { series: [{ x: spreads, y: spreads.map(cva), c: 'r', w: 2.4 }], vlines: [{ x: v.cs, c: 'm' }], xfmt: (x) => x.toFixed(0), yfmt: (y) => y.toFixed(1), h: 240 }));
    return `<div class="kpis">${kpi('CVA', C.toFixed(2), `${(C / v.sg * 100).toFixed(0)}% of one trade’s annual σ`)}${kpi('DVA', D.toFixed(2), 'benefit of your own default')}${kpi('FVA', fva.toFixed(2), `${v.fs} bp on the expected exposure`)}${kpi('Net XVA', net.toFixed(2), net < 0 ? 'cost deducted from the price' : 'adds to the price')}</div>
      ${Lab.card('c1', 'CVA against the counterparty spread (bp)', null)}
      ${Lab.table(['Component', 'Value', 'Driver'], [['CVA', C.toFixed(2), `spread ${v.cs} bp, λ = ${pct(lam(v.cs), 2)}, survival to maturity ${pct(Q(v.cs, v.T), 0)}`], ['DVA', D.toFixed(2), `own spread ${v.os} bp`], ['FVA', fva.toFixed(2), `funding spread ${v.fs} bp`], ['Net (DVA − CVA − FVA)', net.toFixed(2), 'adjustment to the risk-free value']])}`;
  },
});
