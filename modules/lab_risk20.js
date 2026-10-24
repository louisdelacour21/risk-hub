'use strict';
/* Risk, twentieth set: model tiering and findings rating in the spirit of SR 11-7. Maths in riskx19.js (tested). */
Lab.reg('sr117', {
  kicker: 'Model risk', title: 'Validation sheet (SR 11-7): tier, findings and review frequency',
  lead: 'A model inventory ranks models by how much damage they can do, then spends validation time accordingly. Score a model on four dimensions, add the findings of the review, and read the tier, the overall rating and when it must be validated again.',
  controls: [['materiality', 'Materiality (exposure or capital it drives)', 4], ['complexity', 'Complexity of the method', 3], ['uncertainty', 'Uncertainty (data and assumptions)', 3], ['reliance', 'Reliance (decisions that depend on it)', 4]].map(([id, label, val]) => ({ id, label, min: 1, max: 5, step: 1, val, fmt: String })).concat([['high', 'High findings', 0, 6], ['medium', 'Medium findings', 2, 10], ['low', 'Low findings', 3, 15]].map(([id, label, val, max]) => ({ id, label, min: 0, max, step: 1, val, fmt: String }))),
  note: 'Tier = weighted score of the four dimensions (materiality 40%, the other three 20% each), each from 1 to 5: tier 1 from 3.6, tier 2 from 2.6, tier 3 below. A tier sets the months between full validations (12, 24, 36). Findings are weighted high 5, medium 2, low 0.5; the overall rating is <b>unsatisfactory</b> with two high findings or 12 points, <b>needs improvement</b> with one high finding or 4 points, satisfactory otherwise. An unsatisfactory model gets the next review date halved. The weights and cut-offs are an illustrative house choice: SR 11-7 states the principles (effective challenge, validation of conceptual soundness, ongoing monitoring, outcome analysis) and no formula, so each bank sets its own.',
  draw(v, out) {
    const X = Risk.x, t = X.modelTier(v), f = X.findingsRating(v), months = f.rating === 'unsatisfactory' ? t.months / 2 : t.months;
    const sweep = [1, 2, 3, 4, 5].map((m) => X.modelTier({ ...v, materiality: m }).score);
    out.innerHTML = `<div class="kpis">${kpi('Tier', 'Tier ' + t.tier, 'score ' + t.score.toFixed(2) + ' out of 5', t.tier === 1 ? 'bad' : '')}${kpi('Findings rating', f.rating, f.pts.toFixed(1) + ' points', f.rating === 'satisfactory' ? 'ok' : 'bad')}${kpi('Next validation', months + ' months', f.rating === 'unsatisfactory' ? 'halved by the rating' : 'set by the tier')}</div>
      ${Lab.table(['Dimension', 'Score', 'Weight', 'Contribution'], Object.entries(X.MODEL_W).map(([k, w]) => [k, v[k], pct(w, 0), (w * v[k]).toFixed(2)]))}
      ${Lab.card('c1', 'Weighted score against the materiality score, other dimensions fixed', [['a', 'score'], ['m', 'tier 1 cut-off']])}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: [1, 2, 3, 4, 5], y: sweep, c: 'a', w: 2, dots: true }], hlines: [{ y: 3.6, c: 'm' }, { y: 2.6 }], xfmt: String, yfmt: (y) => y.toFixed(1), h: 190 }));
  },
});
