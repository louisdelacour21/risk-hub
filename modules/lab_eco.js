'use strict';
/* Econometrics labs: regression diagnostics, unit roots, cointegration, ARMA, GARCH / GJR, Granger causality. Maths in econometrics.js (checked against statsmodels and arch). */
const Eco = Risk.eco;
const ecoSl = (id, label, min, max, step, val, fmt) => ({ id, label, min, max, step, val, fmt });
const ecoBench = { id: 'bm', label: 'Second series', sel: () => assetOptsPf(), val: 'eth' };
const ecoP = (p) => (p < 0.0001 ? '<0.0001' : p.toFixed(4));
const ecoStar = (p) => (p < 0.01 ? '***' : p < 0.05 ? '**' : p < 0.1 ? '*' : '');
const ecoLogP = (r) => { let s = 0; return r.map((x) => (s += Math.log(1 + x))); };
async function ecoAlign(a, ids) {                                    // returns of the asset and of each id on their common dates
  const list = [a]; for (const id of ids) list.push(await resolveAsset(id));
  const p = Data.portfolioReturns(list, list.map(() => 0)); return { cols: p.parts.map((q) => q.r), names: p.parts.map((q) => q.name), dates: p.dates };
}
const ecoBars = (id, vals, band, h = 200) => {
  const ks = vals.map((_, i) => i + 1);
  Lab.plot($(id), { series: [{ x: ks, y: vals, c: 'a', bar: true }], hlines: [{ y: band, c: 'r' }, { y: -band, c: 'r' }, { y: 0 }], xfmt: (x) => Math.round(x), yfmt: (y) => y.toFixed(2), h });
};
const ecoVerdict = (ok, good, bad) => `<li class="${ok ? 'pass' : 'fail'}">${ok ? good : bad}</li>`;

Lab.reg('ols', {
  kicker: 'Econometrics', title: 'Regression and its diagnostics',
  lead: 'A regression is only as good as its residuals. Fit the asset on one or two other series, then read what the residuals say about the standard errors: autocorrelation (Durbin-Watson), changing variance (Breusch-Pagan), fat tails (Jarque-Bera).',
  asset: true, controls: [ecoBench, { id: 'f2', label: 'Third regressor (optional)', sel: () => [['none', 'none'], ...assetOpts()], val: 'none' }, { id: 'se', label: 'Standard errors', opts: [['classic', 'Classical'], ['hc1', 'White (HC1)'], ['hac', 'Newey-West']], val: 'hac' }],
  note: 'R<sub>asset</sub> = α + β<sub>1</sub>·X<sub>1</sub> + β<sub>2</sub>·X<sub>2</sub> + ε on daily returns that share the same dates. Classical standard errors assume the residuals are independent with constant variance. <b>Durbin-Watson ≈ 2(1 − ρ)</b>: far from 2 means serial correlation. <b>Breusch-Pagan</b> regresses ε² on the regressors (Koenker form, n·R² ~ χ²). When either test rejects, the classical t-statistics are too optimistic: use <b>White</b> (heteroskedasticity) or <b>Newey-West</b> (both, Bartlett weights, lag ⌊4(n/100)<sup>2/9</sup>⌋). The numbers are identical to statsmodels (<code>tools/verify_eco.py</code>).',
  async draw(v, out, ctx) {
    const ids = [v.bm, ...(v.f2 !== 'none' ? [v.f2] : [])].filter((x, i, a) => x !== ctx.asset.id && a.indexOf(x) === i), al = await ecoAlign(ctx.asset, ids);
    if (al.cols.length < 2) throw new Error('Pick a second series different from the asset.');
    const y = al.cols[0], X = al.cols.slice(1), fit = Eco.ols(y, X, { robust: v.se, allSe: true }), bp = Eco.breuschPagan(fit, X), jb = Risk.jarqueBera(fit.e), ci = (i) => `${(fit.beta[i] - 1.96 * fit.se[i]).toFixed(3)} … ${(fit.beta[i] + 1.96 * fit.se[i]).toFixed(3)}`;
    const names = ['Intercept (daily)', ...al.names.slice(1).map((n) => esc(n.length > 28 ? n.slice(0, 26) + '…' : n))], fitted = y.map((x, i) => x - fit.e[i]);
    const rows = fit.beta.map((b, i) => [names[i], b.toFixed(4), fit.se[i].toFixed(4), fit.t[i].toFixed(2), ecoP(fit.p[i]) + ' ' + ecoStar(fit.p[i]), ci(i)]);
    out.innerHTML = `<div class="kpis">${kpi('R² / adjusted', fit.r2.toFixed(3) + ' / ' + fit.adjR2.toFixed(3), `${fit.n} days, ${fit.k} parameters`)}${kpi('F-test', fit.F.toFixed(1), 'p ' + ecoP(fit.pF))}${kpi('Durbin-Watson', fit.dw.toFixed(2), fit.dw < 1.7 ? 'positive autocorrelation' : fit.dw > 2.3 ? 'negative autocorrelation' : 'about 2: no autocorrelation')}${kpi('Breusch-Pagan', 'p ' + ecoP(bp.p), bp.p < 0.05 ? 'variance not constant' : 'constant variance not rejected')}${kpi('Jarque-Bera (residuals)', 'p ' + ecoP(jb.p), jb.p < 0.05 ? 'fat tails / skew' : 'normal not rejected')}</div>
      ${Lab.table(['Variable', 'Coefficient', 'Std. error', 't', 'p-value', '95% interval'], rows)}
      <div class="card note"><ul>${ecoVerdict(fit.dw > 1.7 && fit.dw < 2.3, 'Residuals show no serial correlation (Durbin-Watson near 2).', 'Residuals are serially correlated: classical standard errors are too small. Use Newey-West.')}${ecoVerdict(bp.p >= 0.05, 'Breusch-Pagan does not reject constant variance.', 'The residual variance depends on the regressors: use White or Newey-West standard errors.')}${ecoVerdict(jb.p >= 0.05, 'Residuals look Gaussian.', 'Residuals have fat tails: the t and F p-values are approximations; the coefficients themselves are still unbiased.')}</ul><p class="mut">Standard errors shown: <b>${{ classic: 'classical', hc1: 'White HC1', hac: 'Newey-West, ' + fit.nwLags + ' lags' }[v.se]}</b>. Classical vs robust for the first slope: ${fit.seClassic[1].toFixed(4)} vs ${fit.seHAC[1].toFixed(4)} (Newey-West).</p></div>
      <div class="duo">${Lab.card('c1', 'Residuals over time', null)}${Lab.card('c2', 'Residuals against fitted values', null)}</div>`;
    const idx = fit.e.map((_, i) => i), step = Math.max(1, Math.floor(fit.n / 600)), sx = [], sy = []; for (let i = 0; i < fit.n; i += step) { sx.push(fitted[i]); sy.push(fit.e[i]); }
    later(() => { Lab.plot($('#c1'), { series: [{ x: idx, y: fit.e, c: 'a', w: 1 }], hlines: [{ y: 0 }], xfmt: dateAxis(al.dates), yfmt: (z) => pct(z, 1), h: 230 }); Lab.plot($('#c2'), { series: [{ x: sx, y: sy, c: 'a', dots: true, r: 1.8, alpha: 0.5 }], hlines: [{ y: 0 }], xfmt: (z) => pct(z, 1), yfmt: (z) => pct(z, 1), h: 230 }); });
  },
});

Lab.reg('unitroot', {
  kicker: 'Econometrics', title: 'Unit roots and spurious regression',
  lead: 'Prices are close to random walks: they have a unit root and no stable mean. Returns do not. Regressing one price on another unrelated one gives a high R² and a "significant" slope almost every time. The Dickey-Fuller test is how you tell the two cases apart.',
  asset: true, controls: [{ id: 'tr', label: 'Deterministic part', opts: [['c', 'Constant'], ['ct', 'Constant + trend']], val: 'c' }, { id: 'lg', label: 'Lag length', opts: [['aic', 'Chosen by AIC'], [0, '0'], [2, '2'], [5, '5']], val: 'aic' }, ecoSl('nw', 'Length of the simulated walks', 100, 1000, 50, 250, String)],
  note: '<b>ADF regression</b>: Δy<sub>t</sub> = a (+ b·t) + γ·y<sub>t−1</sub> + Σ φ<sub>i</sub>Δy<sub>t−i</sub> + ε<sub>t</sub>. H0: γ = 0 (unit root). The statistic is the usual t-ratio of γ, but it does <b>not</b> follow a Student law under H0: it follows the Dickey-Fuller law, with asymptotic 5% critical values −2.86 (constant), −3.41 (constant + trend). Failing to reject does not prove a unit root; the test has low power against a slowly mean-reverting series. <b>Spurious regression</b> (Granger-Newbold 1974): two independent random walks regressed on each other give |t| &gt; 1.96 far more often than 5% of the time, because the residual is itself a unit-root process and the classical standard errors are meaningless. Differencing (using returns) removes the problem.',
  draw(v, out, ctx) {
    const lp = ecoLogP(ctx.r), lag = v.lg === 'aic' ? 'aic' : Number(v.lg), A = Eco.adf(lp, { trend: v.tr, lags: lag, maxLag: 12 }), B = Eco.adf(ctx.r, { trend: v.tr, lags: lag, maxLag: 12 });
    const R = Risk.rng(5), N = v.nw, reps = 400, tl = [], td = [], r2 = []; let rej = 0, rejD = 0;
    for (let k = 0; k < reps; k++) {
      let a = 0, b = 0; const x = [], y = []; for (let i = 0; i < N; i++) { a += R.n(); b += R.n(); x.push(a); y.push(b); }
      const f = Eco.ols(y, [x]), dx = x.slice(1).map((q, i) => q - x[i]), dy = y.slice(1).map((q, i) => q - y[i]), g = Eco.ols(dy, [dx]);
      tl.push(f.t[1]); td.push(g.t[1]); r2.push(f.r2); if (Math.abs(f.t[1]) > 1.96) rej++; if (Math.abs(g.t[1]) > 1.96) rejD++;
    }
    const cvs = A.cv.map((c, i) => `${['1%', '5%', '10%'][i]}: ${c.toFixed(2)}`).join(' · '), h1 = histo(tl.map((t) => Math.max(-25, Math.min(25, t))), 40), h2 = histo(td.map((t) => Math.max(-25, Math.min(25, t))), 40);
    out.innerHTML = `<div class="kpis">${kpi('Log price: ADF statistic', A.stat.toFixed(2), A.reject5 ? 'unit root rejected at 5%' : 'cannot reject a unit root', 'adf')}${kpi('Daily returns: ADF statistic', B.stat.toFixed(2), B.reject5 ? 'unit root rejected at 5%: stationary' : 'cannot reject a unit root')}${kpi('Critical values', A.cv[1].toFixed(2), cvs)}${kpi('Persistence ρ = 1 + γ', A.rho.toFixed(4), `price, ${A.p} lag${A.p === 1 ? '' : 's'} used`)}</div>
      <div class="kpis">${kpi('Independent walks: |t| > 1.96', pct(rej / reps, 0), `expected 5% if the test were valid; ${reps} pairs of ${N} days`, 'spurious')}${kpi('Same pairs, in differences', pct(rejD / reps, 0), 'back to about 5%')}${kpi('Average R² in levels', r2.reduce((a, b) => a + b, 0) / reps > 0 ? (r2.reduce((a, b) => a + b, 0) / reps).toFixed(2) : '–', 'between series that have nothing to do with each other')}</div>
      <div class="duo">${Lab.card('c1', 'Log price (non-stationary)', null)}${Lab.card('c2', 'Daily return (stationary)', null)}</div>
      <div class="duo">${Lab.card('c3', 'Slope t-statistic, regression in levels', null)}${Lab.card('c4', 'Slope t-statistic, regression in differences', null)}</div>
      ${A.table ? Lab.table(['Lags', 'AIC'], A.table.map((q) => [q.p + (q.p === A.p ? ' ◀' : ''), q.aic.toFixed(1)])) : ''}`;
    const idx = lp.map((_, i) => i);
    later(() => {
      Lab.plot($('#c1'), { series: [{ x: idx, y: lp, c: 'a', w: 1.5 }], xfmt: dateAxis(ctx.dates), yfmt: (z) => z.toFixed(2), h: 210 });
      Lab.plot($('#c2'), { series: [{ x: idx, y: ctx.r, c: 'b', w: 1 }], hlines: [{ y: 0 }], xfmt: dateAxis(ctx.dates), yfmt: (z) => pct(z, 0), h: 210 });
      Lab.plot($('#c3'), { series: [{ x: h1.x, y: h1.y, c: 'r', bar: true, alpha: 0.8 }], vlines: [{ x: -1.96 }, { x: 1.96 }], xfmt: (z) => z.toFixed(0), yfmt: (z) => z.toFixed(0), h: 210 });
      Lab.plot($('#c4'), { series: [{ x: h2.x, y: h2.y, c: 'g', bar: true, alpha: 0.8 }], vlines: [{ x: -1.96 }, { x: 1.96 }], xfmt: (z) => z.toFixed(0), yfmt: (z) => z.toFixed(0), h: 210 });
    });
  },
});



Lab.reg('garchfit', {
  kicker: 'Econometrics', title: 'GARCH and GJR by maximum likelihood',
  lead: 'Volatility is predictable even when returns are not. GARCH(1,1) models today’s variance as a constant, yesterday’s squared shock and yesterday’s variance; GJR adds the leverage effect: bad news raises volatility more than good news.',
  asset: true, controls: [ecoSl('win', 'Estimation window (days)', 500, 3500, 250, 2000, String), { id: 'md', label: 'Model', opts: [['g', 'GARCH(1,1)'], ['j', 'GJR-GARCH(1,1)']], val: 'j' }, ecoSl('h', 'Forecast horizon (days)', 10, 250, 10, 120, String)],
  note: '<b>σ²<sub>t</sub> = ω + (α + γ·1<sub>ε&lt;0</sub>)·ε²<sub>t−1</sub> + β·σ²<sub>t−1</sub></b>, Gaussian log-likelihood maximised with the mean μ (Nelder-Mead, three starts, variance backcast as in the <code>arch</code> package; the fit matches <code>arch</code> to 3-4 decimals). <b>Persistence</b> α + γ/2 + β: close to 1 means shocks fade slowly; <b>half-life</b> = ln ½ / ln(persistence). <b>Long-run variance</b> ω / (1 − persistence). The forecast variance returns to it geometrically. The <b>news-impact curve</b> plots next-day variance against the shock ε: asymmetric when γ &gt; 0. If the model is right, the standardised residuals ε/σ have no autocorrelation in their squares (Ljung-Box).',
  async draw(v, out, ctx) {
    const r = ctx.r.slice(-v.win).map((x) => x * 100), key = ctx.asset.id + '|' + v.win + '|' + v.md, cache = (Lab._garch ||= {});
    const f = (cache[key] ||= Eco.garchMle(r, { gjr: v.md === 'j' })), a = PPY ** 0.5, lb = (() => { const z2 = f.z.map((q) => q * q), ac = Eco.acf(z2, 10); let q = 0; for (let k = 1; k <= 10; k++) q += ac[k - 1] ** 2 / (z2.length - k); q *= z2.length * (z2.length + 2); return { q, p: Eco.chi2Sf(q, 10) }; })();
    const jb = Risk.jarqueBera(f.z), sd = f.s2.slice(0, -1).map((q) => Math.sqrt(q) * a), n0 = sd.length, tail = Math.min(750, n0), fc = f.forecast(v.h).map((q) => Math.sqrt(q) * a);
    const eps = Array.from({ length: 81 }, (_, i) => -8 + i * 0.2), nic = eps.map((e) => Math.sqrt(f.nic(e)) * a), z99 = 2.3263;
    out.innerHTML = `<div class="kpis">${kpi('Persistence', f.persistence.toFixed(4), `α ${f.a.toFixed(3)}${v.md === 'j' ? ' + γ/2 ' + (f.g / 2).toFixed(3) : ''} + β ${f.b.toFixed(3)}`, 'persist')}${kpi('Half-life of a shock', Number.isFinite(f.halfLife) ? f.halfLife.toFixed(0) + ' days' : '∞', 'time to lose half the excess variance')}${kpi('Long-run volatility', pct(Math.sqrt(f.longRunVar) * a / 100, 1), 'annualised, √(ω/(1−persistence))')}${kpi('Volatility tomorrow', pct(Math.sqrt(f.next) * a / 100, 1), `1-day 99% VaR ${(z99 * Math.sqrt(f.next)).toFixed(2)}%`)}</div>
      <div class="kpis">${kpi('Leverage γ', v.md === 'j' ? f.g.toFixed(3) : '–', v.md === 'j' ? (f.g > 0.02 ? 'bad news counts more' : 'little asymmetry') : 'GARCH has none')}${kpi('Log-likelihood / AIC', f.ll.toFixed(0) + ' / ' + f.aic.toFixed(0), `BIC ${f.bic.toFixed(0)}`)}${kpi('Ljung-Box on z², 10 lags', 'p ' + ecoP(lb.p), lb.p > 0.05 ? 'clustering fully captured' : 'some clustering left')}${kpi('Jarque-Bera on z', 'p ' + ecoP(jb.p), jb.p < 0.05 ? 'z still fat-tailed: consider Student-t' : 'z looks normal')}</div>
      <div class="duo">${Lab.card('c1', `Conditional volatility, last ${tail} days (annualised)`, [['m', '|return|'], ['a', 'GARCH σ']])}${Lab.card('c2', 'News-impact curve: next-day volatility vs shock (%)', null)}</div>
      ${Lab.card('c3', `Volatility forecast, ${v.h} days (annualised)`, null)}`;
    later(() => {
      const ix = Array.from({ length: tail }, (_, i) => i), ab = r.slice(-tail).map((q) => Math.abs(q - f.mu) * a);
      Lab.plot($('#c1'), { series: [{ x: ix, y: ab, c: 'm', w: 1, alpha: 0.6 }, { x: ix, y: sd.slice(-tail), c: 'a', w: 2 }], xfmt: dateAxis(ctx.dates ? ctx.dates.slice(-tail) : null), yfmt: (q) => q.toFixed(0) + '%', h: 230 });
      Lab.plot($('#c2'), { series: [{ x: eps, y: nic, c: 'a', w: 2.4 }], vlines: [{ x: 0 }], xfmt: (q) => q.toFixed(0), yfmt: (q) => q.toFixed(0) + '%', h: 230 });
      Lab.plot($('#c3'), { series: [{ x: fc.map((_, i) => i + 1), y: fc, c: 'a', w: 2.4 }], hlines: [{ y: Math.sqrt(f.longRunVar) * a, c: 'y', t: 'long run' }], xfmt: (q) => Math.round(q), yfmt: (q) => q.toFixed(0) + '%', h: 220 });
    });
  },
});

