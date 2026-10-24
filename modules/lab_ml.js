'use strict';
/* Machine-learning labs: penalised regression and overfitting, a PD scorecard, linear vs boosted models, market regimes (HMM), quantile-regression VaR. Maths in ml.js (checked against scikit-learn / statsmodels). */
const ML = Risk.ml;
const mlSl = (id, label, min, max, step, val, fmt) => ({ id, label, min, max, step, val, fmt });
const mlQ = (a, p) => { const s = a.slice().sort((x, y) => x - y), i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo); };
const mlP = (p) => (p < 0.0001 ? '<0.0001' : p.toFixed(4));

/* Features known at the close of day t, to predict day t+1. */
function mlFeatures(r) {
  const names = [...Array.from({ length: 8 }, (_, i) => `r(t−${i})`), ...Array.from({ length: 4 }, (_, i) => `|r|(t−${i})`), 'mean 5d', 'mean 21d', 'mean 63d', 'vol 5d', 'vol 21d', 'vol 63d'];
  const win = (t, w) => r.slice(t - w + 1, t + 1), X = [], y1 = [], y2 = [];
  for (let t = 63; t < r.length - 1; t++) {
    X.push([...Array.from({ length: 8 }, (_, i) => r[t - i]), ...Array.from({ length: 4 }, (_, i) => Math.abs(r[t - i])), Risk.mean(win(t, 5)), Risk.mean(win(t, 21)), Risk.mean(win(t, 63)), Risk.std(win(t, 5)), Risk.std(win(t, 21)), Risk.std(win(t, 63))]);
    y1.push(r[t + 1]); y2.push(Math.abs(r[t + 1]));
  }
  return { X, y1, y2, names };
}
/* A synthetic loan book with a known default model, so the fitted model can be judged against the truth. */
function mlLoans(n, base, inter, seed = 7) {
  const R = Risk.rng(seed), rows = [], y = [];
  for (let i = 0; i < n; i++) {
    const inc = Math.exp(3.4 + 0.5 * R.n()), age = 22 + 45 * R.u(), lev = Math.min(1.5, Math.max(0, 0.35 + 0.2 * R.n() - 0.002 * (inc - 30))), util = Math.min(1, Math.max(0, 0.45 + 0.28 * R.n())), miss = Math.min(5, Math.floor(-Math.log(1 - R.u()) * (0.3 + util))), ten = Math.min(30, -Math.log(1 - R.u()) * 6);
    const z = base + 0.9 * (lev - 0.35) / 0.2 * 0.5 + 0.55 * miss + 0.5 * (util - 0.45) / 0.28 * 0.5 - 0.45 * (Math.log(inc) - 3.4) / 0.5 * 0.5 - 0.02 * (age - 40) - 0.03 * ten + inter * ((lev - 0.35) / 0.2) * ((util - 0.45) / 0.28);
    rows.push([Math.log(inc), age, lev, util, miss, ten]); y.push(R.u() < ML.sigmoid(z) ? 1 : 0);
  }
  return { X: rows, y, names: ['log income', 'age', 'leverage', 'utilisation', 'missed payments', 'tenure (years)'] };
}
const mlRoc = (id, curves, h = 250) => Lab.plot($(id), { series: [{ x: [0, 1], y: [0, 1], c: 'm', dash: true, w: 1 }, ...curves], xfmt: (v) => v.toFixed(1), yfmt: (v) => v.toFixed(1), h });


Lab.reg('scorecard', {
  kicker: 'Machine learning', title: 'Credit scorecard: logistic PD model',
  lead: 'The workhorse of retail credit: a logistic regression turns borrower attributes into a probability of default, which is rescaled into points. The tests that matter are discrimination (AUC, Gini, KS) and calibration (do predicted rates match observed ones?).',
  controls: [mlSl('n', 'Borrowers', 500, 30000, 500, 8000, String), mlSl('base', 'Base default rate (logit intercept)', -4.5, -1.5, 0.1, -3, (x) => pct(ML.sigmoid(x), 1) + ' typical'), mlSl('lam', 'L2 penalty λ', 0, 200, 5, 5, String)],
  note: '<b>P(default) = 1 / (1 + e<sup>−(β₀ + β·x)</sup>)</b>, fitted by Newton-Raphson on 70% of a synthetic loan book whose true default model is known (so a bad fit can be blamed on the model, not the data). <b>AUC</b> = probability a random defaulter scores worse than a random non-defaulter; <b>Gini = 2·AUC − 1</b>; <b>KS</b> = largest gap between the cumulative score distributions of defaulters and non-defaulters. Calibration compares the average predicted PD with the observed default rate in ten equal-sized score bands. <b>Points</b> follow the industry convention: score = 600 + 20/ln 2 · ln(odds good:bad / 50): every 20 points doubles the odds. The coefficients match scikit-learn (<code>LogisticRegression</code>, C = 1/λ). Simplification: independent borrowers, no macro cycle, no reject inference.',
  draw(v, out) {
    const D = mlLoans(v.n, v.base, 0), n = D.y.length, cut = Math.floor(n * 0.7), st = ML.colStats(D.X.slice(0, cut)), Z = ML.apply(D.X, st), m = ML.logistic(Z.slice(0, cut), D.y.slice(0, cut), v.lam);
    const pTr = Z.slice(0, cut).map((z) => m.p(z)), pTe = Z.slice(cut).map((z) => m.p(z)), yTe = D.y.slice(cut), yTr = D.y.slice(0, cut), rTe = ML.roc(pTe, yTe), rTr = ML.roc(pTr, yTr), cal = ML.calibration(pTe, yTe, 10);
    const f = 20 / Math.LN2, off = 600 - f * Math.log(50), pts = (p) => Math.round(off + f * Math.log((1 - p) / p));
    const bands = [[0, 520], [520, 560], [560, 600], [600, 640], [640, 680], [680, 2000]].map(([lo, hi]) => { const ix = pTe.map((p, i) => i).filter((i) => pts(pTe[i]) >= lo && pts(pTe[i]) < hi); return [lo === 0 ? '< 520' : hi === 2000 ? '≥ 680' : `${lo} – ${hi - 1}`, ix.length, pct(ix.length / pTe.length, 0), ix.length ? pct(ix.reduce((s, i) => s + yTe[i], 0) / ix.length, 1) : '–']; });
    const coef = D.names.map((nm, j) => [nm, m.w[j].toFixed(3), Math.exp(m.w[j]).toFixed(2) + '×']);
    out.innerHTML = `<div class="kpis">${kpi('AUC (test)', rTe.auc.toFixed(3), `train ${rTr.auc.toFixed(3)}: ${rTr.auc - rTe.auc > 0.03 ? 'a gap this wide is overfitting' : 'consistent'}`, 'auc')}${kpi('Gini (test)', rTe.gini.toFixed(3), '2·AUC − 1; retail scorecards typically 0.40 to 0.70')}${kpi('KS (test)', rTe.ks.toFixed(3), 'max gap between the two cumulative distributions')}${kpi('Default rate', pct(Risk.mean(D.y), 1), `${D.y.reduce((a, b) => a + b, 0)} defaults in ${n} loans; ${yTe.reduce((a, b) => a + b, 0)} in the test set`)}</div>
      <div class="duo">${Lab.card('c1', 'ROC curve (test set)', [['a', 'model'], ['m', 'random']])}${Lab.card('c2', 'Calibration: predicted vs observed default rate', [['a', 'ten score bands'], ['m', 'perfect']])}</div>
      <div class="duo">${Lab.table(['Variable', 'Coefficient (per 1 sd)', 'Odds multiplier'], coef)}${Lab.table(['Score band', 'Loans', 'Share', 'Observed default rate'], bands)}</div>`;
    later(() => {
      mlRoc('#c1', [{ x: rTe.fpr, y: rTe.tpr, c: 'a', w: 2.4 }]);
      const mx = Math.max(...cal.map((c) => Math.max(c.pred, c.obs))) * 1.05;
      Lab.plot($('#c2'), { series: [{ x: [0, mx], y: [0, mx], c: 'm', dash: true, w: 1 }, { x: cal.map((c) => c.pred), y: cal.map((c) => c.obs), c: 'a', w: 2, dots: true, r: 4 }], xfmt: (q) => pct(q, 0), yfmt: (q) => pct(q, 0), h: 250 });
    });
  },
});


Lab.reg('regimes', {
  kicker: 'Machine learning', title: 'Market regimes: hidden Markov model',
  lead: 'Markets switch between a calm regime and a stressed one. A hidden Markov model infers, day by day, the probability of being in each, without anyone labelling the data. The risk consequence is direct: VaR should depend on which regime you are in.',
  asset: true, controls: [mlSl('K', 'Number of regimes', 2, 3, 1, 2, String), mlSl('win', 'History used (days)', 1000, 4500, 500, 3000, String)],
  note: 'Returns are drawn from a Gaussian whose mean and volatility depend on a hidden state S<sub>t</sub> that follows a Markov chain with transition matrix A. The parameters are fitted by <b>Baum-Welch (EM)</b>, with scaled forward-backward recursions; the plotted probabilities are <b>smoothed</b> (use the whole sample, so they are for diagnosis, not for trading). The <b>next-day mixture VaR</b> weights each regime’s Normal by the filtered probability of being in it, propagated one step through A: it rises sharply when stress is likely, where a single-Normal VaR would not move. Expected duration = 1 / (1 − A<sub>ii</sub>). Simplifications: Gaussian emissions (stress regimes are fat-tailed within themselves), a constant transition matrix, no out-of-sample test of the regime call.',
  draw(v, out, ctx) {
    const r = ctx.r.slice(-v.win), h = ML.hmm(r, v.K, 300), n = r.length, K = v.K, last = h.prob[n - 1], next = h.A[0].map((_, j) => last.reduce((s, p, i) => s + p * h.A[i][j], 0)), a = PPY;
    const days = h.prob.map((p) => p.indexOf(Math.max(...p))), share = Array.from({ length: K }, (_, k) => days.filter((d) => d === k).length / n);
    const cdf = (x) => next.reduce((s, w, k) => s + w * Risk.normCdf((x - h.mu[k]) / h.sigma[k]), 0);
    let lo = -0.5, hi = 0.5; for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (cdf(mid) > 0.01) hi = mid; else lo = mid; }
    const uncond = Risk.normal(r, 0.99).var, mixVar = -lo, names = ['Calm', 'Stressed', 'Crisis'].slice(0, K).map((s, i) => (K === 2 ? ['Calm', 'Stressed'][i] : ['Calm', 'Turbulent', 'Crisis'][i]));
    const rows = names.map((s, k) => [s, pct(h.mu[k] * a, 1), pct(h.sigma[k] * Math.sqrt(a), 1), pct(h.stay[k], 1), h.duration[k].toFixed(0) + ' days', pct(share[k], 0), pct(-(h.mu[k] - 2.3263 * h.sigma[k]), 2)]);
    const cum = []; let s = 0; for (const q of r) cum.push((s += Math.log(1 + q))); const ix = r.map((_, i) => i), top = K - 1;
    out.innerHTML = `<div class="kpis">${kpi('Current regime', names[last.indexOf(Math.max(...last))], names.map((nm, k) => `${nm} ${pct(last[k], 0)}`).join(' · '))}${kpi('Mixture 99% VaR, tomorrow', pct(mixVar, 2), `single-Normal VaR ${pct(uncond, 2)}`, 'var')}${kpi('Stress share of days', pct(share[top], 0), `expected stay ${h.duration[top].toFixed(0)} days`)}${kpi('Log-likelihood / BIC', h.ll.toFixed(0) + ' / ' + h.bic.toFixed(0), K === 2 ? 'compare with 3 regimes' : 'compare with 2 regimes')}</div>
      <div class="duo">${Lab.card('c1', 'Cumulative log return, coloured by regime', names.map((nm, k) => [['g', 'y', 'r'][k], nm]))}${Lab.card('c2', `Probability of the ${names[top].toLowerCase()} regime`, null)}</div>
      ${Lab.table(['Regime', 'Mean (annual)', 'Volatility (annual)', 'Stays tomorrow', 'Expected duration', 'Share of days', '99% daily VaR'], rows)}`;
    later(() => {
      Lab.plot($('#c1'), { series: names.map((_, k) => { const sel = ix.filter((i) => days[i] === k); return { x: sel, y: sel.map((i) => cum[i]), c: ['g', 'y', 'r'][k], dots: true, r: 1.6 }; }), xfmt: dateAxis(ctx.dates ? ctx.dates.slice(-n) : null), yfmt: (q) => q.toFixed(1), h: 240 });
      Lab.plot($('#c2'), { series: [{ x: ix, y: h.prob.map((p) => p[top]), c: 'r', w: 1.2, fill: true }], xfmt: dateAxis(ctx.dates ? ctx.dates.slice(-n) : null), yfmt: (q) => pct(q, 0), ylim: [0, 1], h: 240 });
    });
  },
});

Lab.reg('qvar', {
  kicker: 'Machine learning', title: 'Quantile-regression VaR',
  lead: 'Instead of assuming a distribution and estimating its volatility, regress the quantile of tomorrow’s return directly on today’s risk indicators. The model learns how fast VaR should move when volatility moves.',
  asset: true, controls: [{ id: 'cf', label: 'Confidence', opts: [[0.95, '95%'], [0.99, '99%']], val: 0.99 }, mlSl('st', 'Refit every (days)', 60, 500, 20, 250, String)],
  note: 'Minimises the <b>check loss</b> ρ<sub>τ</sub>(e) = e·(τ − 1<sub>e&lt;0</sub>) (Koenker-Bassett) for τ = 1 − confidence, solved by iteratively reweighted least squares like statsmodels’ <code>QuantReg</code> (agreement to 1e-3 on the coefficients in <code>tools/verify_ml.py</code>). Regressors known at day t: EWMA volatility (λ = 0.94) and |r<sub>t</sub>|. <b>Walk-forward</b>: at each refit date only past data is used. It is compared with the usual Normal-EWMA VaR and with a 500-day historical VaR, using the Kupiec test on exceptions (expected rate = 1 − confidence). The quantile regression need not be Gaussian and needs no variance model, but with a 99% quantile only ~1% of the sample informs the fit, so it is noisy; ES is not directly estimated.',
  async draw(v, out, ctx) {
    const r = ctx.r, n = r.length, tau = 1 - v.cf, lam = 0.94, vol = []; let s2 = Risk.std(r.slice(0, 30)) ** 2;
    for (let t = 0; t < n; t++) { s2 = lam * s2 + (1 - lam) * r[t] * r[t]; vol.push(Math.sqrt(s2)); }
    const start = 750, qv = Array(n).fill(null), nv = Array(n).fill(null), hs = Array(n).fill(null), z = Risk.normInv(v.cf);
    let fitq = null;
    for (let t = start; t < n - 1; t++) {
      if ((t - start) % v.st === 0) fitq = ML.quantReg(r.slice(1, t + 1), [vol.slice(0, t), r.slice(0, t).map(Math.abs)], tau);
      qv[t + 1] = -fitq.predict([vol[t], Math.abs(r[t])]); nv[t + 1] = z * vol[t]; hs[t + 1] = -mlQ(r.slice(t - 499, t + 1), tau);
    }
    const stat = (arr) => { let N = 0, x = 0; for (let t = start + 1; t < n; t++) { if (arr[t] == null) continue; N++; if (-r[t] > arr[t]) x++; } const k = Risk.kupiec(N, x, tau); return { N, x, rate: x / N, p: k.p }; };
    const A = stat(qv), B = stat(nv), C = stat(hs), tail = 750, ix = Array.from({ length: tail }, (_, i) => n - tail + i), line = (a) => a.slice(-tail).map((q) => -q);
    const row = (nm, S) => [nm, pct(S.rate, 2), S.x + ' / ' + S.N, mlP(S.p), S.p < 0.05 ? 'rejected' : 'not rejected'];
    out.innerHTML = `<div class="kpis">${kpi('Quantile regression', pct(A.rate, 2), `expected ${pct(tau, 1)}; Kupiec p ${mlP(A.p)}`, 'kupiec')}${kpi('Normal EWMA', pct(B.rate, 2), `Kupiec p ${mlP(B.p)}`)}${kpi('Historical 500d', pct(C.rate, 2), `Kupiec p ${mlP(C.p)}`)}${kpi('Fitted coefficients (last)', 'β<sub>vol</sub> ' + fitq.beta[1].toFixed(2), `intercept ${fitq.beta[0].toFixed(4)}, β<sub>|r|</sub> ${fitq.beta[2].toFixed(2)}`)}</div>
      ${Lab.card('c1', `Return and ${pct(v.cf, 0)} VaR, last ${tail} days`, [['m', 'return'], ['a', 'quantile regression'], ['y', 'Normal EWMA'], ['r', 'historical']])}
      ${Lab.table(['Method', 'Exception rate', 'Exceptions', 'Kupiec p', 'Verdict'], [row('Quantile regression', A), row('Normal EWMA', B), row('Historical 500 days', C)])}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: ix.map((_, i) => i), y: r.slice(-tail), c: 'm', w: 1, alpha: 0.7 }, { x: ix.map((_, i) => i), y: line(qv), c: 'a', w: 2 }, { x: ix.map((_, i) => i), y: line(nv), c: 'y', w: 1.4 }, { x: ix.map((_, i) => i), y: line(hs), c: 'r', w: 1.4 }], hlines: [{ y: 0 }], xfmt: dateAxis(ctx.dates ? ctx.dates.slice(-tail) : null), yfmt: (q) => pct(q, 1), h: 260 }));
  },
});
