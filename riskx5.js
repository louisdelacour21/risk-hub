'use strict';
/* Fifth batch, added to Risk.x: quantum risk (resources to break ECC-256, Q-Day timing, jump-mixture tail risk, Mosca inequality)
   and AI / model risk (fairness metrics, proxy effect, population stability index, Kolmogorov-Smirnov drift). */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); if (typeof require !== 'undefined' && !G.Risk) require('./riskx3.js');
  const X = Risk.x, mean = (a) => a.reduce((s, x) => s + x, 0) / a.length, { normCdf } = Risk;

  // ---------- quantum: resources to run Shor on an n-bit elliptic curve ----------
  // Roetteler et al. (2017): about 9n + 2 log2(n) + 10 logical qubits and 448 n^3 log2(n) + 4090 n^3 Toffoli gates. Order of magnitude, not a forecast.
  // Surface code: logical error per round p_L = 0.1 (p / p_th)^((d+1)/2), about 2 d^2 physical qubits per logical qubit.
  
  // year at which a hardware roadmap (N0 physical qubits in year t0, multiplied by g each year) reaches the required count
  
  // Q-Day as a lognormal time from today: P(Q-Day <= h years)
  
  // Mosca: data that must stay secret Y years, migration takes X years; broken if X + Y > Z (years until Q-Day)
  

  // weighted tail measures: losses with weights summing to 1, upper tail at confidence cf
  
  // mixture of the historical loss distribution (weight 1-p) and the same days with a Q-Day shock (weight p); a return r becomes (1+r)(1-J)-1
  
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
  

  // ---------- AI: fairness of a binary decision ----------
  // synthetic credit population: group g (share of group 1 = share), outcome y with group base rates, score = sep*y + N(0,1) (+ bias for group 1)
  
  
  
  // threshold of group k that yields a target selection rate, or a target true positive rate
  

  // ---------- AI: proxy effect ----------
  // y = bx*x + bz*z + noise, x correlated with z. Removing z does not remove its effect: it moves into x.
  
  

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

  Object.assign(X, {  aucOf, permImportance, shapley, modelRisk,       bootWindows,       psi, ks2, rollingDrift });
})(typeof window !== 'undefined' ? window : globalThis);
