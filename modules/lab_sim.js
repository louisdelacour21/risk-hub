'use strict';
/* Simulation labs: Monte Carlo, jump diffusion, Heston, mean reversion, Kelly. Maths in quant.js. */
const pcts = (paths, ps) => { const n = paths[0].length; return ps.map((p) => Array.from({ length: n }, (_, t) => Risk.quantile(paths.map((x) => x[t]), p))); };
const smileOf = (priceAt, S, T, ks) => ks.map((k) => Risk.impliedVol(priceAt(S * k), S, S * k, T, 0.02, 0, 'C'));
const oneDec = (x) => x.toFixed(1);
const SRC = { id: 'src', label: 'Parameters', opts: [['man', 'Manual sliders'], ['asset', 'Fitted to the selected asset']], val: 'man' };
const clampTo = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
/* Fits to a real return series (simple daily returns r). */
function fitGbm(r) { const lr = r.map((x) => Math.log(1 + x)); return { mu: Risk.mean(lr) * PPY + Risk.std(lr) ** 2 * 126, sd: Risk.std(lr) * Math.sqrt(PPY) }; }
function fitMerton(r) {   // jumps = days further than 4 robust sigmas (median absolute deviation) from the median
  const lr = r.map((x) => Math.log(1 + x)), med = Risk.quantile(lr, 0.5), mad = Risk.quantile(lr.map((x) => Math.abs(x - med)), 0.5) * 1.4826, cut = 4 * mad;
  const J = lr.filter((x) => Math.abs(x - med) > cut), D = lr.filter((x) => Math.abs(x - med) <= cut), yrs = lr.length / PPY;
  return { s: Risk.std(D) * Math.sqrt(PPY), lam: J.length / yrs, mj: J.length ? Risk.mean(J) : 0, dj: J.length > 2 ? Math.max(0.02, Risk.std(J)) : 0.05, nJ: J.length };
}
function fitHeston(r) {   // variance of non-overlapping 21-day blocks, AR(1) on it, correlation with the block return
  const B = [], R = []; for (let i = 0; i + 21 <= r.length; i += 21) { const w = r.slice(i, i + 21); B.push(Risk.std(w) ** 2 * PPY); R.push(w.reduce((a, x) => a + Math.log(1 + x), 0)); }
  if (B.length < 12) throw new Error('Not enough history to calibrate (needs about 2 years).');
  const f = Risk.ouFit(B, 21 / PPY), dv = B.slice(1).map((x, i) => x - B[i]), rho = Risk.corr(R.slice(1), dv), th = Risk.mean(B);
  const ka = Number.isFinite(f.kappa) ? f.kappa : 2, sg = Number.isFinite(f.sigma) ? f.sigma : 0.3 * th;
  return { v0: clampTo(Risk.mean(r.slice(-21).map((x) => x * x)) * PPY, 0.01, 0.16), theta: clampTo(th, 0.01, 0.16), kappa: clampTo(ka, 0.2, 8), xi: clampTo(sg / Math.sqrt(th), 0.1, 1.5), rho: clampTo(Number.isFinite(rho) ? rho : -0.5, -0.95, 0.5), blocks: B.length };
}
const rolling = (r, n) => { const out = []; for (let i = n; i <= r.length; i++) out.push(r.slice(i - n, i).reduce((a, x) => a + Math.log(1 + x), 0)); return out; };

Lab.reg('mc', {
  asset: true,
  kicker: 'Simulation', title: 'Monte Carlo, and how to make it converge faster',
  lead: 'Simulate thousands of price paths, price an option by averaging the payoffs, then compare four ways of doing it. Same answer, very different error bars.',
  controls: [SRC, { id: 's', label: 'Volatility σ', min: 0.1, max: 0.6, step: 0.01, val: 0.25, fmt: (x) => pct(x, 0) }, { id: 'mu', label: 'Drift μ', min: -0.1, max: 0.2, step: 0.01, val: 0.06, fmt: (x) => pct(x, 0) }, { id: 'T', label: 'Maturity (years)', min: 0.25, max: 3, step: 0.25, val: 1, fmt: String },
    { id: 'k', label: 'Strike / spot', min: 0.8, max: 1.2, step: 0.01, val: 1.05, fmt: (x) => x.toFixed(2) }, { id: 'n', label: 'Paths per estimate', min: 250, max: 4000, step: 250, val: 1000, fmt: String }, { id: 'go', label: 'Draw new paths', run: true }],
  note: '<b>Variance reduction.</b> <b>Antithetic</b> pairs each draw z with −z, which cancels part of the noise. <b>Quasi-random</b> (Halton) points fill the unit interval evenly instead of randomly (with a random shift so repeated runs differ). A <b>control variate</b> subtracts a correlated quantity with a known mean, here the final price S<sub>T</sub>, whose expectation is the forward. Choose <i>Fitted to the selected asset</i> to take σ and μ from the history of the asset (or of your portfolio). The error is the standard deviation of 40 independent price estimates, each using the same number of paths; the exact Black-Scholes price is the target.',
  draw(v, out, ctx) {
    if (v.src === 'asset') { const g = fitGbm(ctx.r); v = { ...v, s: g.sd, mu: g.mu }; }
    const S = 100, K = S * v.k, r = 0.02, seed = 100 + (v._run || 0), bs = Risk.bs(S, K, v.T, v.s, r, 0, 'C').price, steps = 60;
    const P = Risk.gbmPaths(S, v.mu, v.s, v.T, steps, 800, seed), qs = pcts(P, [0.05, 0.5, 0.95]), tx = Array.from({ length: steps + 1 }, (_, i) => i / steps * v.T);
    const methods = [['plain', 'Plain Monte Carlo'], ['antithetic', 'Antithetic'], ['halton', 'Quasi-random (Halton)'], ['control', 'Control variate']], rows = [];
    let base = 0;
    for (const [m, label] of methods) { const est = Array.from({ length: 40 }, (_, i) => Risk.mcCall(S, K, v.T, v.s, r, 0, v.n, m, Risk.rng(seed * 100 + i), m === 'halton' ? Risk.rng(seed + i).u() : 0)), mean = Risk.mean(est), se = Risk.std(est); if (m === 'plain') base = se; rows.push([label, mean.toFixed(3), (mean - bs).toFixed(3), se.toFixed(3), (base / se).toFixed(1) + '×']); }
    out.innerHTML = `<div class="kpis">${kpi('Exact (Black-Scholes)', bs.toFixed(3), `call, K = ${K.toFixed(0)}`)}${kpi('Volatility used', pct(v.s, 1), `drift ${pct(v.mu, 1)}`)}${kpi('Paths drawn', P.length, `${steps} steps`)}${kpi('Median final price', qs[1][steps].toFixed(1), `5%-95%: ${qs[0][steps].toFixed(0)} – ${qs[2][steps].toFixed(0)}`)}</div>
      ${Lab.card('c1', 'Simulated price paths (geometric Brownian motion)', [['m', 'paths'], ['a', 'median'], ['b', '5% / 95%']])}${Lab.table(['Method', 'Mean of 40 estimates', 'Bias', 'Std. error', 'Error reduction'], rows)}`;
    Lab.plot($('#c1'), { series: [...P.slice(0, 40).map((p) => ({ x: tx, y: p, c: 'm', w: 0.8, alpha: 0.35 })), { x: tx, y: qs[0], c: 'b', w: 1.6 }, { x: tx, y: qs[2], c: 'b', w: 1.6 }, { x: tx, y: qs[1], c: 'a', w: 2.2 }], xfmt: (z) => z.toFixed(1) + 'y', yfmt: (z) => z.toFixed(0), hlines: [{ y: K, t: 'strike', c: 'y' }], h: 300 });
  },
});

Lab.reg('jumps', {
  asset: true,
  kicker: 'Simulation', title: 'Jump diffusion (Merton)',
  lead: 'Prices do not only wander, they gap. Merton adds Poisson jumps to Brownian motion: the distribution grows fat tails and the option smile appears, with no stochastic volatility at all.',
  controls: [SRC, { id: 's', label: 'Diffusion vol σ', min: 0.05, max: 0.4, step: 0.01, val: 0.15, fmt: (x) => pct(x, 0) }, { id: 'lam', label: 'Jumps per year λ', min: 0, max: 5, step: 0.1, val: 1, fmt: oneDec }, { id: 'mj', label: 'Mean jump (log)', min: -0.3, max: 0.1, step: 0.01, val: -0.1, fmt: (x) => pct(x, 0) }, { id: 'dj', label: 'Jump dispersion', min: 0.02, max: 0.3, step: 0.01, val: 0.12, fmt: (x) => pct(x, 0) }, { id: 'go', label: 'Draw new paths', run: true }],
  note: 'Between jumps the price follows a lognormal diffusion; at Poisson times it is multiplied by e<sup>J</sup> with J ~ N(μ<sub>J</sub>, δ²). The option price is a Poisson-weighted sum of Black-Scholes prices (closed form, Merton 1976), so the smile on the right is exact, not simulated. Negative mean jumps give the left skew seen in equity index options; more frequent jumps raise the kurtosis. The drift is compensated so the forward stays the same. With <i>Fitted to the selected asset</i>, days further than 4 robust standard deviations from the median are treated as jumps and the four parameters are read from them; the table compares the fitted model with the real 1-year returns (overlapping windows, so the sample is small).',
  draw(v, out, ctx) {
    let fit = null, real = null;
    if (v.src === 'asset') { fit = fitMerton(ctx.r); v = { ...v, s: fit.s, lam: fit.lam, mj: fit.mj, dj: fit.dj }; const yr = rolling(ctx.r, PPY); if (yr.length > 100) real = { m: Risk.moments(yr), sd: Risk.std(yr) }; }
    const S = 100, T = 1, m = Risk.mertonPaths(S, 0.05, v.s, v.lam, v.mj, v.dj, T, 250, 4000, 5 + (v._run || 0)), lr = m.term, mu = Risk.mean(lr), sd = Risk.std(lr), mo = Risk.moments(lr);
    const ks = Array.from({ length: 31 }, (_, i) => 0.7 + i * 0.02), iv = smileOf((K) => Risk.mertonPrice(S, K, T, v.s, 0.02, 0, v.lam, v.mj, v.dj, K >= S ? 'C' : 'C'), S, T, ks);
    const h = histo(lr, 40), bw = h.x[1] - h.x[0], dens = h.y.map((c) => c / lr.length / bw), nd = h.x.map((x) => Risk.normPdf((x - mu) / sd) / sd), tx = Array.from({ length: 251 }, (_, i) => i / 250);
    out.innerHTML = `<div class="kpis">${kpi('Std of 1-year log-return', pct(sd, 1), `diffusion alone: ${pct(v.s, 0)}`)}${kpi('Skewness', mo.skew.toFixed(2), 'negative = crash risk')}${kpi('Excess kurtosis', mo.exkurt.toFixed(2), 'normal = 0')}${kpi('ATM implied vol', pct(iv[15] || 0, 1), 'from the closed form')}</div>
      ${fit ? Lab.table(['Fitted to ' + esc(ctx.asset.name), 'Value', 'Real 1-year returns', 'Real vs model'], [['Diffusion vol σ', pct(fit.s, 1), 'Std', real ? pct(real.sd, 1) + ' vs ' + pct(sd, 1) : '–'], ['Jumps per year λ', fit.lam.toFixed(1) + ` (${fit.nJ} days beyond 4σ)`, 'Skewness', real ? real.m.skew.toFixed(2) + ' vs ' + mo.skew.toFixed(2) : '–'], ['Mean jump', pct(fit.mj, 1), 'Excess kurtosis', real ? real.m.exkurt.toFixed(2) + ' vs ' + mo.exkurt.toFixed(2) : '–'], ['Jump dispersion', pct(fit.dj, 1), '', '']]) : ''}
      <div class="duo">${Lab.card('c1', 'Sample paths with jumps', null)}${Lab.card('c2', 'Distribution of the 1-year log-return', [['a', 'simulated'], ['r', 'normal, same mean and std']])}</div>${Lab.card('c3', 'Implied volatility smile (Merton closed form)', null)}`;
    Lab.plot($('#c1'), { series: m.paths.slice(0, 12).map((p, i) => ({ x: tx, y: p, c: ['a', 'b', 'y', 'r'][i % 4], w: 1, alpha: 0.7 })), xfmt: (z) => z.toFixed(1) + 'y', yfmt: (z) => z.toFixed(0), h: 240 });
    Lab.plot($('#c2'), { series: [{ x: h.x, y: dens, bar: true, c: 'a', alpha: 0.6 }, { x: h.x, y: nd, c: 'r', w: 2 }], xfmt: (z) => pct(z, 0), yfmt: (z) => z.toFixed(1), h: 240 });
    const ok = ks.map((_, i) => i).filter((i) => iv[i] != null); Lab.plot($('#c3'), { series: [{ x: ok.map((i) => ks[i]), y: ok.map((i) => iv[i]), c: 'a', w: 2.2 }], hlines: [{ y: v.s, t: 'σ diffusion', c: 'm' }], xfmt: (z) => z.toFixed(2), yfmt: (z) => pct(z, 0), h: 240 });
  },
});

Lab.reg('heston', {
  asset: true,
  kicker: 'Simulation', title: 'Heston stochastic volatility',
  lead: 'Volatility itself is random and mean-reverting. Heston gives a smile and skew from five parameters, priced exactly through a characteristic function (no simulation needed for the smile).',
  controls: [SRC, { id: 'v0', label: 'Initial variance v₀ (vol²)', min: 0.01, max: 0.16, step: 0.005, val: 0.04, fmt: (x) => `${x.toFixed(3)} (vol ${pct(Math.sqrt(x), 0)})` }, { id: 'th', label: 'Long-run variance θ', min: 0.01, max: 0.16, step: 0.005, val: 0.05, fmt: (x) => `${x.toFixed(3)} (vol ${pct(Math.sqrt(x), 0)})` },
    { id: 'ka', label: 'Mean-reversion speed κ', min: 0.2, max: 8, step: 0.1, val: 2, fmt: oneDec }, { id: 'xi', label: 'Vol of vol ξ', min: 0.1, max: 1.5, step: 0.05, val: 0.5, fmt: (x) => x.toFixed(2) }, { id: 'rho', label: 'Correlation ρ', min: -0.95, max: 0.5, step: 0.05, val: -0.7, fmt: (x) => x.toFixed(2) },
    { id: 'T', label: 'Maturity (years)', min: 0.1, max: 2, step: 0.1, val: 0.5, fmt: String }],
  note: 'dS = S·(r dt + √v dW<sub>1</sub>), dv = κ(θ − v)dt + ξ√v dW<sub>2</sub>, corr(dW<sub>1</sub>, dW<sub>2</sub>) = ρ. <b>ρ &lt; 0</b> makes volatility rise when the price falls: the left skew. <b>ξ</b> sets the curvature (the smile); higher κ pulls variance back to θ faster. The <b>Feller condition</b> 2κθ ≥ ξ² keeps variance strictly positive; when it fails (often the case on real markets), variance touches zero. Prices come from the Heston (1993) formula by numerical integration of the characteristic function; the paths on the right use an Euler scheme with full truncation. <i>Fitted to the selected asset</i> reads the five parameters from the history of realised variance (no option prices needed), so the smile shown is the one implied by the asset\'s own behaviour, not a market quote.',
  draw(v, out, ctx) {
    let fit = null; if (v.src === 'asset') { fit = fitHeston(ctx.r); v = { ...v, v0: fit.v0, th: fit.theta, ka: fit.kappa, xi: fit.xi, rho: fit.rho }; }
    const p = { v0: v.v0, kappa: v.ka, theta: v.th, xi: v.xi, rho: v.rho }, S = 100, T = v.T, ks = Array.from({ length: 31 }, (_, i) => 0.7 + i * 0.02), iv = smileOf((K) => Risk.hestonCall(S, K, T, 0.02, 0, p), S, T, ks);
    const ok = ks.map((_, i) => i).filter((i) => iv[i] != null), P = Risk.hestonPaths(S, 0.02, 0, p, T, 126, 12), tx = Array.from({ length: 127 }, (_, i) => i / 126 * T), feller = 2 * v.ka * v.th >= v.xi * v.xi;
    const atm = iv[15];
    out.innerHTML = `<div class="kpis">${kpi('ATM implied vol', pct(atm || 0, 1), `√v₀ = ${pct(Math.sqrt(v.v0), 1)}`)}${kpi('Skew (90% − 110%)', ((iv[10] - iv[20]) * 100).toFixed(1) + ' pts', 'negative ρ → positive')}${kpi('Feller condition', feller ? '<span class="pass">holds</span>' : '<span class="fail">fails</span>', `2κθ = ${(2 * v.ka * v.th).toFixed(2)}, ξ² = ${(v.xi ** 2).toFixed(2)}`)}${kpi('Long-run vol', pct(Math.sqrt(v.th), 1), `half-life of variance ${(Math.log(2) / v.ka * 12).toFixed(1)} months`)}</div>
      ${fit ? Lab.table(['Calibrated to ' + esc(ctx.asset.name), 'Value', 'How it was read'], [['v₀ (today)', fit.v0.toFixed(3) + ` (vol ${pct(Math.sqrt(fit.v0), 0)})`, 'variance of the last 21 days'], ['θ (long run)', fit.theta.toFixed(3) + ` (vol ${pct(Math.sqrt(fit.theta), 0)})`, `mean of ${fit.blocks} monthly variances`], ['κ (speed)', fit.kappa.toFixed(1), 'AR(1) on monthly variance'], ['ξ (vol of vol)', fit.xi.toFixed(2), 'noise of variance divided by √θ'], ['ρ', fit.rho.toFixed(2), 'correlation of monthly returns with the change in variance']]) : ''}
      ${Lab.card('c1', 'Implied volatility smile', [['a', 'Heston'], ['m', 'flat Black-Scholes']])}<div class="duo">${Lab.card('c2', 'Price paths')}${Lab.card('c3', 'Instantaneous volatility √v')}</div>`;
    Lab.plot($('#c1'), { series: [{ x: ok.map((i) => ks[i]), y: ok.map((i) => iv[i]), c: 'a', w: 2.4 }], hlines: [{ y: Math.sqrt(v.v0), c: 'm', t: '√v₀' }], xfmt: (z) => (z * 100).toFixed(0) + '%', yfmt: (z) => pct(z, 0), h: 240 });
    const cols = ['a', 'b', 'y', 'r']; Lab.plot($('#c2'), { series: P.map((q, i) => ({ x: tx, y: q.s, c: cols[i % 4], w: 1, alpha: 0.75 })), xfmt: (z) => z.toFixed(1) + 'y', yfmt: (z) => z.toFixed(0), h: 220 });
    Lab.plot($('#c3'), { series: P.map((q, i) => ({ x: tx, y: q.v.map(Math.sqrt), c: cols[i % 4], w: 1, alpha: 0.75 })), xfmt: (z) => z.toFixed(1) + 'y', yfmt: (z) => pct(z, 0), hlines: [{ y: Math.sqrt(v.th), c: 'm', t: 'long-run' }], h: 220 });
  },
});

Lab.reg('ou', {
  asset: true,
  kicker: 'Simulation', title: 'Mean reversion (Ornstein-Uhlenbeck)',
  lead: 'Some quantities are pulled back to a level: interest rates, spreads, volatility. Simulate the process, then recover its parameters from the data, or fit it to the log of the VIX.',
  controls: [{ id: 'src', label: 'Data', opts: [['sim', 'Simulated'], ['vix', 'log VIX (real)'], ['rv', 'log 21-day vol of the selected asset']], val: 'sim' }, { id: 'ka', label: 'Speed κ (per year)', min: 0.5, max: 40, step: 0.5, val: 8, fmt: oneDec }, { id: 'mu', label: 'Long-run level μ', min: -1, max: 3, step: 0.1, val: 1, fmt: oneDec }, { id: 'sg', label: 'Noise σ', min: 0.1, max: 2, step: 0.05, val: 0.6, fmt: (x) => x.toFixed(2) }, { id: 'go', label: 'Draw new path', run: true }],
  note: 'dX = κ(μ − X)dt + σ dW. Its exact discretisation is an AR(1): X<sub>t+1</sub> = a + b·X<sub>t</sub> + ε with b = e<sup>−κΔt</sup>, so κ, μ and σ are recovered by a simple regression (that is also the maximum-likelihood estimator). The <b>half-life</b> ln2/κ is the time for a deviation to halve. With κ small the estimator is biased and noisy: mean reversion is hard to prove on short samples. The sliders only drive the simulated case. Realised volatility of any asset or of your portfolio mean-reverts: the half-life tells you how long a volatility spike lasts.',
  async draw(v, out, ctx) {
    const dt = 1 / PPY; let x, truth = null, label;
    if (v.src === 'vix') { const a = byId('vix'); if (!a) throw new Error('VIX series not available.'); await Data.ensure(a); x = a.close.map(Math.log); label = 'log VIX'; }
    else if (v.src === 'rv') { x = []; for (let i = 21; i <= ctx.r.length; i++) x.push(Math.log(Math.max(Risk.std(ctx.r.slice(i - 21, i)) * Math.sqrt(PPY), 1e-4))); label = 'log realised vol, ' + ctx.asset.name; }
    else { x = Risk.ouSim(v.mu + 1.5 * v.sg / Math.sqrt(2 * v.ka), v.ka, v.mu, v.sg, dt, 2500, 9 + (v._run || 0)); truth = v; label = 'simulated X'; }
    const f = Risk.ouFit(x, dt), tx = x.map((_, i) => i), k = Number.isFinite(f.kappa), days = k ? f.half * PPY : Infinity;
    out.innerHTML = `<div class="kpis">${kpi('Estimated κ', k ? f.kappa.toFixed(1) : 'none', truth ? `true ${truth.ka}` : 'per year')}${kpi('Estimated μ', k ? f.mu.toFixed(2) : '–', truth ? `true ${truth.mu}` : (k ? (v.src === 'rv' ? `level ≈ ${pct(Math.exp(f.mu), 1)} volatility` : `level ≈ ${Math.exp(f.mu).toFixed(1)} VIX`) : ''))}${kpi('Estimated σ', k ? f.sigma.toFixed(2) : '–', truth ? `true ${truth.sg}` : 'per √year')}${kpi('Half-life', Number.isFinite(days) ? days.toFixed(1) + ' days' : 'no reversion', 'ln2 / κ')}</div>
      ${Lab.card('c1', label + ' and its long-run level', [['a', 'series'], ['y', 'estimated μ']])}${Lab.card('c2', 'Where it will be: expected path and 90% band from today', [['a', 'expected'], ['b', '5% / 95%']])}`;
    Lab.plot($('#c1'), { series: [{ x: tx, y: x, c: 'a', w: 1.2 }], hlines: k ? [{ y: f.mu, c: 'y', t: 'μ' }] : [], xfmt: (z) => Math.round(z / PPY * 10) / 10 + 'y', yfmt: (z) => z.toFixed(1), h: 240 });
    if (k) { const x0 = x[x.length - 1], hz = Array.from({ length: 121 }, (_, i) => i), ex = hz.map((d) => f.mu + (x0 - f.mu) * Math.exp(-f.kappa * d * dt)), sdv = hz.map((d) => f.sigma * Math.sqrt((1 - Math.exp(-2 * f.kappa * d * dt)) / (2 * f.kappa)));
      Lab.plot($('#c2'), { series: [{ x: hz, y: ex.map((m, i) => m + 1.645 * sdv[i]), c: 'b' }, { x: hz, y: ex.map((m, i) => m - 1.645 * sdv[i]), c: 'b' }, { x: hz, y: ex, c: 'a', w: 2.2 }], xfmt: (z) => Math.round(z) + 'd', yfmt: (z) => z.toFixed(2), h: 220 }); }
  },
});

