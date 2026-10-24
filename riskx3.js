'use strict';
/* Third batch of risk maths, added to Risk.x: VaR scoring (tick loss, Diebold-Mariano), rank and nonlinear dependence, covariance cleaning (Ledoit-Wolf, eigenvalue clipping),
   conditional drawdown, Black-Litterman, Almgren-Chriss optimal liquidation. */
((G) => {
  const Risk = G.Risk || require('./riskx.js');
  const { normCdf } = Risk;
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

  // ---------- VaR scoring ----------
  // tick (quantile) loss of the lower-tail quantile forecast -var at tail probability p = 1 - conf; lower is better, and only the true quantile minimises its expectation
  const tickLoss = (r, v, p) => r.map((x, i) => { const q = -v[i], u = x - q; return (p - (u < 0 ? 1 : 0)) * u; });
  // Diebold-Mariano on loss differential d = l1 - l2 (negative: model 1 better), Newey-West variance with h-1 lags, normal p-value (two-sided)
  const dm = (l1, l2, h = 1) => {
    const d = l1.map((x, i) => x - l2[i]), n = d.length, m = mean(d), g = (k) => { let s = 0; for (let i = k; i < n; i++) s += (d[i] - m) * (d[i - k] - m); return s / n; };
    let lr = g(0); for (let k = 1; k < h; k++) lr += 2 * (1 - k / h) * g(k);
    const stat = m / Math.sqrt(Math.max(lr, 1e-30) / n);
    return { mean: m, stat, p: 2 * (1 - normCdf(Math.abs(stat))) };
  };

  // ---------- dependence ----------
  const rank = (x) => { const idx = x.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]), r = new Array(x.length); for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const av = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = av; i = j + 1; } return r; };
  const pearson = (x, y) => { const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); };
  const spearman = (x, y) => pearson(rank(x), rank(y));
  const kendall = (x, y) => { let c = 0, d = 0, tx = 0, ty = 0; const n = x.length; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const a = Math.sign(x[i] - x[j]), b = Math.sign(y[i] - y[j]); if (a * b > 0) c++; else if (a * b < 0) d++; else { if (a === 0) tx++; if (b === 0) ty++; } } return (c - d) / Math.sqrt((c + d + tx) * (c + d + ty)); };
  const dcor = (x, y) => {
    const n = x.length, cen = (v) => { const D = Array.from({ length: n }, (_, i) => Float64Array.from(v, (w) => Math.abs(v[i] - w))), rm = D.map((r) => mean(r)), gm = mean(rm); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) D[i][j] += gm - rm[i] - rm[j]; return D; };
    const A = cen(x), B = cen(y); let ab = 0, aa = 0, bb = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { ab += A[i][j] * B[i][j]; aa += A[i][j] ** 2; bb += B[i][j] ** 2; }
    return Math.sqrt(Math.max(ab, 0) / Math.sqrt(aa * bb));
  };
  const mutualInfo = (x, y, bins = 10) => { // on ranks so the bins are equiprobable; plug-in estimator, biased upward by about (bins-1)^2 / (2n)
    const n = x.length, rx = rank(x), ry = rank(y), b = (r) => Math.min(bins - 1, Math.floor(((r - 1) / n) * bins)), J = Array.from({ length: bins }, () => new Array(bins).fill(0));
    for (let i = 0; i < n; i++) J[b(rx[i])][b(ry[i])]++;
    let mi = 0; for (let i = 0; i < bins; i++) for (let j = 0; j < bins; j++) if (J[i][j]) { const p = J[i][j] / n; mi += p * Math.log(p / ((1 / bins) * (1 / bins))); }
    return { mi, bias: ((bins - 1) ** 2) / (2 * n) };
  };

  // ---------- covariance cleaning ----------
  const sampleCov = (X) => { const T = X.length, k = X[0].length, mu = Array.from({ length: k }, (_, j) => mean(X.map((r) => r[j]))), S = Array.from({ length: k }, () => new Array(k).fill(0)); for (const r of X) for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) S[i][j] += (r[i] - mu[i]) * (r[j] - mu[j]) / T; return { S, mu }; };
  // Ledoit-Wolf (2004) shrinkage towards mu * identity, mu = trace / k
  const ledoitWolf = (X) => {
    const T = X.length, k = X[0].length, { S, mu } = sampleCov(X), m = S.reduce((s, r, i) => s + r[i], 0) / k;
    let d2 = 0; for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) d2 += (S[i][j] - (i === j ? m : 0)) ** 2;
    let b2 = 0; for (const r of X) { let s = 0; for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) { const xi = (r[i] - mu[i]) * (r[j] - mu[j]) - S[i][j]; s += xi * xi; } b2 += s / (T * T); }
    b2 = Math.min(b2, d2); const a = d2 ? b2 / d2 : 0;
    return { S: S.map((r, i) => r.map((x, j) => (1 - a) * x + (i === j ? a * m : 0))), shrink: a, raw: S };
  };
  // symmetric eigen-decomposition by cyclic Jacobi rotations
  const eigSym = (A0) => {
    const n = A0.length, A = A0.map((r) => r.slice()), V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
    for (let sweep = 0; sweep < 60; sweep++) {
      let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] ** 2; if (off < 1e-22) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-300) continue;
        const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
        for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
        for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
      }
    }
    const vals = A.map((r, i) => r[i]), ord = vals.map((v, i) => i).sort((a, b) => vals[b] - vals[a]);
    return { vals: ord.map((i) => vals[i]), vecs: ord.map((i) => V.map((r) => r[i])) }; // vecs[i] = eigenvector of vals[i]
  };
  // Marchenko-Pastur cleaning of a correlation matrix: eigenvalues under the noise edge (1 + sqrt(k/T))^2 are replaced by their average, trace preserved
  const mpClean = (C, T) => {
    const k = C.length, e = eigSym(C), edge = (1 + Math.sqrt(k / T)) ** 2, noise = e.vals.map((v) => v <= edge), nn = noise.filter(Boolean).length, av = nn ? e.vals.filter((v, i) => noise[i]).reduce((a, b) => a + b, 0) / nn : 0;
    const vals = e.vals.map((v, i) => (noise[i] ? av : v)), M = Array.from({ length: k }, () => new Array(k).fill(0));
    for (let m = 0; m < k; m++) for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) M[i][j] += vals[m] * e.vecs[m][i] * e.vecs[m][j];
    const dg = M.map((r, i) => Math.sqrt(r[i] || 1)); // diagonal taken before rescaling: rescaling row by row in place would divide later rows by 1
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) M[i][j] /= dg[i] * dg[j];
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) if (i !== j) M[i][j] = (M[i][j] + M[j][i]) / 2;
    for (let i = 0; i < k; i++) M[i][i] = 1;
    return { C: M, edge, kept: k - nn, vals: e.vals };
  };
  const toCorr = (S) => S.map((r, i) => r.map((x, j) => x / Math.sqrt(S[i][i] * S[j][j])));
  const fromCorr = (C, sd) => C.map((r, i) => r.map((x, j) => x * sd[i] * sd[j]));
  // solve A x = b (Gauss with partial pivoting)
  const solve = (A0, b0) => {
    const n = b0.length, A = A0.map((r, i) => [...r, b0[i]]);
    for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; } }
    const x = new Array(n).fill(0); for (let i = n - 1; i >= 0; i--) { let s = A[i][n]; for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j]; x[i] = s / A[i][i]; } return x;
  };
  // long-short global minimum-variance weights (sum to 1)
  const minVar = (S) => { const w = solve(S, new Array(S.length).fill(1)), t = w.reduce((a, b) => a + b, 0); return w.map((x) => x / t); };
  const quad = (w, S) => { let s = 0; for (let i = 0; i < w.length; i++) for (let j = 0; j < w.length; j++) s += w[i] * w[j] * S[i][j]; return s; };

  // ---------- drawdowns ----------
  const drawdowns = (r) => { let v = 1, pk = 1; const dd = []; for (const x of r) { v *= 1 + x; pk = Math.max(pk, v); dd.push(1 - v / pk); } return dd; };
  const cdar = (dd, a) => { const s = dd.slice().sort((x, y) => y - x), n = Math.max(1, Math.ceil((1 - a) * s.length)), top = s.slice(0, n); return { dar: s[n - 1], cdar: mean(top) }; };

  // ---------- Black-Litterman ----------
  // pi = delta Sigma w; posterior mean = pi + tau Sigma P' (P tau Sigma P' + Omega)^-1 (Q - P pi); posterior covariance Sigma + M
  const blackLitterman = (Sigma, wm, delta, tau, P, Q, omega) => {
    const n = Sigma.length, pi = Sigma.map((r) => delta * r.reduce((s, x, j) => s + x * wm[j], 0));
    if (!P.length) return { pi, mu: pi };
    const ts = Sigma.map((r) => r.map((x) => tau * x)), PT = P.map((p) => ts.map((r) => r.reduce((s, x, j) => s + x * p[j], 0))), K = P.map((p, i) => P.map((q, j) => p.reduce((s, x, m) => s + x * PT[j][m], 0) + (i === j ? omega[i] : 0)));
    const diff = Q.map((q, i) => q - P[i].reduce((s, x, j) => s + x * pi[j], 0)), z = solve(K, diff);
    const mu = pi.map((p, i) => p + PT.reduce((s, row, v) => s + row[i] * z[v], 0));
    return { pi, mu };
  };
  const mvWeights = (Sigma, mu, delta) => solve(Sigma, mu.map((m) => m / delta));

  // ---------- Almgren-Chriss optimal liquidation ----------
  // sell X shares over T in N steps; temporary impact eta (cost per share per unit rate), permanent gamma, price volatility sigma per sqrt(time), risk aversion lam
  const almgrenChriss = (X, T, N, sigma, eta, gamma, lam) => {
    const tau = T / N, kap = Math.sqrt(Math.max(lam, 0) * sigma * sigma / Math.max(eta - 0.5 * gamma * tau, 1e-12)), x = [];
    for (let k = 0; k <= N; k++) x.push(kap * T < 1e-6 ? X * (1 - k / N) : X * Math.exp(-kap * k * tau) * (1 - Math.exp(-2 * kap * (T - k * tau))) / (1 - Math.exp(-2 * kap * T)));
    let cost = 0.5 * gamma * X * X, vari = 0; for (let k = 1; k <= N; k++) { const n = x[k - 1] - x[k]; cost += (eta / tau) * n * n; vari += sigma * sigma * tau * x[k] * x[k]; }
    return { x, cost, sd: Math.sqrt(vari), kappa: kap };
  };

  Object.assign(Risk.x, { tickLoss, dm, rank, pearson, spearman, kendall, dcor, mutualInfo, sampleCov, ledoitWolf, eigSym, mpClean, toCorr, fromCorr, solve, minVar, quad, drawdowns, cdar, blackLitterman, mvWeights, almgrenChriss });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
