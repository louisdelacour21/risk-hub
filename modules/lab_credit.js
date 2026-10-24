'use strict';
/* Credit labs: expected loss and the Vasicek one-factor model behind Basel IRB. */
Lab.reg('pd', {
  kicker: 'Credit', title: 'PD, LGD and expected loss',
  lead: 'Credit risk starts with three numbers: the probability that the borrower defaults, the share of the exposure lost if it does, and the exposure at that moment. Their product is the expected loss that a loan price must cover.',
  controls: [{ id: 'pd', label: 'Annual PD', min: 0.0005, max: 0.3, step: 0.0005, val: 0.02, fmt: (x) => pct(x, 2) }, { id: 'lgd', label: 'LGD (loss given default)', min: 0.05, max: 1, step: 0.01, val: 0.45, fmt: (x) => pct(x, 0) }, { id: 'ead', label: 'Exposure EAD (thousands)', min: 100, max: 10000, step: 100, val: 1000, fmt: (x) => x.toLocaleString('en-US') }, { id: 'T', label: 'Horizon (years)', min: 1, max: 10, step: 1, val: 5, fmt: String }],
  note: 'EL = PD × LGD × EAD. With a constant annual hazard, survival after t years is (1 − PD)<sup>t</sup>, so cumulative default probability grows more slowly than linearly. A loan must earn at least PD × LGD per year as credit spread just to break even in expectation: the <b>spread ≈ PD × LGD</b> rule of thumb (before any risk premium). The table gives illustrative orders of magnitude for long-run annual default rates by rating, which vary strongly by source and period: use real agency studies for decisions. Expected loss is not the risk: the risk is the deviation from it (see the Vasicek module).',
  draw(v) {
    const el = v.pd * v.lgd * v.ead, ys = Array.from({ length: v.T + 1 }, (_, t) => t), cum = ys.map((t) => 1 - (1 - v.pd) ** t);
    const RT = [['AAA', 0.0002], ['AA', 0.0005], ['A', 0.001], ['BBB', 0.003], ['BB', 0.011], ['B', 0.045], ['CCC', 0.25]];
    later(() => Lab.plot($('#c1'), { series: [{ x: ys, y: cum, c: 'r', w: 2.4, fill: true }, { x: ys, y: ys.map((t) => Math.min(1, v.pd * t)), c: 'm', dash: [4, 4], w: 1.4 }], xfmt: (t) => t + 'y', yfmt: (y) => pct(y, 0), h: 250 }));
    return `<div class="kpis">${kpi('Expected loss (1y)', Math.round(el).toLocaleString('en-US'), 'thousands, PD × LGD × EAD')}${kpi('Fair spread', Math.round(v.pd * v.lgd * 1e4) + ' bp', 'PD × LGD')}${kpi(`Cumulative PD, ${v.T}y`, pct(cum[v.T], 1), `vs ${pct(Math.min(1, v.pd * v.T), 1)} if linear`)}${kpi('Loss if it defaults', Math.round(v.lgd * v.ead).toLocaleString('en-US'), 'thousands')}</div>
      ${Lab.card('c1', 'Cumulative probability of default', [['r', 'constant hazard'], ['m', 'PD × years']])}${Lab.table(['Rating', 'Illustrative annual PD', 'Expected loss at your LGD and EAD (k)', 'Break-even spread'], RT.map(([r, p]) => [r, pct(p, 2), Math.round(p * v.lgd * v.ead).toLocaleString('en-US'), Math.round(p * v.lgd * 1e4) + ' bp']))}`;
  },
});

Lab.reg('vasicek', {
  kicker: 'Credit', title: 'Vasicek: the loss distribution and Basel capital',
  lead: 'Defaults are not independent: in a recession they come together. The Vasicek model captures this with one common factor, and gives the loss distribution of a large loan portfolio in closed form. It is the formula behind the Basel capital requirement.',
  controls: [{ id: 'pd', label: 'PD', min: 0.001, max: 0.2, step: 0.001, val: 0.02, fmt: (x) => pct(x, 1) }, { id: 'rho', label: 'Asset correlation ρ', min: 0.01, max: 0.5, step: 0.01, val: 0.15, fmt: (x) => x.toFixed(2) }, { id: 'lgd', label: 'LGD', min: 0.1, max: 1, step: 0.05, val: 0.45, fmt: (x) => pct(x, 0) }, { id: 'conf', label: 'Confidence', opts: [[0.99, '99%'], [0.999, '99.9% (Basel)']], val: 0.999 }],
  note: 'Each borrower defaults when a latent asset value falls below a threshold: X = √ρ·Y + √(1 − ρ)·ε, with Y the common economic factor. Conditional on Y, defaults are independent and a very large portfolio\'s loss rate is exactly Φ((Φ⁻¹(PD) − √ρ·Y)/√(1 − ρ)). The loss rate is therefore distributed with CDF Φ((√(1 − ρ)·Φ⁻¹(x) − Φ⁻¹(PD))/√ρ). The <b>Basel IRB capital</b> is the unexpected loss: K = LGD·[loss rate quantile at 99.9% − PD], i.e. VaR minus expected loss. Higher correlation fattens the right tail without changing the mean. The Basel corporate correlation (12%–24%, decreasing in PD) is shown for comparison.',
  draw(v) {
    const xs = Array.from({ length: 400 }, (_, i) => 0.0005 + i * 0.0005 * Math.max(1, v.pd * 40)).filter((x) => x < 1), cdf = xs.map((x) => Risk.vasicekCdf(x, v.pd, v.rho)), pdf = xs.map((x, i) => i ? (cdf[i] - cdf[i - 1]) / (xs[i] - xs[i - 1]) : 0);
    const q = Risk.irbK(v.pd, 1, v.rho, v.conf) + v.pd, K = Risk.irbK(v.pd, v.lgd, v.rho, v.conf), rb = Risk.irbRho(v.pd), Kb = Risk.irbK(v.pd, v.lgd, rb, 0.999), rhos = Array.from({ length: 50 }, (_, i) => 0.01 + i * 0.01);
    later(() => {
      Lab.plot($('#c1'), { series: [{ x: xs, y: pdf, c: 'a', w: 2.2, fill: true }], vlines: [{ x: v.pd, c: 'y', t: 'expected' }, { x: q, c: 'r', t: pct(v.conf, 1) + ' quantile' }], xfmt: (x) => pct(x, 0), yfmt: (y) => y.toFixed(0), h: 270, xlim: [0, Math.min(1, q * 1.4)] });
      Lab.plot($('#c2'), { series: [{ x: rhos, y: rhos.map((r) => Risk.irbK(v.pd, v.lgd, r, v.conf)), c: 'r', w: 2.2 }], vlines: [{ x: v.rho, c: 'y', t: 'yours' }, { x: rb, c: 'm', t: 'Basel' }], xfmt: (x) => x.toFixed(2), yfmt: (y) => pct(y, 1), h: 270 });
    });
    return `<div class="kpis">${kpi('Expected loss', pct(v.pd * v.lgd, 2), 'PD × LGD')}${kpi(`Loss-rate quantile ${pct(v.conf, 1)}`, pct(q * v.lgd, 2), 'VaR of the portfolio')}${kpi('Capital K', pct(K, 2), 'unexpected loss per unit of exposure')}${kpi('Risk-weighted assets', pct(K * 12.5, 0), 'K × 12.5')}${kpi('Basel correlation', rb.toFixed(3), `K at 99.9%: ${pct(Kb, 2)}`)}</div>
      <div class="duo">${Lab.card('c1', 'Distribution of the portfolio default rate', null)}${Lab.card('c2', 'Capital vs asset correlation', null)}</div>`;
  },
});
