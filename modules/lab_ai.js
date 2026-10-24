'use strict';
/* AI / model risk: fairness of a decision model, the proxy effect, drift of an input distribution. Maths in riskx5.js (tested). */
const aiSl = (id, label, min, max, step, val, fmt) => ({ id, label, min, max, step, val, fmt });

Lab.reg('fair', {
  kicker: 'AI model risk', title: 'Fairness of a credit model: four metrics that cannot all hold',
  lead: 'A scoring model approves or declines. Compare two groups on the share approved, the precision of approvals and the error rates, move the threshold, and see why fixing one metric breaks another when the groups’ real default rates differ.',
  controls: [aiSl('b0', 'Group A: good-borrower rate', 10, 90, 5, 70, (x) => x + '%'), aiSl('b1', 'Group B: good-borrower rate', 10, 90, 5, 40, (x) => x + '%'), aiSl('sep', 'Model quality (score separation)', 0.5, 3, 0.1, 1.5, (x) => x.toFixed(1)), aiSl('bias', 'Score bias against group B', 0, 1, 0.1, 0, (x) => x.toFixed(1)), aiSl('t', 'Approval threshold (score)', -1, 3, 0.05, 0.75, (x) => x.toFixed(2)),
    { id: 'rule', label: 'Rule for group B', opts: [['same', 'Same threshold'], ['sel', 'Equal approval rate'], ['tpr', 'Equal true positive rate']], val: 'same' }],
  note: 'Synthetic population of 20 000 applicants, 40% in group B. "Positive" means a good borrower (no default); the score is <i>sep·outcome + noise</i>, with the <b>same</b> noise in both groups, so at a common threshold the model treats good borrowers alike (equal true positive and false positive rates) while approval rates and precision differ because base rates differ. Metrics: demographic parity (approval rates), 80% rule (ratio of rates ≥ 0.8), equal opportunity (true positive rates), equalized odds (true and false positive rates), predictive parity (precision of approvals). Chouldechova / Kleinberg: with different base rates and an imperfect model these cannot all be equal. Group thresholds restore one metric at the cost of another and of accuracy. Data are simulated: this shows the mechanics, not any real lender.',
  draw(v, out) {
    const X = Risk.x, P = X.population({ n: 20000, base0: v.b0 / 100, base1: v.b1 / 100, sep: v.sep, bias: v.bias, share: 0.4, seed: 5 });
    const a = X.groupStats(P, [v.t, v.t])[0], tB = v.rule === 'same' ? v.t : X.thresholdFor(P, 1, v.rule === 'sel' ? a.sel : a.tpr, v.rule), F = X.fairness(P, [v.t, tB]);
    const ts = Array.from({ length: 81 }, (_, i) => -1 + i * 0.05), G = ts.map((t) => X.fairness(P, [t, t]));
    const g = (x) => `<b${Math.abs(x) < 0.02 ? '' : ' class="fail"'}>${(x * 100).toFixed(1)} pts</b>`, row = (nm, s) => [nm, pct(s.base, 0), pct(s.sel, 1), pct(s.ppv, 1), pct(s.tpr, 1), pct(s.fpr, 1), pct(s.acc, 1)];
    out.innerHTML = `<div class="kpis">${kpi('Accuracy', pct(F.acc, 1), `always answering with the majority class: ${pct(F.naive, 1)}`)}${kpi('Approval rate B / A', F.ratio.toFixed(2), F.ratio < 0.8 ? 'fails the 80% rule' : 'passes the 80% rule', F.ratio < 0.8 ? 'var' : '')}${kpi('Approval gap (B − A)', (F.dp * 100).toFixed(1) + ' pts', 'demographic parity')}${kpi('True positive gap', (F.tpr * 100).toFixed(1) + ' pts', 'equal opportunity')}${kpi('Precision gap', (F.ppv * 100).toFixed(1) + ' pts', 'predictive parity')}</div>
      ${Lab.table(['Group', 'Share good', 'Approved', 'Precision (PPV)', 'True positive rate', 'False positive rate', 'Accuracy'], [row('A (threshold ' + v.t.toFixed(2) + ')', F.a), row('B (threshold ' + tB.toFixed(2) + ')', F.b)])}
      <p class="muted">Gaps between the groups: approval ${g(F.dp)}, true positive ${g(F.tpr)}, false positive ${g(F.fpr)}, precision ${g(F.ppv)}. The baseline accuracy is that of a model that approves everyone (the accuracy paradox: a useless model can score high when one class dominates).</p>
      ${Lab.card('c1', 'Gaps between the groups against the common threshold (no threshold brings all to zero)', [['a', 'approval'], ['y', 'true positive'], ['r', 'precision']])}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: ts, y: G.map((f) => f.dp), c: 'a', w: 2 }, { x: ts, y: G.map((f) => f.tpr), c: 'y', w: 2 }, { x: ts, y: G.map((f) => f.ppv), c: 'r', w: 2 }], hlines: [{ y: 0 }], vlines: [{ x: v.t, c: 'm' }], xfmt: (x) => x.toFixed(1), yfmt: (y) => (y * 100).toFixed(0) + ' pts', h: 220 }));
  },
});

Lab.reg('proxy', {
  kicker: 'AI model risk', title: 'Removing the sensitive variable does not remove its effect',
  lead: 'Delete the protected attribute from a model and the correlated variables take over its weight. We fit the same data with and without it and measure how much the proxy’s coefficient inflates and how much of the group gap survives.',
  controls: [aiSl('rho', 'Proxy–group correlation', 0, 0.95, 0.05, 0.6, (x) => x.toFixed(2)), aiSl('bx', 'True effect of the proxy', 0, 1, 0.05, 0.5, (x) => x.toFixed(2)), aiSl('bz', 'True effect of the group', 0, 1, 0.05, 0.4, (x) => x.toFixed(2)), aiSl('noise', 'Noise', 0.2, 2, 0.1, 1, (x) => x.toFixed(1))],
  note: 'Data: binary group <i>z</i>, proxy <i>x</i> with correlation ρ to z, outcome <i>y = b<sub>x</sub>x + b<sub>z</sub>z + noise</i>; 5 000 simulated rows, least squares. Omitted-variable formula: without z the proxy’s coefficient converges to <i>b<sub>x</sub> + b<sub>z</sub>·cov(x,z)/var(x)</i>, shown next to the estimate. "Group gap kept" is the average prediction gap between group 1 and group 0 of the model without z, divided by the gap in the observed outcome: removing the attribute leaves most of it in place whenever ρ is high, which is why fairness cannot be obtained by omission. Simulated data.',
  draw(v, out) {
    const X = Risk.x, q = X.proxy({ rho: v.rho, bx: v.bx, bz: v.bz, noise: v.noise, n: 5000, seed: 9 }), m = (a, k) => Risk.mean(a.filter((_, i) => q.z[i] === k));
    const bf = q.bxFull, bs = q.bxShort, gapObs = m(q.y, 1) - m(q.y, 0), gapShort = bs * (m(q.x, 1) - m(q.x, 0));
    out.innerHTML = `<div class="kpis">${kpi('Proxy coefficient with the group', bf.toFixed(3), `true value ${v.bx.toFixed(2)}`)}${kpi('Without the group', bs.toFixed(3), `formula ${q.theory.toFixed(3)}`)}${kpi('Inflation', bf > 0.01 ? '+' + ((bs / bf - 1) * 100).toFixed(0) + '%' : '—', 'weight moved onto the proxy')}${kpi('Group gap kept', gapObs > 0.01 ? pct(Math.min(1, gapShort / gapObs), 0) : '—', 'prediction gap without the group ÷ observed gap')}</div>
      ${Lab.card('c1', 'Coefficient of the proxy: true, full model, model without the group', [['a', 'coefficient']])}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: [0, 1, 2], y: [v.bx, bf, bs], c: 'a', bar: true }], hlines: [{ y: 0 }], xfmt: (i) => ['true', 'with group', 'without'][Math.round(i)] || '', yfmt: (y) => y.toFixed(2), h: 200 }));
  },
});

Lab.reg('drift', {
  kicker: 'AI model risk', title: 'Model drift: has the input distribution moved?',
  lead: 'A model is validated on one period and used in another. The population stability index and the Kolmogorov-Smirnov distance compare today’s data with the reference period, window after window, and raise the alert the practitioners use: 0.10 watch, 0.25 act.',
  asset: true,
  controls: [{ id: 'ser', label: 'Variable', opts: [['ret', 'Daily return'], ['vol', '30-day volatility']], val: 'ret' }, aiSl('ref', 'Reference period (days)', 250, 1000, 50, 500, String), aiSl('win', 'Window compared (days)', 60, 250, 10, 90, String)],
  note: 'Reference = the first N observations of the asset’s history (the "development sample"); each window of the chosen length is compared with it. <b>PSI</b> = Σ (current% − reference%)·ln(current%/reference%) over ten bins cut at the reference deciles (empty bins floored at 0.01%). <b>KS</b> = largest gap between the two cumulative distributions, with the asymptotic p-value. Rule of thumb: PSI &lt; 0.10 stable, 0.10–0.25 moderate shift, &gt; 0.25 significant shift. Overlapping windows are not independent, so the p-values are indicative; the volatility series is smoothed by construction and drifts more. Crypto trades 7 days a week.',
  draw(v, out, ctx) {
    const X = Risk.x, r = ctx.r, s = v.ser === 'ret' ? r : r.map((_, i) => (i < 29 ? NaN : Risk.std(r.slice(i - 29, i + 1)))).filter(Number.isFinite);
    if (s.length < v.ref + v.win + 30) throw new Error('Not enough history for this reference period and window.');
    const d = X.rollingDrift(s, v.ref, v.win, 10), last = d[d.length - 1], ks = X.ks2(s.slice(0, v.ref), s.slice(-v.win)), act = d.filter((x) => x.psi > 0.25).length, watch = d.filter((x) => x.psi > 0.1).length;
    out.innerHTML = `<div class="kpis">${kpi('PSI, latest window', last.psi.toFixed(3), last.psi > 0.25 ? 'act: significant shift' : last.psi > 0.1 ? 'watch: moderate shift' : 'stable', last.psi > 0.25 ? 'var' : '')}${kpi('KS distance', last.ks.toFixed(3), 'p = ' + fmtP(ks.p))}${kpi('Windows above 0.10', pct(watch / d.length, 0), `${d.length} windows`)}${kpi('Windows above 0.25', pct(act / d.length, 0), 'alert level')}</div>
      ${Lab.card('c1', 'PSI of each window against the reference period (dashed: 0.10 and 0.25)', [['a', 'PSI']])}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: d.map((x) => x.end), y: d.map((x) => x.psi), c: 'a', w: 1.8 }], hlines: [{ y: 0.1, c: 'y' }, { y: 0.25, c: 'r' }], xfmt: (x) => '−' + ((s.length - x) / 365).toFixed(1) + 'y', yfmt: (y) => y.toFixed(2), h: 220 }));
  },
});
