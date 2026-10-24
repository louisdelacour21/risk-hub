'use strict';
/* Fifth batch, added to Risk.x: quantum risk (resources to break ECC-256, Q-Day timing, jump-mixture tail risk, Mosca inequality)
   and AI / model risk (fairness metrics, proxy effect, population stability index, Kolmogorov-Smirnov drift). */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); if (typeof require !== 'undefined' && !G.Risk) require('./riskx3.js');
  const X = Risk.x, mean = (a) => a.reduce((s, x) => s + x, 0) / a.length, { normCdf } = Risk;

  // ---------- quantum: resources to run Shor on an n-bit elliptic curve ----------
  // Roetteler et al. (2017): about 9n + 2 log2(n) + 10 logical qubits and 448 n^3 log2(n) + 4090 n^3 Toffoli gates. Order of magnitude, not a forecast.
  // Surface code: logical error per round p_L = 0.1 (p / p_th)^((d+1)/2), about 2 d^2 physical qubits per logical qubit.
  function shorEcc(o) {
    const n = o.bits || 256, p = o.pPhys, pth = o.pThresh || 0.01, lg = Math.log2(n);
    const logical = Math.ceil(9 * n + 2 * lg + 10), toffoli = (448 * n ** 3 * lg + 4090 * n ** 3) / (o.gain || 1), budget = o.failBudget || 0.1;   // gain: assumed algorithmic improvement on the gate count
    if (!(p < pth)) return { logical, toffoli, d: Infinity, perLogical: Infinity, physical: Infinity, seconds: Infinity };
    let d = 3; while (d < 301 && 0.1 * (p / pth) ** ((d + 1) / 2) * logical * toffoli > budget) d += 2;
    const perLogical = 2 * d * d, cycle = (o.cycleUs || 1) * 1e-6;
    return { logical, toffoli, d, perLogical, physical: logical * perLogical, pL: 0.1 * (p / pth) ** ((d + 1) / 2), seconds: toffoli * d * cycle };
  }
  // year at which a hardware roadmap (N0 physical qubits in year t0, multiplied by g each year) reaches the required count
  const qdayYear = (need, N0, t0, g) => (g > 1 && N0 > 0 ? t0 + Math.max(0, Math.log(need / N0) / Math.log(g)) : Infinity);
  // Q-Day as a lognormal time from today: P(Q-Day <= h years)
  const qdayProb = (h, median, sigma) => (h <= 0 ? 0 : normCdf((Math.log(h) - Math.log(median)) / sigma));
  // Mosca: data that must stay secret Y years, migration takes X years; broken if X + Y > Z (years until Q-Day)
  const mosca = (x, y, median, sigma) => ({ p: qdayProb(x + y, median, sigma), slack: median - (x + y) });

  // weighted tail measures: losses with weights summing to 1, upper tail at confidence cf
  function weightedTail(L, W, cf) {
    const idx = L.map((_, i) => i).sort((a, b) => L[a] - L[b]); let c = 0, v = L[idx[idx.length - 1]];
    for (const i of idx) { c += W[i]; if (c >= cf - 1e-12) { v = L[i]; break; } }                 // tolerance: n equal weights of 1/n sum to cf only up to rounding
    let es = 0; for (const i of idx) if (L[i] > v) es += W[i] * (L[i] - v);
    return { var: v, es: v + es / (1 - cf) };                                                         // Rockafellar-Uryasev: exact tail mass 1 - cf even when an atom straddles the quantile
  }
  // mixture of the historical loss distribution (weight 1-p) and the same days with a Q-Day shock (weight p); a return r becomes (1+r)(1-J)-1
  function jumpMixture(r, p, J, cf) {
    const n = r.length, base = r.map((x) => -x), shocked = r.map((x) => 1 - (1 + x) * (1 - J));
    const hist = weightedTail(base, base.map(() => 1 / n), cf);
    const mix = weightedTail([...base, ...shocked], [...base.map(() => (1 - p) / n), ...shocked.map(() => p / n)], cf);
    return { hist, mix };
  }
  // circular block bootstrap of a multi-asset daily history: `paths` independent L-day buy-and-hold returns per asset.
  // Blocks keep the days of one date together (cross-asset dependence, volatility clustering); demean removes the sample drift, so the window is a risk measure and not a bull market.
  function bootWindows(R, L, paths, block, seed, demean) {
    const T = R[0].length, g = Risk.rng(seed || 7), mu = R.map((r) => (demean ? mean(r) : 0)), out = [];
    for (let p = 0; p < paths; p++) {
      const cum = R.map(() => 1); let t = 0;
      while (t < L) { const s = Math.floor(g.u() * T); for (let k = 0; k < block && t < L; k++, t++) { const j = (s + k) % T; for (let i = 0; i < R.length; i++) cum[i] *= 1 + R[i][j] - mu[i]; } }
      out.push(cum.map((c) => c - 1));
    }
    return out;
  }
  // tail beta: average alt return on the worst q days of the reference asset, divided by the reference average on those days
  function tailBeta(ref, alt, q) {
    const k = Math.max(3, Math.round(q * ref.length)), idx = ref.map((_, i) => i).sort((a, b) => ref[a] - ref[b]).slice(0, k);
    return mean(idx.map((i) => alt[i])) / mean(idx.map((i) => ref[i]));
  }

  // ---------- AI: fairness of a binary decision ----------
  // synthetic credit population: group g (share of group 1 = share), outcome y with group base rates, score = sep*y + N(0,1) (+ bias for group 1)
  function population(o) {
    const R = Risk.rng(o.seed || 5), n = o.n || 20000, y = [], g = [], s = [];
    for (let i = 0; i < n; i++) { const gi = R.u() < (o.share ?? 0.4) ? 1 : 0, yi = R.u() < (gi ? o.base1 : o.base0) ? 1 : 0; g.push(gi); y.push(yi); s.push((o.sep ?? 1.5) * yi + R.n() + (gi ? o.bias || 0 : 0)); }
    return { y, g, s };
  }
  function groupStats(P, thr) {                                       // thr = [t0, t1]; decision = score >= threshold of the person's group
    return [0, 1].map((k) => {
      let tp = 0, fp = 0, fn = 0, tn = 0;
      for (let i = 0; i < P.y.length; i++) if (P.g[i] === k) { const d = P.s[i] >= thr[k]; if (P.y[i]) d ? tp++ : fn++; else d ? fp++ : tn++; }
      const n = tp + fp + fn + tn;
      return { n, tp, fp, fn, tn, sel: (tp + fp) / n, ppv: tp / Math.max(1, tp + fp), tpr: tp / Math.max(1, tp + fn), fpr: fp / Math.max(1, fp + tn), acc: (tp + tn) / n, base: (tp + fn) / n };
    });
  }
  function fairness(P, thr) {
    const [a, b] = groupStats(P, thr), tot = a.n + b.n;
    return { a, b, dp: b.sel - a.sel, ratio: Math.min(a.sel, b.sel) / Math.max(a.sel, b.sel, 1e-12), tpr: b.tpr - a.tpr, fpr: b.fpr - a.fpr, ppv: b.ppv - a.ppv, acc: (a.acc * a.n + b.acc * b.n) / tot, naive: Math.max((a.base * a.n + b.base * b.n) / tot, 1 - (a.base * a.n + b.base * b.n) / tot) };
  }
  // threshold of group k that yields a target selection rate, or a target true positive rate
  function thresholdFor(P, k, target, what) {
    const sc = []; for (let i = 0; i < P.y.length; i++) if (P.g[i] === k && (what === 'tpr' ? P.y[i] : true)) sc.push(P.s[i]);
    sc.sort((x, y) => y - x); return sc[Math.min(sc.length - 1, Math.max(0, Math.round(target * sc.length) - 1))];
  }

  // ---------- AI: proxy effect ----------
  // y = bx*x + bz*z + noise, x correlated with z. Removing z does not remove its effect: it moves into x.
  function ols(y, cols) {
    const n = y.length, k = cols.length + 1, Z = Array.from({ length: n }, (_, i) => [1, ...cols.map((c) => c[i])]);
    const A = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => Z.reduce((s, r) => s + r[i] * r[j], 0))), b = Array.from({ length: k }, (_, i) => Z.reduce((s, r, t) => s + r[i] * y[t], 0));
    return X.solve(A, b);
  }
  function proxy(o) {
    const R = Risk.rng(o.seed || 9), n = o.n || 5000, z = [], x = [], y = [];
    for (let i = 0; i < n; i++) { const zi = R.u() < 0.5 ? 1 : 0, xi = o.rho * (zi - 0.5) * 2 + Math.sqrt(1 - o.rho ** 2) * R.n(); z.push(zi); x.push(xi); y.push(o.bx * xi + o.bz * zi + o.noise * R.n()); }
    const full = ols(y, [x, z]), short = ols(y, [x]);
    return { bxFull: full[1], bzFull: full[2], bxShort: short[1], theory: o.bx + o.bz * Risk.x.pearson(x, z) * Risk.std(z) / Risk.std(x), z, x, y };
  }

  // ---------- AI: drift ----------
  // Population stability index with bins from the reference quantiles; > 0.10 watch, > 0.25 act
  function psi(ref, cur, bins = 10) {
    const s = [...ref].sort((a, b) => a - b), cuts = []; for (let k = 1; k < bins; k++) cuts.push(s[Math.floor(k * s.length / bins)]);
    const hist = (a) => { const c = Array(bins).fill(0); for (const v of a) { let j = 0; while (j < cuts.length && v > cuts[j]) j++; c[j]++; } return c.map((x) => Math.max(x / a.length, 1e-4)); };
    const e = hist(ref), c = hist(cur); return e.reduce((t, ei, i) => t + (c[i] - ei) * Math.log(c[i] / ei), 0);
  }
  function ks2(a, b) {
    const A = [...a].sort((x, y) => x - y), B = [...b].sort((x, y) => x - y); let i = 0, j = 0, d = 0;
    while (i < A.length && j < B.length) { const v = Math.min(A[i], B[j]); while (i < A.length && A[i] <= v) i++; while (j < B.length && B[j] <= v) j++; d = Math.max(d, Math.abs(i / A.length - j / B.length)); }
    const en = Math.sqrt(A.length * B.length / (A.length + B.length)), lam = (en + 0.12 + 0.11 / en) * d; let p = 0;
    for (let k = 1; k <= 100; k++) p += 2 * (k % 2 ? 1 : -1) * Math.exp(-2 * k * k * lam * lam);
    return { d, p: Math.min(1, Math.max(0, p)) };
  }
  function rollingDrift(s, refLen, win, step) {                       // reference = first refLen points; each window of win points compared with it
    const ref = s.slice(0, refLen), out = [];
    for (let e = refLen + win; e <= s.length; e += step) { const cur = s.slice(e - win, e); out.push({ end: e, psi: psi(ref, cur), ks: ks2(ref, cur).d }); }
    return out;
  }

  // ---------- AI: explaining a scoring model ----------
  // applicants: 5 standardised features; debt ratio and utilisation are correlated (rho); y = 1 is a default drawn from a logistic law, the last feature has no effect
  const TRUE_W = [-0.8, 0.9, 0.6, -0.5, 0];
  function applicants(o) {
    const R = Risk.rng(o.seed || 11), n = o.n || 3000, rho = o.rho ?? 0.7, Xm = [], y = [];
    for (let i = 0; i < n; i++) {
      const z = Array.from({ length: 5 }, () => R.n()), x = [z[0], z[1], rho * z[1] + Math.sqrt(1 - rho * rho) * z[2], z[3], z[4]];
      const p = 1 / (1 + Math.exp(-(-1.5 + TRUE_W.reduce((s, c, j) => s + c * x[j], 0)))); Xm.push(x); y.push(R.u() < p ? 1 : 0);
    }
    return { X: Xm, y, trueW: TRUE_W, names: ['Income', 'Debt ratio', 'Credit utilisation', 'Credit history', 'Noise (no effect)'] };
  }
  const aucOf = (s, y) => { const idx = s.map((_, i) => i).sort((a, b) => s[a] - s[b]); let rs = 0, n1 = 0; idx.forEach((k, r) => { if (y[k]) { rs += r + 1; n1++; } }); return (rs - n1 * (n1 + 1) / 2) / (n1 * (y.length - n1)); };
  // permutation importance: fall in AUC when one column is shuffled (mean over reps)
  function permImportance(pf, Xm, y, reps, seed) {
    const R = Risk.rng(seed || 3), base = aucOf(Xm.map(pf), y), d = Xm[0].length;
    return { base, drop: Array.from({ length: d }, (_, j) => {
      let t = 0;
      for (let r = 0; r < reps; r++) { const col = Xm.map((x) => x[j]); for (let i = col.length - 1; i > 0; i--) { const k = Math.floor(R.u() * (i + 1)); [col[i], col[k]] = [col[k], col[i]]; } t += base - aucOf(Xm.map((x, i) => pf([...x.slice(0, j), col[i], ...x.slice(j + 1)])), y); }
      return t / reps;
    }) };
  }
  // exact Shapley values of pf at x, a coalition S keeping the applicant's values and the others drawn from the background rows B (interventional); 2^d coalitions
  function shapley(pf, x, B) {
    const d = x.length, N = 1 << d, v = new Array(N), fact = [1]; for (let i = 1; i <= d; i++) fact.push(fact[i - 1] * i);
    for (let m = 0; m < N; m++) { let s = 0; for (const b of B) s += pf(x.map((xj, j) => (m >> j & 1 ? xj : b[j]))); v[m] = s / B.length; }
    const phi = Array(d).fill(0);
    for (let m = 0; m < N; m++) { let k = 0; for (let j = 0; j < d; j++) if (m >> j & 1) k++; for (let j = 0; j < d; j++) if (!(m >> j & 1)) phi[j] += fact[k] * fact[d - k - 1] / fact[d] * (v[m | 1 << j] - v[m]); }
    return { phi, base: v[0], full: v[N - 1] };
  }

  // ---------- model risk: reserve for the chance a model is wrong ----------
  // relative output error e ~ N(0, s), s = s0 * complexity * (1 + 0.15 * years since validation); only adverse errors cost, loss = exposure * max(0, e).
  // standalone VaR / ES in closed form; the aggregate with a one-factor correlation by simulation.
  function modelRisk(models, o) {
    const q = o.q ?? 0.99, z = Risk.normInv(q), rows = models.map((m) => { const s = o.s0 * m.cx * (1 + 0.15 * m.age); return { ...m, s, var: m.exposure * s * z, es: m.exposure * s * Risk.normPdf(z) / (1 - q) }; });
    const R = Risk.rng(o.seed || 5), N = o.n || 20000, L = [], a = Math.sqrt(o.rho), b = Math.sqrt(1 - o.rho);
    for (let t = 0; t < N; t++) { const F = R.n(); let l = 0; for (const r of rows) l += r.exposure * Math.max(0, r.s * (a * F + b * R.n())); L.push(l); }
    L.sort((x, y) => x - y); const k = Math.floor(q * N), tail = L.slice(k);
    return { rows, sumEs: rows.reduce((s, r) => s + r.es, 0), aggVar: L[k], aggEs: tail.reduce((s, x) => s + x, 0) / tail.length };
  }

  Object.assign(X, { applicants, aucOf, permImportance, shapley, modelRisk, shorEcc, qdayYear, qdayProb, mosca, weightedTail, jumpMixture, bootWindows, tailBeta, population, groupStats, fairness, thresholdFor, proxy, psi, ks2, rollingDrift });
})(typeof window !== 'undefined' ? window : globalThis);
