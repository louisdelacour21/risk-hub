'use strict';
/* Machine learning, the small honest kind: ridge and lasso, logistic regression, ROC / AUC / KS, regression trees and gradient boosting, a Gaussian hidden Markov model, quantile regression.
   Pure functions, no DOM, tested under Node (test-ml.js) and against scikit-learn / statsmodels (tools/verify_ml.py). Extends Risk (after quant.js). */
(function (root) {
  const Risk = root.Risk || require('./quant.js');
  const { mean, solve } = Risk;

  // ---------- helpers ----------
  const colStats = (X) => { const n = X.length, k = X[0].length, mu = Array(k).fill(0), sd = Array(k).fill(0); for (const r of X) for (let j = 0; j < k; j++) mu[j] += r[j] / n; for (const r of X) for (let j = 0; j < k; j++) sd[j] += (r[j] - mu[j]) ** 2 / n; return { mu, sd: sd.map((v) => Math.sqrt(v) || 1) }; };
  const apply = (X, st) => X.map((r) => r.map((v, j) => (v - st.mu[j]) / st.sd[j]));
  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  const sigmoid = (z) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));
  const r2 = (y, p) => { const m = mean(y); let a = 0, b = 0; for (let i = 0; i < y.length; i++) { a += (y[i] - p[i]) ** 2; b += (y[i] - m) ** 2; } return 1 - a / b; };

  // ---------- ridge and lasso (X should be standardised, y centred; no intercept) ----------
  function ridge(Z, y, lam) {                                         // minimises sum (y - Zb)^2 + lam |b|^2
    const k = Z[0].length, A = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => { let s = i === j ? lam : 0; for (const r of Z) s += r[i] * r[j]; return s; })), c = Array.from({ length: k }, (_, i) => Z.reduce((s, r, t) => s + r[i] * y[t], 0));
    return solve(A, c);
  }
  function lasso(Z, y, lam, o = {}) {                                 // minimises (1/2n) sum (y - Zb)^2 + lam |b|_1, coordinate descent (scikit-learn's convention)
    const n = Z.length, k = Z[0].length, b = (o.start || Array(k).fill(0)).slice(), res = y.map((v, t) => v - dot(Z[t], b)), nz = Array.from({ length: k }, (_, j) => Z.reduce((s, r) => s + r[j] * r[j], 0) / n);
    for (let it = 0; it < (o.iters || 2000); it++) {
      let dmax = 0;
      for (let j = 0; j < k; j++) {
        if (nz[j] === 0) continue;
        let rho = 0; for (let t = 0; t < n; t++) rho += Z[t][j] * res[t]; rho = rho / n + nz[j] * b[j];
        const nb = Math.sign(rho) * Math.max(Math.abs(rho) - lam, 0) / nz[j], d = nb - b[j];
        if (d !== 0) { for (let t = 0; t < n; t++) res[t] -= Z[t][j] * d; b[j] = nb; dmax = Math.max(dmax, Math.abs(d) * Math.sqrt(nz[j])); }
      }
      if (dmax < (o.tol || 1e-10)) break;
    }
    return b;
  }
  const lassoPath = (Z, y, lams) => { let b = null; return lams.map((l) => (b = lasso(Z, y, l, { start: b }))); };   // lams descending: warm starts

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
  function auc(score, y) {                                            // Mann-Whitney with ties = 1/2
    const idx = score.map((_, i) => i).sort((a, b) => score[a] - score[b]); let rankSum = 0, i = 0, n1 = 0;
    while (i < idx.length) { let j = i; while (j + 1 < idx.length && score[idx[j + 1]] === score[idx[i]]) j++; const rk = (i + j) / 2 + 1; for (let m = i; m <= j; m++) if (y[idx[m]] === 1) { rankSum += rk; n1++; } i = j + 1; }
    const n0 = y.length - n1; return (rankSum - n1 * (n1 + 1) / 2) / (n1 * n0);
  }
  function roc(score, y) {                                            // points (fpr, tpr) from the highest score down, plus KS = max(tpr - fpr)
    const idx = score.map((_, i) => i).sort((a, b) => score[b] - score[a]), n1 = y.reduce((s, v) => s + v, 0), n0 = y.length - n1, fpr = [0], tpr = [0]; let tp = 0, fp = 0, ks = 0;
    for (let i = 0; i < idx.length; i++) {
      if (y[idx[i]] === 1) tp++; else fp++;
      if (i === idx.length - 1 || score[idx[i + 1]] !== score[idx[i]]) { fpr.push(fp / n0); tpr.push(tp / n1); ks = Math.max(ks, tp / n1 - fp / n0); }
    }
    const a = auc(score, y); return { fpr, tpr, auc: a, gini: 2 * a - 1, ks };
  }
  const logLoss = (p, y) => -mean(y.map((v, i) => v * Math.log(Math.max(p[i], 1e-12)) + (1 - v) * Math.log(Math.max(1 - p[i], 1e-12))));
  function calibration(p, y, bins = 10) {                             // equal-count bins by predicted probability
    const idx = p.map((_, i) => i).sort((a, b) => p[a] - p[b]), out = [];
    for (let b = 0; b < bins; b++) { const s = idx.slice(Math.floor(b * idx.length / bins), Math.floor((b + 1) * idx.length / bins)); out.push({ pred: mean(s.map((i) => p[i])), obs: mean(s.map((i) => y[i])), n: s.length }); }
    return out;
  }

  // ---------- regression trees and gradient boosting ----------
  function buildTree(X, g, h, idx, depth, o) {                        // leaf value = sum g / sum h (h = 1 gives the mean); split maximises sum_l^2/n_l + sum_r^2/n_r
    const leaf = () => { let sg = 0, sh = 0; for (const i of idx) { sg += g[i]; sh += h ? h[i] : 1; } return { v: sg / (sh + (o.reg || 0)) }; };
    if (depth >= o.maxDepth || idx.length < 2 * o.minLeaf) return leaf();
    let tot = 0; for (const i of idx) tot += g[i];
    let best = null;
    for (let f = 0; f < X[0].length; f++) {
      const s = idx.slice().sort((a, b) => X[a][f] - X[b][f]); let sl = 0;
      for (let m = 0; m < s.length - 1; m++) {
        sl += g[s[m]]; const nl = m + 1, nr = s.length - nl;
        if (X[s[m]][f] === X[s[m + 1]][f] || nl < o.minLeaf || nr < o.minLeaf) continue;
        const gain = sl * sl / nl + (tot - sl) ** 2 / nr; if (!best || gain > best.gain) best = { gain, f, t: (X[s[m]][f] + X[s[m + 1]][f]) / 2 };
      }
    }
    if (!best || best.gain <= tot * tot / idx.length + 1e-12) return leaf();
    const L = idx.filter((i) => X[i][best.f] <= best.t), Rr = idx.filter((i) => X[i][best.f] > best.t);
    return { f: best.f, t: best.t, l: buildTree(X, g, h, L, depth + 1, o), r: buildTree(X, g, h, Rr, depth + 1, o) };
  }
  const treePredict = (nd, x) => { while (nd.f !== undefined) nd = x[nd.f] <= nd.t ? nd.l : nd.r; return nd.v; };
  const treeFit = (X, y, o = {}) => buildTree(X, y, null, y.map((_, i) => i), 0, { maxDepth: o.maxDepth ?? 3, minLeaf: o.minLeaf ?? 20 });   // y in {0,1}: the leaf value is the default probability
  function boost(X, y, o = {}) {                                      // gradient boosting for the logistic loss (Newton leaf values), trees of depth o.depth
    const n = X.length, lr = o.lr ?? 0.1, T = o.trees ?? 100, p0 = mean(y), F0 = Math.log(p0 / (1 - p0)), F = Array(n).fill(F0), trees = [], idx = y.map((_, i) => i);
    for (let m = 0; m < T; m++) {
      const g = F.map((f, i) => y[i] - sigmoid(f)), h = F.map((f) => { const p = sigmoid(f); return Math.max(p * (1 - p), 1e-9); });
      const tr = buildTree(X, g, h, idx, 0, { maxDepth: o.depth ?? 2, minLeaf: o.minLeaf ?? 20, reg: 1 }); trees.push(tr);
      for (let i = 0; i < n; i++) F[i] += lr * treePredict(tr, X[i]);
    }
    const raw = (x, k = T) => { let f = F0; for (let m = 0; m < Math.min(k, T); m++) f += lr * treePredict(trees[m], x); return f; };
    return { raw, p: (x, k) => sigmoid(raw(x, k)), trees: T };
  }

  // ---------- Gaussian hidden Markov model (K states), Baum-Welch with scaled forward-backward ----------
  function hmm(r, K = 2, iters = 200) {
    const n = r.length, mu0 = mean(r), idx = r.map((_, i) => i).sort((a, b) => Math.abs(r[a] - mu0) - Math.abs(r[b] - mu0));
    let mu = [], sg = [], A = Array.from({ length: K }, (_, i) => Array.from({ length: K }, (_, j) => (i === j ? 0.95 : 0.05 / (K - 1)))), pi = Array(K).fill(1 / K);
    for (let k = 0; k < K; k++) { const s = idx.slice(Math.floor(k * n / K), Math.floor((k + 1) * n / K)).map((i) => r[i]); mu.push(mean(s)); sg.push(Math.sqrt(mean(s.map((v) => (v - mean(s)) ** 2))) || 1e-3); }
    const dens = (x, k) => Math.exp(-0.5 * ((x - mu[k]) / sg[k]) ** 2) / (sg[k] * Math.sqrt(2 * Math.PI)) + 1e-300;
    let ll = -Infinity, gam = null;
    for (let it = 0; it < iters; it++) {
      const al = [], c = [], B = r.map((x) => mu.map((_, k) => dens(x, k)));
      let a0 = pi.map((p, k) => p * B[0][k]), s0 = a0.reduce((a, b) => a + b, 0); c.push(s0); al.push(a0.map((v) => v / s0));
      for (let t = 1; t < n; t++) { const a = B[t].map((b, j) => b * al[t - 1].reduce((s, v, i) => s + v * A[i][j], 0)), s = a.reduce((x, y) => x + y, 0); c.push(s); al.push(a.map((v) => v / s)); }
      const be = Array(n); be[n - 1] = Array(K).fill(1);
      for (let t = n - 2; t >= 0; t--) be[t] = Array.from({ length: K }, (_, i) => A[i].reduce((s, a, j) => s + a * B[t + 1][j] * be[t + 1][j], 0) / c[t + 1]);
      gam = al.map((a, t) => a.map((v, k) => v * be[t][k]));
      const xi = Array.from({ length: K }, () => Array(K).fill(0));
      for (let t = 0; t < n - 1; t++) for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) xi[i][j] += al[t][i] * A[i][j] * B[t + 1][j] * be[t + 1][j] / c[t + 1];
      const nll = c.reduce((s, v) => s + Math.log(v), 0);
      pi = gam[0].slice(); A = xi.map((row) => { const s = row.reduce((a, b) => a + b, 0); return row.map((v) => v / s); });
      for (let k = 0; k < K; k++) { const w = gam.reduce((s, g) => s + g[k], 0); mu[k] = gam.reduce((s, g, t) => s + g[k] * r[t], 0) / w; sg[k] = Math.max(Math.sqrt(gam.reduce((s, g, t) => s + g[k] * (r[t] - mu[k]) ** 2, 0) / w), 1e-5); }
      if (Math.abs(nll - ll) < 1e-8) { ll = nll; break; } ll = nll;
    }
    const ord = sg.map((_, k) => k).sort((a, b) => sg[a] - sg[b]), pick = (arr) => ord.map((k) => arr[k]);
    return { K, mu: pick(mu), sigma: pick(sg), A: ord.map((i) => ord.map((j) => A[i][j])), prob: gam.map((g) => pick(g)), ll, stay: ord.map((i) => A[i][i]), duration: ord.map((i) => 1 / (1 - A[i][i])), aic: -2 * ll + 2 * (K * K - 1 + 2 * K), bic: -2 * ll + (K * K - 1 + 2 * K) * Math.log(n) };
  }

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

  Object.assign(Risk, { ml: { colStats, apply, r2, ridge, lasso, lassoPath, logistic, auc, roc, logLoss, calibration, treeFit, treePredict, boost, hmm, quantReg, sigmoid } });
  if (typeof module !== 'undefined' && module.exports) module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
