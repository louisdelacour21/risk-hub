'use strict';
/* Risk, eleventh set: FRTB standardised approach, delta aggregation. Maths in riskx10.js (tested). */
const r11Sl = (id, label, val) => ({ id, label, min: -300, max: 300, step: 10, val, fmt: (x) => x + ' m' });

Lab.reg('frtbsa', {
  kicker: 'Market risk', title: 'FRTB standardised approach: delta capital by buckets',
  lead: 'The standardised approach multiplies each sensitivity by a regulatory risk weight, nets it inside a bucket with a prescribed correlation, then combines buckets with a second correlation, and takes the worst of three correlation scenarios.',
  controls: [r11Sl('a1', 'Bucket A, name 1 (sensitivity)', 150), r11Sl('a2', 'Bucket A, name 2', -60), r11Sl('b1', 'Bucket B, name 1', 100), r11Sl('b2', 'Bucket B, name 2', 80), r11Sl('c1', 'Bucket C, name 1', -120), r11Sl('c2', 'Bucket C, name 2', 50), { id: 'g', label: 'Correlation across buckets', min: 0, max: 0.9, step: 0.05, val: 0.15, fmt: (x) => x.toFixed(2) }],
  note: 'Sensitivity = change in value for a 100% move of the risk factor, in millions (so a position). Buckets A, B, C carry the <b>illustrative</b> risk weights 30%, 35%, 50% and a correlation of 15% between different names in the same bucket; the real weights and correlations depend on sector, market cap and instrument and are in the Basel standard (BCBS d457): replace them before any use. <b>Bucket</b>: K<sub>b</sub> = √(Σ WS² + ΣΣ ρ WS<sub>i</sub> WS<sub>j</sub>), S<sub>b</sub> = Σ WS clipped to ±K<sub>b</sub>. <b>Class</b>: K = √(Σ K<sub>b</sub>² + ΣΣ γ S<sub>b</sub> S<sub>c</sub>). <b>Scenarios</b>: correlations are used as given (medium), raised ×1.25 capped at 1 (high), or lowered to max(2ρ − 1, 0.75ρ) (low); capital is the largest. Only delta, one risk class, no curvature, no default risk charge, no vega: a teaching version of the first layer of the standard.',
  draw(v, out) {
    const X = Risk.x, bk = [{ rw: 0.3, s: [v.a1, v.a2], rho: 0.15 }, { rw: 0.35, s: [v.b1, v.b2], rho: 0.15 }, { rw: 0.5, s: [v.c1, v.c2], rho: 0.15 }], R = X.sbaMax(bk, v.g), nm = ['A', 'B', 'C'], gross = bk.reduce((a, b) => a + b.rw * b.s.reduce((x, y) => x + Math.abs(y), 0), 0), med = R.scenarios[1], gs = Array.from({ length: 19 }, (_, i) => i * 0.05);
    out.innerHTML = `<div class="kpis">${kpi('Delta capital', R.capital.toFixed(1) + ' m', 'worst scenario: ' + R.mode)}${kpi('Gross weighted exposure', gross.toFixed(1) + ' m', 'no netting at all')}${kpi('Benefit of netting', pct(1 - R.capital / gross, 0), 'against the gross figure')}${kpi('Low / medium / high', R.scenarios.map((s) => s.K.toFixed(0)).join(' / ') + ' m', 'by scenario')}</div>
      ${Lab.table(['Bucket', 'Risk weight', 'Weighted net (m)', 'K (m)', 'S after clipping (m)'], bk.map((b, i) => [nm[i], pct(b.rw, 0), med.buckets[i].raw.toFixed(1), med.buckets[i].K.toFixed(1), med.buckets[i].S.toFixed(1)]))}
      ${Lab.card('c1', 'Capital against the correlation across buckets', [['a', 'capital (worst scenario)']])}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: gs, y: gs.map((g) => X.sbaMax(bk, g).capital), c: 'a', w: 2 }], vlines: [{ x: v.g, c: 'm' }], hlines: [{ y: 0 }], xfmt: (x) => x.toFixed(1), yfmt: (y) => y.toFixed(0), h: 210 }));
  },
});
