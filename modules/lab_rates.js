'use strict';
/* Rates labs: Nelson-Siegel, curve PCA, bond maths, 2s10s slope, Vasicek short rate. */
const ratesCache = {};
const ratesOf = async (k) => (ratesCache[k] ||= await Data.loadRates(k));
const curveOpt = { id: 'cv', label: 'Curve', opts: [['eur', 'Euro area'], ['usd', 'US Treasury']], val: 'usd' };
const nearestIdx = (years, t) => years.reduce((b, y, i) => (Math.abs(y - t) < Math.abs(years[b] - t) ? i : b), 0);
const goodRow = (c, i) => { const z = c.zero(i); return z.every(Number.isFinite) ? z : null; };

Lab.reg('ns', {
  kicker: 'Rates', title: 'Nelson-Siegel: the curve in three numbers',
  lead: 'A whole yield curve of a dozen maturities is described well by a level, a slope and a curvature. Fit the model on any date of the real curve and watch the three factors move through history.',
  controls: [curveOpt, { id: 'pos', label: 'Date (0 = first, 100 = latest)', min: 0, max: 100, step: 1, val: 100, fmt: (x) => x + '%' }],
  note: 'y(t) = β₀ + β₁·(1 − e<sup>−t/λ</sup>)/(t/λ) + β₂·[(1 − e<sup>−t/λ</sup>)/(t/λ) − e<sup>−t/λ</sup>]. β₀ is the long-term level, β₁ the slope (short rate minus long rate is about −β₁), β₂ the hump in the middle; λ places the hump. For a given λ the model is linear in the betas, so they come from least squares; λ is found by scanning. The bottom chart refits every 20 days to show the factors in time. The errors are in basis points (1 bp = 0.01%).',
  async draw(v) {
    const c = await ratesOf(v.cv), n = c.dates.length; let i = Math.round(v.pos / 100 * (n - 1)); while (i > 0 && !goodRow(c, i)) i--;
    const z = goodRow(c, i), f = Risk.nsFit(c.years, z), ts = Array.from({ length: 80 }, (_, j) => 0.1 + j * 0.375), hist = [];
    for (let j = 0; j < n; j += 20) { const zz = goodRow(c, j); if (zz) { const g = Risk.nsFit(c.years, zz); hist.push({ j, g }); } }
    const bx = ts.map((t) => Risk.nsBasis(t, f.lam));
    later(() => {
      Lab.plot($('#c1'), { series: [{ x: c.years, y: z, c: 'm', dots: true, r: 3.5 }, { x: ts, y: ts.map(f.at), c: 'a', w: 2.4 }], xfmt: (t) => t.toFixed(0) + 'y', yfmt: (y) => y.toFixed(1) + '%', h: 260 });
      Lab.plot($('#c2'), { series: [{ x: ts, y: bx.map((b) => f.b0 * b[0]), c: 'b', w: 2 }, { x: ts, y: bx.map((b) => f.b1 * b[1]), c: 'r', w: 2 }, { x: ts, y: bx.map((b) => f.b2 * b[2]), c: 'g', w: 2 }], hlines: [{ y: 0 }], xfmt: (t) => t.toFixed(0) + 'y', yfmt: (y) => y.toFixed(1), h: 260 });
      Lab.plot($('#c3'), { series: [{ x: hist.map((h) => h.j), y: hist.map((h) => h.g.b0), c: 'b', w: 1.8 }, { x: hist.map((h) => h.j), y: hist.map((h) => h.g.b1), c: 'r', w: 1.8 }, { x: hist.map((h) => h.j), y: hist.map((h) => h.g.b2), c: 'g', w: 1.8 }], hlines: [{ y: 0 }], vlines: [{ x: i, c: 'y' }], xfmt: dateAxis(c.dates), yfmt: (y) => y.toFixed(1) + '%', h: 240 });
    });
    return `<div class="kpis">${kpi('Date', c.dates[i], c.label)}${kpi('Level β₀', f.b0.toFixed(2) + '%', 'long-run rate')}${kpi('Slope β₁', f.b1.toFixed(2), f.b1 < 0 ? 'upward-sloping curve' : 'inverted curve')}${kpi('Curvature β₂', f.b2.toFixed(2), `hump at λ = ${f.lam.toFixed(2)} years`)}${kpi('Fit error', (f.rmse * 100).toFixed(1) + ' bp', 'root mean square')}</div>
      <div class="duo">${Lab.card('c1', 'Observed zero rates and fitted curve', [['m', 'observed'], ['a', 'model']])}${Lab.card('c2', 'The three components', [['b', 'level'], ['r', 'slope'], ['g', 'curvature']])}</div>${Lab.card('c3', 'The three factors through time', [['b', 'β₀ level'], ['r', 'β₁ slope'], ['g', 'β₂ curvature']])}`;
  },
});

Lab.reg('pca', {
  kicker: 'Rates', title: 'Principal components of the curve',
  lead: 'Rates at all maturities move together. Principal component analysis finds the few independent shapes behind those moves: the curve almost always shifts, tilts or bends, and three factors explain nearly everything.',
  controls: [curveOpt, { id: 'yrs', label: 'Window (years)', min: 1, max: 20, step: 1, val: 10, fmt: String }],
  note: 'The input is the daily change of each zero rate, in basis points. The eigenvectors of its covariance matrix are the components; the eigenvalues are their variances. PC1 is usually a parallel shift (all loadings of the same sign), PC2 a tilt (short and long ends in opposition), PC3 a curvature. This is how banks reduce the dozens of rate risk factors of a book to three sensitivities, and how interest-rate VaR is often built. The sign of each component is arbitrary; here it is chosen so that PC1 is positive.',
  async draw(v) {
    const c = await ratesOf(v.cv), n = c.dates.length, from = Math.max(1, n - Math.round(v.yrs * PPY)), ch = [];
    for (let i = from; i < n; i++) { const a = goodRow(c, i), b = goodRow(c, i - 1); if (a && b) ch.push(a.map((x, j) => (x - b[j]) * 100)); }
    if (ch.length < 100) throw new Error('Not enough curve history.');
    const p = Risk.curvePCA(ch), sd = ch[0].map((_, j) => Risk.std(ch.map((r) => r[j])));
    later(() => {
      Lab.plot($('#c1'), { series: [0, 1, 2].map((k) => ({ x: c.years, y: p.vectors[k], c: ['b', 'r', 'g'][k], w: 2.2 })), hlines: [{ y: 0 }], xfmt: (t) => t.toFixed(0) + 'y', yfmt: (y) => y.toFixed(2), h: 270 });
      Lab.plot($('#c2'), { series: [{ x: p.share.slice(0, 8).map((_, k) => k + 1), y: p.share.slice(0, 8).map((s) => s * 100), bar: true, c: 'a', alpha: 0.8 }], xfmt: (k) => 'PC' + Math.round(k), yfmt: (y) => y.toFixed(0) + '%', h: 270, xlim: [0.4, 8.6], ylim: [0, 100] });
    });
    return `<div class="kpis">${kpi('PC1 (shift)', pct(p.share[0], 1), 'of total variance')}${kpi('PC2 (tilt)', pct(p.share[1], 1), '')}${kpi('PC3 (curvature)', pct(p.share[2], 1), '')}${kpi('First three', pct(p.share[0] + p.share[1] + p.share[2], 1), `${ch.length} daily changes`)}${kpi('Typical daily move', (sd.reduce((a, b) => a + b, 0) / sd.length).toFixed(1) + ' bp', 'average across maturities')}</div>
      <div class="duo">${Lab.card('c1', 'Loadings by maturity', [['b', 'PC1'], ['r', 'PC2'], ['g', 'PC3']])}${Lab.card('c2', 'Share of variance explained')}</div>`;
  },
});

Lab.reg('bond', {
  kicker: 'Rates', title: 'Bond calculator',
  lead: 'Price a bond from its yield, or the yield from its price, and see what rates will do to it. Duration is the first-order answer, convexity the correction.',
  controls: [{ id: 'cpn', label: 'Annual coupon', min: 0, max: 0.1, step: 0.0025, val: 0.05, fmt: (x) => pct(x, 2) }, { id: 'y', label: 'Yield to maturity', min: 0, max: 0.12, step: 0.0025, val: 0.045, fmt: (x) => pct(x, 2) }, { id: 'T', label: 'Maturity (years)', min: 1, max: 40, step: 1, val: 10, fmt: String }, { id: 'f', label: 'Payments per year', opts: [[1, 'Annual'], [2, 'Semi-annual']], val: 2 }],
  note: 'Price = Σ cash flow / (1 + y/m)<sup>k</sup>. <b>Macaulay duration</b> is the weighted-average time of the cash flows; <b>modified duration</b> = Macaulay / (1 + y/m) is the % price change per 1% in yield. <b>DV01</b> is the price change for one basis point. <b>Convexity</b> captures the curvature of the price/yield relation: it makes prices rise more when rates fall than they fall when rates rise, which is why long bonds are worth more than duration alone suggests. The right graph shows the true price against its duration and duration + convexity approximations.',
  draw(v) {
    const F = 100, b = Risk.bondPrice(F, v.cpn, v.y, v.T, v.f), est = (dy, conv) => b.price * (1 - b.mod * dy + (conv ? 0.5 * b.conv * dy * dy : 0));
    const ys = Array.from({ length: 61 }, (_, i) => Math.max(0, v.y - 0.03 + i * 0.001)), rows = [-200, -100, -50, 50, 100, 200].map((bp) => { const dy = bp / 1e4, t = Risk.bondPrice(F, v.cpn, Math.max(v.y + dy, 0), v.T, v.f).price; return [(bp > 0 ? '+' : '') + bp, t.toFixed(2), pct(t / b.price - 1, 2), pct(est(dy, false) / b.price - 1, 2), pct(est(dy, true) / b.price - 1, 2)]; });
    later(() => Lab.plot($('#c1'), { series: [{ x: ys, y: ys.map((y) => Risk.bondPrice(F, v.cpn, y, v.T, v.f).price), c: 'a', w: 2.4 }, { x: ys, y: ys.map((y) => est(y - v.y, false)), c: 'r', w: 1.6, dash: [5, 4] }, { x: ys, y: ys.map((y) => est(y - v.y, true)), c: 'g', w: 1.6, dash: [2, 3] }], vlines: [{ x: v.y, c: 'y' }], xfmt: (y) => pct(y, 1), yfmt: (p) => p.toFixed(0), h: 280 }));
    return `<div class="kpis">${kpi('Price (per 100)', b.price.toFixed(3), b.price > F ? 'premium' : b.price < F ? 'discount' : 'par')}${kpi('Macaulay duration', b.mac.toFixed(2) + ' y', 'average time of cash flows')}${kpi('Modified duration', b.mod.toFixed(2), '% price per 1% yield')}${kpi('Effective duration', ((Risk.bondPrice(F, v.cpn, Math.max(v.y - 0.0001, 0), v.T, v.f).price - Risk.bondPrice(F, v.cpn, v.y + 0.0001, v.T, v.f).price) / (2 * b.price * 0.0001)).toFixed(2), 'reprice at ±1 bp, no formula')}${kpi('Convexity', b.conv.toFixed(1), 'second-order effect')}${kpi('DV01', b.dv01.toFixed(4), 'price per basis point')}</div>
      ${Lab.card('c1', 'Price as a function of yield', [['a', 'exact'], ['r', 'duration only'], ['g', 'duration + convexity']])}${Lab.table(['Yield shock (bp)', 'Exact price', 'Exact change', 'Duration estimate', 'Duration + convexity'], rows)}`;
  },
});

Lab.reg('slope', {
  kicker: 'Rates', title: 'Slope of the curve: 2s10s',
  lead: 'The gap between the 10-year and the 2-year rate is the market\'s favourite recession signal. A negative gap means the curve is inverted: short rates above long rates.',
  controls: [curveOpt],
  note: 'Slope = 10-year rate minus 2-year rate, in basis points, from the zero curve (euro) or the par yields (US Treasury). An inverted curve has historically come before most recessions by 6 to 24 months, but it is a correlation on a few episodes, not a law, and the timing is very uncertain. The share of inverted days and the longest episode are computed on the whole available history.',
  async draw(v) {
    const c = await ratesOf(v.cv), a = nearestIdx(c.years, 2), b = nearestIdx(c.years, 10), s = c.dates.map((_, i) => { const r = c.rates[i]; return Number.isFinite(r[a]) && Number.isFinite(r[b]) ? (r[b] - r[a]) * 100 : NaN; });
    let run = 0, best = 0, bestEnd = 0, inv = 0, ok = 0; s.forEach((x, i) => { if (!Number.isFinite(x)) return; ok++; if (x < 0) { inv++; run++; if (run > best) { best = run; bestEnd = i; } } else run = 0; });
    const last = s[s.length - 1], idx = s.map((_, i) => i);
    later(() => Lab.plot($('#c1'), { series: [{ x: idx, y: s, c: 'a', w: 1.4 }], hlines: [{ y: 0, c: 'r', t: 'inverted below' }], xfmt: dateAxis(c.dates), yfmt: (y) => y.toFixed(0) + ' bp', h: 320 }));
    return `<div class="kpis">${kpi('Latest slope', last.toFixed(0) + ' bp', c.dates[c.dates.length - 1])}${kpi('Maturities used', `${c.tenors[a]} and ${c.tenors[b]}`, c.kind === 'par' ? 'par yields' : 'zero rates')}${kpi('Days inverted', pct(inv / ok, 0), 'of the whole history')}${kpi('Longest inversion', Math.round(best / 21) + ' months', 'ending ' + (c.dates[bestEnd] || '–'))}</div>${Lab.card('c1', c.tenors[b] + ' minus ' + c.tenors[a] + ' (basis points)')}`;
  },
});

Lab.reg('vas', {
  kicker: 'Rates', title: 'Vasicek short-rate model',
  lead: 'The short rate is pulled towards a long-run level with random shocks. From these three numbers the model produces both possible futures for the rate and a complete yield curve.',
  controls: [{ id: 'r0', label: 'Current short rate', min: -0.01, max: 0.1, step: 0.0025, val: 0.03, fmt: (x) => pct(x, 2) }, { id: 'th', label: 'Long-run level θ', min: 0, max: 0.08, step: 0.0025, val: 0.04, fmt: (x) => pct(x, 2) }, { id: 'ka', label: 'Speed κ', min: 0.05, max: 2, step: 0.05, val: 0.4, fmt: (x) => x.toFixed(2) }, { id: 'sg', label: 'Volatility σ', min: 0.002, max: 0.03, step: 0.001, val: 0.01, fmt: (x) => pct(x, 1) }, { id: 'go', label: 'Draw new paths', run: true }],
  note: 'dr = κ(θ − r)dt + σ dW. The rate is Gaussian, so it can go negative (a flaw in 1977, a feature since 2014). Zero-coupon yields are exact: P(t,T) = e<sup>A(τ) − B(τ)r</sup> with B = (1 − e<sup>−κτ</sup>)/κ. With r below θ the curve slopes upward, with r above θ it inverts, and long yields converge to θ − σ²/(2κ²). Fit κ, θ and σ to history and this becomes a simple scenario generator for interest-rate risk.',
  draw(v, out) {
    const R = Risk.rng(17 + (v._run || 0)), steps = 120, T = 10, dt = T / steps, n = 600, P = [];
    for (let k = 0; k < n; k++) { let r = v.r0; const p = [r]; for (let i = 0; i < steps; i++) { r += v.ka * (v.th - r) * dt + v.sg * Math.sqrt(dt) * R.n(); p.push(r); } P.push(p); }
    const tx = Array.from({ length: steps + 1 }, (_, i) => i * dt), q = [0.05, 0.5, 0.95].map((a) => tx.map((_, i) => Risk.quantile(P.map((p) => p[i]), a)));
    const yld = (r, tau) => { const B = (1 - Math.exp(-v.ka * tau)) / v.ka, A = (v.th - v.sg ** 2 / (2 * v.ka ** 2)) * (B - tau) - v.sg ** 2 * B * B / (4 * v.ka); return -(A - B * r) / tau; };
    const taus = Array.from({ length: 60 }, (_, i) => 0.25 + i * 0.5), inf = v.th - v.sg ** 2 / (2 * v.ka ** 2);
    const neg = P.filter((p) => Math.min(...p) < 0).length / n;
    out.innerHTML = `<div class="kpis">${kpi('10y yield (model)', pct(yld(v.r0, 10), 2), 'zero-coupon')}${kpi('Infinite-maturity yield', pct(inf, 2), 'θ − σ²/2κ²')}${kpi('Half-life of a shock', (Math.log(2) / v.ka).toFixed(1) + ' y', 'ln2 / κ')}${kpi('Paths going negative', pct(neg, 0), 'within 10 years')}</div>
      <div class="duo">${Lab.card('c1', 'Short-rate paths and 90% band', [['m', 'paths'], ['a', 'median'], ['b', '5% / 95%']])}${Lab.card('c2', 'Yield curves for different starting rates', [['r', 'rate 2 pts lower'], ['a', 'current'], ['g', '2 pts higher']])}</div>`;
    Lab.plot($('#c1'), { series: [...P.slice(0, 25).map((p) => ({ x: tx, y: p, c: 'm', w: 0.8, alpha: 0.3 })), { x: tx, y: q[0], c: 'b', w: 1.6 }, { x: tx, y: q[2], c: 'b', w: 1.6 }, { x: tx, y: q[1], c: 'a', w: 2.4 }], hlines: [{ y: v.th, c: 'y', t: 'θ' }, { y: 0 }], xfmt: (t) => t.toFixed(0) + 'y', yfmt: (y) => pct(y, 1), h: 270 });
    Lab.plot($('#c2'), { series: [[v.r0 - 0.02, 'r'], [v.r0, 'a'], [v.r0 + 0.02, 'g']].map(([r, c]) => ({ x: taus, y: taus.map((t) => yld(r, t)), c, w: 2.2 })), xfmt: (t) => t.toFixed(0) + 'y', yfmt: (y) => pct(y, 1), h: 270 });
  },
});
