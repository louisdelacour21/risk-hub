'use strict';
/* Market-risk labs, second set: risk budgeting, liquidity-adjusted VaR, tail dependence (copulas), square-root-of-time failure. */
const rkSl = (id, label, min, max, step, val, fmt) => ({ id, label, min, max, step, val, fmt });
const rkBook = [['btc', 'Bitcoin'], ['eth', 'Ether'], ['sol', 'Solana'], ['xrp', 'XRP'], ['doge', 'Dogecoin']];

Lab.reg('riskbudget', {
  kicker: 'Market risk', title: 'Risk budgeting: who really holds the risk?',
  lead: 'Capital weights say where the money is; risk contributions say where the loss will come from. A 60/40 portfolio is typically 90% equity risk. Set the weights and read the budget.',
  controls: [...rkBook.map(([id, nm], i) => rkSl(id, nm + ' weight', 0, 100, 5, [40, 30, 10, 10, 10][i], (x) => x + '%')), { id: 'cf', label: 'Confidence', opts: [[0.95, '95%'], [0.99, '99%']], val: 0.99 }],
  note: '<b>Component VaR</b> splits the portfolio VaR into additive pieces: CVaR<sub>i</sub> = w<sub>i</sub> · ∂VaR/∂w<sub>i</sub>, and Σ CVaR<sub>i</sub> = VaR (Euler). Historical version: average of the asset’s return over the days around the VaR quantile (a ±2.5% band, since a single day is too noisy). Normal version: w<sub>i</sub>(Σw)<sub>i</sub> / σ<sub>p</sub> · z. <b>ES contribution</b> is the asset’s average loss over the worst days. <b>Marginal VaR</b> = component / weight = risk added per unit of weight. A holding with a high marginal VaR relative to others is where a weight cut reduces risk most. The “standalone” column ignores diversification, so its sum exceeds the portfolio VaR. Simplifications: constant weights, daily rebalancing, one window of 1,500 days.',
  async draw(v, out) {
    const list = rkBook.map(([id]) => byId(id)).filter(Boolean); for (const a of list) await Data.ensure(a);
    const ws = rkBook.map(([id]) => v[id]), tot = ws.reduce((a, b) => a + b, 0); if (tot <= 0) throw new Error('Give at least one asset a positive weight.');
    const pr = Data.portfolioReturns(list, ws.map((w) => w / tot)), parts = pr.parts.map((p, i) => ({ r: p.r, w: ws[i] / tot })), c = Risk.componentRisk(parts, v.cf, 1500);
    const sum = (k) => c.items.reduce((s, it) => s + it[k], 0), row = (it, i) => [rkBook[i][1], pct(it.w, 0), pct(it.alone, 2), pct(it.hist, 2), pct(it.hist / (sum('hist') || 1), 0), pct(it.histEs / (sum('histEs') || 1), 0), pct(it.norm, 2), (it.w > 0 ? it.hist / it.w : 0).toFixed(3)];
    const top = c.items.map((it, i) => i).sort((a, b) => c.items[b].hist - c.items[a].hist)[0];
    out.innerHTML = `<div class="kpis">${kpi('Portfolio VaR (hist.)', pct(c.hist, 2), `${pct(v.cf, 0)}, 1 day, last ${c.n} days`, 'var')}${kpi('Portfolio ES', pct(c.es, 2), 'average of the worst days', 'es')}${kpi('Diversification benefit', pct(1 - c.hist / sum('alone'), 0), `sum of standalone VaRs ${pct(sum('alone'), 2)}`)}${kpi('Largest risk holder', rkBook[top][1], `${pct(c.items[top].hist / (sum('hist') || 1), 0)} of VaR for ${pct(c.items[top].w, 0)} of capital`)}</div>
      ${Lab.card('c1', 'Capital weight vs share of VaR and of ES', [['m', 'capital'], ['a', 'VaR'], ['r', 'ES']])}
      ${Lab.table(['Asset', 'Weight', 'Standalone VaR', 'Component VaR', 'Share of VaR', 'Share of ES', 'Component VaR (normal)', 'Marginal VaR'], c.items.map(row))}`;
    const ix = c.items.map((_, i) => i);
    later(() => Lab.plot($('#c1'), { series: [{ x: ix.map((i) => i - 0.27), y: c.items.map((it) => it.w), c: 'm', bar: true }, { x: ix, y: c.items.map((it) => it.hist / (sum('hist') || 1)), c: 'a', bar: true }, { x: ix.map((i) => i + 0.27), y: c.items.map((it) => it.histEs / (sum('histEs') || 1)), c: 'r', bar: true }], hlines: [{ y: 0 }], xfmt: (i) => (rkBook[Math.round(i)] || [, ''])[1], yfmt: (y) => pct(y, 0), h: 240 }));
  },
});

Lab.reg('lvar', {
  kicker: 'Market risk', title: 'Liquidity-adjusted VaR',
  lead: 'A VaR assumes you can exit at the mid price tomorrow. A large position cannot: it takes days to sell, the price keeps moving while you do, and you pay the spread. Both add to the loss.',
  asset: true, controls: [rkSl('pos', 'Position size (millions)', 1, 2000, 1, 300, String), rkSl('adv', 'Average daily volume (millions)', 5, 5000, 5, 400, String), rkSl('par', 'Max share of daily volume', 0.05, 0.5, 0.05, 0.2, (x) => pct(x, 0)), rkSl('sp', 'Bid-ask spread (bp)', 1, 200, 1, 15, String), rkSl('spm', 'Spread widening in stress (×)', 1, 5, 0.25, 2, (x) => x.toFixed(2) + '×'), { id: 'cf', label: 'Confidence', opts: [[0.95, '95%'], [0.99, '99%']], val: 0.99 }],
  note: '<b>LVaR = VaR over the liquidation horizon + liquidation cost.</b> Exit days <i>h</i> = position / (participation × ADV). Selling linearly over <i>h</i> days leaves a position that shrinks, so the exposed variance is σ²·Σ(k/h)² = σ²·(h+1)(2h+1)/(6h) per day-unit (not h·σ², which would assume holding everything until the end). The cost term is the exogenous-spread rule of Bangia et al.: ½ × spread × (stressed multiplier) × position. The “naive” VaR on the screen is the 1-day figure that ignores both. Simplifications: no market impact beyond the spread (real impact grows with participation: at 20% of ADV it is often larger than the spread), constant volatility, no overnight gaps.',
  draw(v, out, ctx) {
    const r = ctx.r.slice(-1500), h1 = Risk.historical(r, v.cf).var, days = Math.max(1, Math.ceil(v.pos / (v.par * v.adv)));
    const varL = (d) => h1 * Math.sqrt((d * (d + 1) * (2 * d + 1)) / (6 * d * d)), cost = 0.5 * v.sp * 1e-4 * v.spm * v.pos, v0 = h1 * v.pos, vL = varL(days) * v.pos, lv = vL + cost;
    const ds = Array.from({ length: 20 }, (_, i) => i + 1), ser = ds.map((d) => (varL(d) * v.pos + cost) / v.pos);
    out.innerHTML = `<div class="kpis">${kpi('Naive 1-day VaR', v.pos * h1 < 10 ? (v0).toFixed(2) + ' M' : v0.toFixed(1) + ' M', `${pct(h1, 2)} of the position`, 'var')}${kpi('Days to exit', days + ' d', `${pct(v.par, 0)} of ${v.adv} M daily volume`)}${kpi('Liquidation-horizon VaR', vL.toFixed(1) + ' M', `×${(vL / v0).toFixed(2)} the naive figure`)}${kpi('Liquidity cost', cost.toFixed(2) + ' M', `½ × ${v.sp} bp × ${v.spm}× stress`)}${kpi('LVaR', lv.toFixed(1) + ' M', `+${((lv / v0 - 1) * 100).toFixed(0)}% versus naive VaR`)}</div>
      ${Lab.card('c1', 'LVaR as a share of the position, by exit time', null)}
      ${Lab.table(['Item', 'Million', 'Share of position'], [['Naive VaR (1 day, mid price)', v0.toFixed(2), pct(h1, 2)], [`Extra risk from ${days} days to exit`, (vL - v0).toFixed(2), pct((vL - v0) / v.pos, 2)], ['Spread cost', cost.toFixed(2), pct(cost / v.pos, 2)], ['LVaR', lv.toFixed(2), pct(lv / v.pos, 2)]])}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: ds, y: ser, c: 'a', w: 2.4 }], vlines: [{ x: Math.min(days, 20), c: 'y' }], hlines: [{ y: h1, c: 'm', t: 'naive 1-day' }], xfmt: String, yfmt: (y) => pct(y, 1), h: 230 }));
  },
});

Lab.reg('tailcop', {
  kicker: 'Market risk', title: 'Tail dependence: Gaussian vs t copula',
  lead: 'Two markets can have the same correlation and very different joint crashes. The Gaussian copula says extreme moves are nearly independent; reality, and the t copula, say they cluster. This is the 2008 CDO lesson, measured on your data.',
  controls: [{ id: 'a', label: 'Asset A', sel: assetOpts, val: 'btc' }, { id: 'b', label: 'Asset B', sel: assetOpts, val: 'sol' }, rkSl('nu', 't-copula degrees of freedom', 3, 30, 1, 5, String)],
  note: 'Dependence is separated from the margins by working on <b>ranks</b>. The correlation parameter is taken from Kendall’s τ (ρ = sin(πτ/2)), which does not depend on the margins or on outliers. For each copula the joint exceedance P(both below the u-quantile) is simulated (40,000 draws), and for the data it is counted. The t copula has <b>lower tail dependence</b> λ = 2·t<sub>ν+1</sub>(−√((ν+1)(1−ρ)/(1+ρ))), which stays positive as u → 0; the Gaussian one has λ = 0. Lower ν means heavier joint tails. Simplifications: static copula (no GARCH filtering of the margins), one ν for the pair; a tail-weighted fit would use a likelihood on pseudo-observations.',
  async draw(v, out) {
    const A = byId(v.a), B = byId(v.b); if (!A || !B || A === B) throw new Error('Pick two different assets.'); await Data.ensure(A); await Data.ensure(B);
    const pr = Data.portfolioReturns([A, B], [1, 1]), x = pr.parts[0].r, y = pr.parts[1].r, n = x.length;
    const step = Math.max(1, Math.floor(n / 1500)); let c = 0, d = 0; for (let i = 0; i < n; i += step) for (let j = i + step; j < n; j += step) { const s = (x[i] - x[j]) * (y[i] - y[j]); if (s > 0) c++; else if (s < 0) d++; }
    const tau = (c - d) / (c + d), rho = Math.sin((Math.PI * tau) / 2), rk = (a) => { const o = a.map((_, i) => i).sort((p, q) => a[p] - a[q]), r = Array(a.length); o.forEach((i, k) => (r[i] = (k + 1) / (a.length + 1))); return r; }, ux = rk(x), uy = rk(y);
    const us = [0.005, 0.01, 0.02, 0.05, 0.1], emp = us.map((u) => ux.reduce((s, q, i) => s + (q < u && uy[i] < u ? 1 : 0), 0) / n);
    const R = Risk.rng(5), N = 40000, sim = (nu) => { const zs = [], ws = []; for (let i = 0; i < N; i++) { const z1 = R.n(), z2 = rho * z1 + Math.sqrt(1 - rho * rho) * R.n(), w = nu ? Math.sqrt(nu / Array.from({ length: nu }, () => R.n() ** 2).reduce((a, b) => a + b, 0)) : 1; zs.push([z1 * w, z2 * w]); } const q = (k, u) => { const s = zs.map((p) => p[k]).sort((a, b) => a - b); return s[Math.floor(u * N)]; }; return us.map((u) => { const qa = q(0, u), qb = q(1, u); return zs.filter((p) => p[0] < qa && p[1] < qb).length / N; }); };
    const g = sim(0), t = sim(v.nu), tt = (z, df) => 0.5 * Risk.eco.tTwoSided(Math.abs(z), df), lam = 2 * tt(-Math.sqrt(((v.nu + 1) * (1 - rho)) / (1 + rho)), v.nu + 1);
    out.innerHTML = `<div class="kpis">${kpi('Kendall τ / implied ρ', tau.toFixed(2) + ' / ' + rho.toFixed(2), `${n} common days`)}${kpi('Joint 1% crash, data', pct(emp[1], 2), `independence would give ${pct(0.0001, 2)}`)}${kpi('Gaussian copula', pct(g[1], 2), `${(g[1] / emp[1] * 100).toFixed(0)}% of observed`)}${kpi('t copula (ν=' + v.nu + ')', pct(t[1], 2), `${(t[1] / emp[1] * 100).toFixed(0)}% of observed; λ<sub>L</sub> = ${lam.toFixed(2)}`)}</div>
      ${Lab.card('c1', 'Probability both fall below their own u-quantile', [['m', 'data'], ['b', 'Gaussian'], ['a', 't copula'], ['y', 'independence u²']])}
      ${Lab.table(['u', 'Data', 'Gaussian', 't copula', 'Independence'], us.map((u, i) => [pct(u, 1), pct(emp[i], 2), pct(g[i], 2), pct(t[i], 2), pct(u * u, 3)]))}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: us, y: emp, c: 'm', w: 2.4, dots: true, r: 3 }, { x: us, y: g, c: 'b', w: 2 }, { x: us, y: t, c: 'a', w: 2 }, { x: us, y: us.map((u) => u * u), c: 'y', w: 1.2, dash: true }], xfmt: (q) => pct(q, 1), yfmt: (q) => pct(q, 2), h: 240 }));
  },
});

Lab.reg('sqrtt', {
  kicker: 'Market risk', title: 'The square-root-of-time rule: when it fails',
  lead: 'Regulators and desks scale a 1-day VaR to 10 days by multiplying by √10. That is exact only for independent, constant-variance returns. Measure how far the real 10-day losses are from it.',
  asset: true, controls: [{ id: 'cf', label: 'Confidence', opts: [[0.95, '95%'], [0.99, '99%']], val: 0.99 }, rkSl('H', 'Longest horizon (days)', 10, 60, 5, 20, String)],
  note: 'For each horizon <i>h</i> the module compares (i) the 1-day historical VaR × √h and (ii) the historical VaR of <b>overlapping h-day returns</b>. Overlap makes consecutive windows share days, so the estimate is smoother but its effective sample is about N/h: at 99% and h = 20 it rests on a handful of independent episodes, so a ratio above or below 1 is suggestive, not proven. The rule overstates when returns mean-revert and understates when they trend or when volatility clusters into the window (the 1-day VaR is then measured in a calm period that the next 10 days do not respect). Basel 2.5 and IMA moved from the √10 rule to ES with explicit liquidity horizons for this reason.',
  draw(v, out, ctx) {
    const r = ctx.r.slice(-3000), hs = Array.from({ length: v.H / 5 }, (_, i) => (i + 1) * 5); hs.unshift(1);
    const lr = r.map((q) => Math.log(1 + q)), h1 = Risk.historical(r, v.cf).var, row = hs.map((h) => { const a = []; for (let i = h; i <= lr.length; i++) { let s = 0; for (let k = i - h; k < i; k++) s += lr[k]; a.push(Math.expm1(s)); } const real = Risk.historical(a, v.cf).var; return { h, sc: h1 * Math.sqrt(h), real }; });
    const r10 = row.find((q) => q.h === 10) || row[row.length - 1];
    out.innerHTML = `<div class="kpis">${kpi('1-day VaR', pct(h1, 2), `${pct(v.cf, 0)}, ${r.length} days`, 'var')}${kpi('10-day by √T', pct(h1 * Math.sqrt(10), 2), 'what the rule gives')}${kpi('10-day measured', pct(r10.real, 2), 'overlapping windows')}${kpi('Ratio at ' + r10.h + ' days', (r10.real / r10.sc).toFixed(2), r10.real > r10.sc * 1.03 ? 'the rule understates the risk' : r10.real < r10.sc * 0.97 ? 'the rule overstates the risk' : 'the rule is about right here')}</div>
      ${Lab.card('c1', 'VaR by horizon: √T scaling vs measured', [['m', '√T scaling'], ['r', 'measured']])}
      ${Lab.table(['Horizon', '√T scaling', 'Measured', 'Ratio'], row.map((q) => [q.h + ' d', pct(q.sc, 2), pct(q.real, 2), (q.real / q.sc).toFixed(2)]))}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: row.map((q) => q.h), y: row.map((q) => q.sc), c: 'm', w: 2, dash: true }, { x: row.map((q) => q.h), y: row.map((q) => q.real), c: 'r', w: 2.4, dots: true, r: 3 }], xfmt: String, yfmt: (q) => pct(q, 0), h: 240 }));
  },
});
