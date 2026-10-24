'use strict';
/* AI / model risk on real data: fairness of a credit model fitted on the German Credit file (Hofmann 1994, UCI, CC BY 4.0). Maths in riskx5.js and ml.js. */
let gcCache = null;
const gcLoad = async () => gcCache || (gcCache = (await (await fetch('data/german_credit.csv')).text()).trim().split('\n').slice(1).map((l) => l.split(',').map(Number)));
const gcFeat = ['checking_negative', 'checking_none', 'duration', 'log_amount', 'savings_low', 'employment_short', 'installment_rate', 'age', 'existing_credits'];

Lab.reg('fairreal', {
  kicker: 'AI model risk', title: 'Fairness on real credit data (German Credit, 1 000 loans)',
  lead: 'The same four fairness metrics as the simulated screen, now on a real public file: 1 000 loans, 700 repaid. Fit a scoring model, pick the sensitive attribute, and see whether leaving it out of the model removes the gap.',
  controls: [{ id: 'grp', label: 'Sensitive attribute (group compared)', opts: [['female', 'Women (vs men)'], ['young', 'Under 25 (vs 25 and over)'], ['foreign', 'Foreign worker (vs not)']], val: 'female' }, { id: 'use', label: 'Attribute in the model', opts: [['no', 'Left out'], ['yes', 'Included']], val: 'no' }, { id: 't', label: 'Approve if P(repay) at least', min: 0.4, max: 0.95, step: 0.01, val: 0.7, fmt: (x) => (x * 100).toFixed(0) + '%' }, { id: 'rule', label: 'Rule for the group', opts: [['same', 'Same threshold'], ['sel', 'Equal approval rate']], val: 'same' }],
  note: 'Data: Statlog German Credit (Hofmann, 1994), UCI Machine Learning Repository, licence CC BY 4.0; 1 000 loans, 700 repaid. Model: logistic regression on nine numeric inputs (negative or no checking account, duration, log amount, low savings, short employment, instalment rate, age, number of credits), standardised, light ridge penalty, <b>fitted and evaluated on the same 1 000 rows</b> (no hold-out, so accuracy is optimistic). "Positive" means repaid. The group is the one named in the selector (women 310, under 25 149, foreign workers 963 of 1 000: the last has only 37 in the comparison group, so its gaps are noisy). The sex variable is derived from the personal-status code, which is how the file records it. Group thresholds restore parity of approval at a cost shown in the accuracy line. This is an illustration of the mechanics on an old, small German sample, not a statement about any lender today.',
  async draw(v, out) {
    const X = Risk.x, D = await gcLoad(), col = (c) => D.map((r) => r[c]), H = ['good', ...gcFeat, 'female', 'young', 'foreign'], gi = H.indexOf(v.grp);
    const cols = gcFeat.map((f) => H.indexOf(f)).concat(v.use === 'yes' ? [gi] : []), Xm = D.map((r) => cols.map((c) => r[c])), st = Risk.ml.colStats(Xm), Z = Risk.ml.apply(Xm, st), M = Risk.ml.logistic(Z, col(0), 1);
    const p = Z.map((z) => M.p(z)), logit = p.map((q) => Math.log(q / (1 - q))), P = { y: col(0), g: col(gi), s: logit }, t = Math.log(v.t / (1 - v.t));
    const a = X.groupStats(P, [t, t])[0], tB = v.rule === 'same' ? t : X.thresholdFor(P, 1, a.sel, 'sel'), F = X.fairness(P, [t, tB]);
    const gp = (k) => Risk.mean(p.filter((_, i) => P.g[i] === k)), g = (x) => `<b${Math.abs(x) < 0.02 ? '' : ' class="fail"'}>${(x * 100).toFixed(1)} pts</b>`;
    const row = (nm, s) => [nm, s.n, pct(s.base, 0), pct(s.sel, 1), pct(s.ppv, 1), pct(s.tpr, 1), pct(s.fpr, 1), pct(s.acc, 1)];
    const ts = Array.from({ length: 56 }, (_, i) => 0.4 + i * 0.01), G = ts.map((q) => { const l = Math.log(q / (1 - q)); return X.fairness(P, [l, l]); });
    out.innerHTML = `<div class="kpis">${kpi('Accuracy', pct(F.acc, 1), `always answering with the majority class: ${pct(F.naive, 1)}`)}${kpi('Approval rate, group / others', F.ratio.toFixed(2), F.ratio < 0.8 ? 'fails the 80% rule' : 'passes the 80% rule', F.ratio < 0.8 ? 'var' : '')}${kpi('Approval gap', (F.dp * 100).toFixed(1) + ' pts', 'demographic parity')}${kpi('True positive gap', (F.tpr * 100).toFixed(1) + ' pts', 'equal opportunity')}${kpi('Average predicted repayment', pct(gp(1), 1) + ' vs ' + pct(gp(0), 1), v.use === 'yes' ? 'attribute included' : 'attribute left out: the gap comes from the other inputs')}</div>
      ${Lab.table(['Group', 'Loans', 'Share repaid', 'Approved', 'Precision (PPV)', 'True positive rate', 'False positive rate', 'Accuracy'], [row('Others (threshold ' + v.t.toFixed(2) + ')', F.a), row('Group (threshold ' + (1 / (1 + Math.exp(-tB))).toFixed(2) + ')', F.b)])}
      <p class="muted">Gaps (group − others): approval ${g(F.dp)}, true positive ${g(F.tpr)}, false positive ${g(F.fpr)}, precision ${g(F.ppv)}.</p>
      ${Lab.card('c1', 'Gaps against the approval threshold (no threshold brings all to zero)', [['a', 'approval'], ['y', 'true positive'], ['r', 'precision']])}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: ts, y: G.map((f) => f.dp), c: 'a', w: 2 }, { x: ts, y: G.map((f) => f.tpr), c: 'y', w: 2 }, { x: ts, y: G.map((f) => f.ppv), c: 'r', w: 2 }], hlines: [{ y: 0 }], vlines: [{ x: v.t, c: 'm' }], xfmt: (x) => (x * 100).toFixed(0) + '%', yfmt: (y) => (y * 100).toFixed(0) + ' pts', h: 220 }));
  },
});
