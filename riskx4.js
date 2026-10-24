'use strict';
/* Fourth batch of risk maths, added to Risk.x: Euler risk contributions (component VaR, ES, incremental VaR), stressed-window search (sVaR),
   Higham nearest correlation matrix, DCC correlation filter. */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); if (typeof require !== 'undefined' && !G.Risk) require('./riskx3.js');
  const X = Risk.x, mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

  // ---------- Euler contributions, historical simulation ----------
  // R[t][i] asset returns, w weights. Loss L_t = -sum w_i R[t][i]. ES contributions are exact (average loss of asset i over the tail days) and add up to ES.
  // VaR contributions average asset i's loss over the days whose portfolio loss is nearest the quantile (2m+1 order statistics): they add up to VaR only approximately.
  
  
  

  // ---------- Stressed window ----------
  // historical ES of a rolling window of `win` days; the stressed period is the window with the largest ES
  
  

  // ---------- Higham (2002) nearest correlation matrix, Dykstra alternating projections ----------
  

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

  Object.assign(X, {       dccPath, dccFit });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
