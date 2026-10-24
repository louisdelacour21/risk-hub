'use strict';
/* Risk, fifteenth set: expectile and spectral risk measures on one crypto asset, concentration of capital against concentration of risk. Maths in riskx14.js (tested). */
const r15Sl = (id, label, min, max, step, val, fmt) => ({ id, label, min, max, step, val, fmt });
const r15Book = [['btc', 'BTC'], ['eth', 'ETH'], ['sol', 'SOL'], ['xrp', 'XRP'], ['ada', 'ADA']];

Lab.reg('expectile', {
  kicker: 'Market risk', title: 'Expectile and spectral risk: other ways to price the tail',
  asset: true,
  lead: 'VaR says where the tail starts, ES averages it. An expectile reacts to how large the losses are, not only how often, and a spectral measure lets you choose how much each part of the tail weighs by a risk-aversion number.',
  controls: [r15Sl('tau', 'Expectile level τ', 0.9, 0.999, 0.001, 0.99, (x) => x.toFixed(3)), r15Sl('k', 'Risk aversion k (spectral)', 1, 60, 1, 20, String), r15Sl('yrs', 'History (years)', 1, 6, 0.5, 4, (x) => x + 'y')],
  note: 'Losses are the daily simple returns of the asset with the sign reversed. The <b>expectile</b> e<sub>τ</sub> solves τ·E[(L−e)<sup>+</sup>] = (1−τ)·E[(e−L)<sup>+</sup>]: a loss twice as far from e counts twice as much, while VaR only counts how many losses lie beyond it. τ = 0.5 gives the mean. It is coherent and elicitable, and each expectile equals the quantile at a lower level, shown as the “matching level”. The <b>spectral measure</b> weights the sorted losses by φ(u) = k·e<sup>−k(1−u)</sup>/(1−e<sup>−k</sup>): k near 0 is the mean, large k tends to the worst day. Both are computed on the sample, so the largest losses drive them; with fewer than a few thousand days they are noisy. Simplifications: one asset, equal weight on every day, no volatility scaling.',
  async draw(v, out, ctx) {
    const X = Risk.x, A = ctx.asset && byId(ctx.asset.id); if (!A || !Data.hasOhlcv(A.id)) throw new Error('Pick a single crypto asset with candles.');
    const o = await Data.ohlcv(A.id), c = o.close.slice(-Math.round(v.yrs * 365) - 1), L = c.slice(1).map((p, i) => 1 - p / c[i]), n = L.length;
    const q = (p) => [...L].sort((a, b) => a - b)[Math.min(n - 1, Math.ceil(n * p) - 1)], tail = (p) => { const s = [...L].sort((a, b) => b - a), m = Math.max(1, Math.ceil(n * (1 - p) - 1e-9)); return s.slice(0, m).reduce((t, x) => t + x, 0) / m; };
    const e = X.expectile(L, v.tau), lv = X.matchLevel(L, e), sp = X.spectral(L, v.k), taus = Array.from({ length: 28 }, (_, i) => 0.9 + i * 0.0035);
    const f = (x) => pct(x, 2);
    out.innerHTML = `<div class="kpis">${kpi('Expectile ' + v.tau.toFixed(3), f(e), 'matches the ' + pct(lv, 2) + ' quantile', 'var')}${kpi('VaR ' + pct(lv, 1), f(q(lv)), 'same level, for comparison')}${kpi('Spectral, k = ' + v.k, f(sp), 'weighted tail average', 'es')}${kpi('Mean loss', f(L.reduce((s, x) => s + x, 0) / n), n + ' days')}</div>
      ${Lab.table(['Measure', 'Level', 'Value'], [['VaR', '99%', f(q(0.99))], ['ES', '97.5%', f(tail(0.975))], ['ES', '99%', f(tail(0.99))], ['Expectile', v.tau.toFixed(3), f(e)], ['Spectral', 'k = ' + v.k, f(sp)], ['Worst day', '', f(Math.max(...L))]])}
      ${Lab.card('c1', 'Expectile and VaR at the same tail probability', [['a', 'expectile τ'], ['b', 'VaR at the matching level']])}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: taus, y: taus.map((t) => X.expectile(L, t)), c: 'a', w: 2 }, { x: taus, y: taus.map((t) => q(X.matchLevel(L, X.expectile(L, t)))), c: 'b', w: 2, dash: true }], xfmt: (x) => x.toFixed(2), yfmt: (y) => pct(y, 0), h: 210 }));
  },
});

Lab.reg('concen', {
  kicker: 'Market risk', title: 'Concentration: capital shares against risk shares',
  lead: 'A book can look spread out in money and still hang on one position. Three numbers tell it: the Herfindahl index, the Gini coefficient and the effective number of positions, read on capital and on risk.',
  controls: [...r15Book.map(([id, nm], i) => r15Sl(id, nm + ' weight', 0, 100, 5, [60, 20, 10, 5, 5][i], (x) => x + '%')), r15Sl('lim', 'Single-name limit (share of VaR)', 10, 60, 5, 35, (x) => x + '%')],
  note: '<b>HHI</b> is the sum of squared shares (1 = one position, 1/n = perfectly even); the <b>effective number</b> 1/HHI is how many equal positions would give the same concentration; the <b>Gini</b> coefficient runs from 0 (equal) towards 1 (one holder). Risk shares are the historical component VaR at 99% over the last 1,500 days (Euler allocation, see the risk budgeting module), so they add up to the portfolio VaR. Risk can be more or less concentrated than capital: a dominant but calmer asset (BTC) carries a smaller share of risk than of money, while volatile small holdings carry more. The limit test flags any asset whose share of VaR exceeds the chosen cap: in practice a breach triggers an escalation, a cut, or an approved exception. Simplifications: five assets, constant weights, one window, a limit expressed on shares only.',
  async draw(v, out) {
    const X = Risk.x, list = r15Book.map(([id]) => byId(id)).filter(Boolean); for (const a of list) await Data.ensure(a);
    const ws = r15Book.map(([id]) => v[id]), tot = ws.reduce((a, b) => a + b, 0); if (tot <= 0) throw new Error('Give at least one asset a positive weight.');
    const pr = Data.portfolioReturns(list, ws.map((w) => w / tot)), c = Risk.componentRisk(pr.parts.map((p, i) => ({ r: p.r, w: ws[i] / tot })), 0.99, 1500);
    const cs = X.concentration(ws), rs = X.concentration(c.items.map((it) => Math.max(it.hist, 0)));
    const rows = r15Book.map(([, nm], i) => { const sh = rs.share[i], br = sh > v.lim / 100; return [nm, pct(cs.share[i], 0), pct(sh, 0), br ? 'BREACH' : 'ok']; });
    out.innerHTML = `<div class="kpis">${kpi('Effective number (capital)', cs.eff.toFixed(2), 'of ' + r15Book.length + ' assets')}${kpi('Effective number (risk)', rs.eff.toFixed(2), 'lower means risk is more concentrated', rs.eff < cs.eff ? 'bad' : '')}${kpi('HHI capital / risk', cs.hhi.toFixed(2) + ' / ' + rs.hhi.toFixed(2), 'Gini ' + cs.gini.toFixed(2) + ' / ' + rs.gini.toFixed(2))}${kpi('Portfolio VaR', pct(c.hist, 2), '99%, 1 day, historical', 'var')}</div>
      ${Lab.table(['Asset', 'Share of capital', 'Share of VaR', 'Limit ' + v.lim + '%'], rows)}
      ${Lab.card('c1', 'Capital share against VaR share', [['m', 'capital'], ['a', 'VaR']])}`;
    const ix = r15Book.map((_, i) => i);
    later(() => Lab.plot($('#c1'), { series: [{ x: ix.map((i) => i - 0.15), y: cs.share, c: 'm', bar: true }, { x: ix.map((i) => i + 0.15), y: rs.share, c: 'a', bar: true }], hlines: [{ y: v.lim / 100 }], xfmt: (x) => r15Book[Math.round(x)] ? r15Book[Math.round(x)][1] : '', yfmt: (y) => pct(y, 0), h: 210 }));
  },
});
