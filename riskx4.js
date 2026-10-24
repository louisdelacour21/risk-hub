'use strict';
/* Fourth batch of risk maths, added to Risk.x: Euler risk contributions (component VaR, ES, incremental VaR), stressed-window search (sVaR),
   Higham nearest correlation matrix, DCC correlation filter. */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); if (typeof require !== 'undefined' && !G.Risk) require('./riskx3.js');
  const X = Risk.x, mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

  // ---------- Euler contributions, historical simulation ----------
  // R[t][i] asset returns, w weights. Loss L_t = -sum w_i R[t][i]. ES contributions are exact (average loss of asset i over the tail days) and add up to ES.
  // VaR contributions average asset i's loss over the days whose portfolio loss is nearest the quantile (2m+1 order statistics): they add up to VaR only approximately.
  const contrib = (R, w, conf) => {
    const T = R.length, n = w.length, L = R.map((row) => -row.reduce((s, x, i) => s + w[i] * x, 0)), idx = L.map((_, t) => t).sort((a, b) => L[a] - L[b]);
    const k = Math.max(1, Math.ceil((1 - conf) * T)), q = T - k, tail = idx.slice(q), m = Math.max(3, Math.round(0.01 * T)), near = idx.slice(Math.max(0, q - m), Math.min(T, q + m + 1));
    const comp = (days) => Array.from({ length: n }, (_, i) => mean(days.map((t) => -w[i] * R[t][i])));
    return { var: L[idx[q]], es: mean(tail.map((t) => L[t])), cVar: comp(near), cEs: comp(tail), L };
  };
  const portVar = (R, w, conf) => { const L = R.map((row) => -row.reduce((s, x, i) => s + w[i] * x, 0)).sort((a, b) => a - b); return L[Math.min(L.length - 1, Math.ceil(conf * L.length) - 1)]; };
  const incrementalVar = (R, w, conf) => { const base = portVar(R, w, conf); return w.map((_, i) => base - portVar(R, w.map((x, j) => (j === i ? 0 : x)), conf)); };

  // ---------- Stressed window ----------
  // historical ES of a rolling window of `win` days; the stressed period is the window with the largest ES
  const rollingEs = (r, win, conf) => {
    const out = [], k = Math.max(1, Math.ceil((1 - conf) * win));
    for (let s = 0; s + win <= r.length; s++) { const a = r.slice(s, s + win).sort((x, y) => x - y); out.push(-mean(a.slice(0, k))); }
    return out;
  };
  const stressedWindow = (r, win, conf) => { const es = rollingEs(r, win, conf); let b = 0; for (let i = 1; i < es.length; i++) if (es[i] > es[b]) b = i; return { es, start: b, max: es[b] }; };

  // ---------- Higham (2002) nearest correlation matrix, Dykstra alternating projections ----------
  const higham = (A, tol = 1e-10, maxIt = 500) => {
    const n = A.length, sub = (P, Q) => P.map((r, i) => r.map((x, j) => x - Q[i][j]));
    const psd = (M) => { const e = X.eigSym(M), O = Array.from({ length: n }, () => new Array(n).fill(0)); e.vals.forEach((v, m) => { if (v > 0) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) O[i][j] += v * e.vecs[m][i] * e.vecs[m][j]; }); return O; };
    let Y = A.map((r) => r.slice()), dS = A.map((r) => r.map(() => 0)), it = 0;
    for (; it < maxIt; it++) {
      const Rm = sub(Y, dS), Xp = psd(Rm); dS = sub(Xp, Rm);
      const Yn = Xp.map((r, i) => r.map((x, j) => (i === j ? 1 : x))); let d = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) d = Math.max(d, Math.abs(Yn[i][j] - Y[i][j]));
      Y = Yn; if (d < tol) { it++; break; }
    }
    let dist = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) dist += (Y[i][j] - A[i][j]) ** 2;
    return { C: Y, iters: it, dist: Math.sqrt(dist), minEig: X.eigSym(Y).vals.slice(-1)[0] };
  };

  // ---------- DCC (Engle 2002) on two standardised residual series ----------
  // Q_t = (1-a-b) Qbar + a z z' + b Q_(t-1); rho_t = q12 / sqrt(q11 q22). (a, b) by grid on the correlation log-likelihood.
  const dccPath = (z1, z2, a, b, qb) => {
    let q11 = 1, q22 = 1, q12 = qb; const rho = [];
    for (let t = 0; t < z1.length; t++) {
      rho.push(q12 / Math.sqrt(q11 * q22));
      q11 = (1 - a - b) + a * z1[t] ** 2 + b * q11; q22 = (1 - a - b) + a * z2[t] ** 2 + b * q22; q12 = (1 - a - b) * qb + a * z1[t] * z2[t] + b * q12;
    }
    return { rho, next: q12 / Math.sqrt(q11 * q22) };
  };
  const dccFit = (z1, z2) => {
    const T = z1.length, qb = z1.reduce((s, x, t) => s + x * z2[t], 0) / Math.sqrt(z1.reduce((s, x) => s + x * x, 0) * z2.reduce((s, x) => s + x * x, 0));
    const ll = (a, b) => { const { rho } = dccPath(z1, z2, a, b, qb); let s = 0; for (let t = 0; t < T; t++) { const r = Math.min(0.999, Math.max(-0.999, rho[t])), d = 1 - r * r; s -= 0.5 * (Math.log(d) + (z1[t] ** 2 + z2[t] ** 2 - 2 * r * z1[t] * z2[t]) / d); } return s; };
    let best = { a: 0, b: 0, ll: ll(0, 0) };
    for (let a = 0; a <= 0.2001; a += 0.01) for (let b = 0.5; b <= 0.995 && a + b < 0.999; b += 0.01) { const l = ll(a, b); if (l > best.ll) best = { a, b, ll: l }; }
    const p = dccPath(z1, z2, best.a, best.b, qb);
    return { ...best, ll0: ll(0, 0), qbar: qb, rho: p.rho, next: p.next };
  };

  Object.assign(X, { contrib, portVar, incrementalVar, rollingEs, stressedWindow, higham, dccPath, dccFit });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
