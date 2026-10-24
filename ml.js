'use strict';
/* Machine learning, the small honest kind: ridge and lasso, logistic regression, ROC / AUC / KS, regression trees and gradient boosting, a Gaussian hidden Markov model, quantile regression.
   Pure functions, no DOM, tested under Node (test-ml.js) and against scikit-learn / statsmodels (tools/verify_ml.py). Extends Risk (after quant.js). */
(function (root) {
  const Risk = root.Risk || require('./quant.js');
  const { mean, solve } = Risk;

  // ---------- helpers ----------
  
  
  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  const sigmoid = (z) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));
  

  // ---------- ridge and lasso (X should be standardised, y centred; no intercept) ----------
  
  
     // lams descending: warm starts

  // ---------- logistic regression (L2 on the slopes, not on the intercept), Newton / IRLS ----------
  function logistic(X, y, lam = 0) {                                  // minimises sum log-loss + lam/2 |w|^2 ; returns {b0, w, p(x)}
    const n = X.length, k = X[0].length + 1; let th = Array(k).fill(0);
    th[0] = Math.log((mean(y) + 1e-9) / (1 - mean(y) + 1e-9));
    for (let it = 0; it < 50; it++) {
      const g = Array(k).fill(0), H = Array.from({ length: k }, () => Array(k).fill(0));
      for (let t = 0; t < n; t++) {
        const x = [1, ...X[t]], p = sigmoid(dot(th, x)), w = Math.max(p * (1 - p), 1e-9), e = p - y[t];
        for (let i = 0; i < k; i++) { g[i] += e * x[i]; for (let j = i; j < k; j++) H[i][j] += w * x[i] * x[j]; }
      }
      for (let i = 1; i < k; i++) { g[i] += lam * th[i]; H[i][i] += lam; }
      for (let i = 0; i < k; i++) for (let j = 0; j < i; j++) H[i][j] = H[j][i];
      H[0][0] += 1e-10;
      const d = solve(H, g); th = th.map((v, i) => v - d[i]);
      if (Math.max(...d.map(Math.abs)) < 1e-10) break;
    }
    return { b0: th[0], w: th.slice(1), p: (x) => sigmoid(th[0] + dot(th.slice(1), x)) };
  }

  // ---------- classification metrics ----------
  
  
  
  

  // ---------- regression trees and gradient boosting ----------
  
  
     // y in {0,1}: the leaf value is the default probability
  

  // ---------- Gaussian hidden Markov model (K states), Baum-Welch with scaled forward-backward ----------
  

  // ---------- quantile regression (IRLS, as statsmodels QuantReg) ----------
  function quantReg(y, cols, tau) {                                   // intercept added; minimises sum rho_tau(y - Xb)
    const n = y.length, k = cols.length + 1, X = y.map((_, t) => [1, ...cols.map((c) => c[t])]);
    const wls = (w) => { const A = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => { let s = 0; for (let t = 0; t < n; t++) s += w[t] * X[t][i] * X[t][j]; return s; })), c = Array.from({ length: k }, (_, i) => { let s = 0; for (let t = 0; t < n; t++) s += w[t] * X[t][i] * y[t]; return s; }); return solve(A, c); };
    let b = wls(Array(n).fill(1));
    for (let it = 0; it < 500; it++) {
      const w = X.map((x, t) => { const e = y[t] - dot(b, x); return (e >= 0 ? tau : 1 - tau) / Math.max(Math.abs(e), 1e-6); }), nb = wls(w), d = Math.max(...nb.map((v, i) => Math.abs(v - b[i])));
      b = nb; if (d < 1e-9) break;
    }
    const loss = X.reduce((s, x, t) => { const e = y[t] - dot(b, x); return s + (e >= 0 ? tau : tau - 1) * e; }, 0);
    return { beta: b, loss, predict: (xs) => b[0] + xs.reduce((s, v, i) => s + v * b[i + 1], 0) };
  }

  Object.assign(Risk, { ml: {       logistic,         quantReg, sigmoid } });
  if (typeof module !== 'undefined' && module.exports) module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
