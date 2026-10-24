'use strict';
/* Third batch of risk maths, added to Risk.x: VaR scoring (tick loss, Diebold-Mariano), rank and nonlinear dependence, covariance cleaning (Ledoit-Wolf, eigenvalue clipping),
   conditional drawdown, Black-Litterman, Almgren-Chriss optimal liquidation. */
((G) => {
  const Risk = G.Risk || require('./riskx.js');
  const { normCdf } = Risk;
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

  // ---------- VaR scoring ----------
  // tick (quantile) loss of the lower-tail quantile forecast -var at tail probability p = 1 - conf; lower is better, and only the true quantile minimises its expectation
  
  // Diebold-Mariano on loss differential d = l1 - l2 (negative: model 1 better), Newey-West variance with h-1 lags, normal p-value (two-sided)
  

  // ---------- dependence ----------
  
  
  
  
  const dcor = (x, y) => {
    const n = x.length, cen = (v) => { const D = Array.from({ length: n }, (_, i) => Float64Array.from(v, (w) => Math.abs(v[i] - w))), rm = D.map((r) => mean(r)), gm = mean(rm); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) D[i][j] += gm - rm[i] - rm[j]; return D; };
    const A = cen(x), B = cen(y); let ab = 0, aa = 0, bb = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { ab += A[i][j] * B[i][j]; aa += A[i][j] ** 2; bb += B[i][j] ** 2; }
    return Math.sqrt(Math.max(ab, 0) / Math.sqrt(aa * bb));
  };
  

  // ---------- covariance cleaning ----------
  
  // Ledoit-Wolf (2004) shrinkage towards mu * identity, mu = trace / k
  
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
  
  
  
  // solve A x = b (Gauss with partial pivoting)
  const solve = (A0, b0) => {
    const n = b0.length, A = A0.map((r, i) => [...r, b0[i]]);
    for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; } }
    const x = new Array(n).fill(0); for (let i = n - 1; i >= 0; i--) { let s = A[i][n]; for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j]; x[i] = s / A[i][i]; } return x;
  };
  // long-short global minimum-variance weights (sum to 1)
  
  

  // ---------- drawdowns ----------
  
  

  // ---------- Black-Litterman ----------
  // pi = delta Sigma w; posterior mean = pi + tau Sigma P' (P tau Sigma P' + Omega)^-1 (Q - P pi); posterior covariance Sigma + M
  
  

  // ---------- Almgren-Chriss optimal liquidation ----------
  // sell X shares over T in N steps; temporary impact eta (cost per share per unit rate), permanent gamma, price volatility sigma per sqrt(time), risk aversion lam
  

  Object.assign(Risk.x, {       dcor,    eigSym,    solve,       });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
