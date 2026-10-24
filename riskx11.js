'use strict';
/* Eleventh batch, added to Risk.x: structural credit risk of a collateralised loan (KMV distance to default, first-passage liquidation probability,
   empirical counterparts from a return history) and a loan-to-value migration matrix, in the style of CreditMetrics. */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); if (typeof require !== 'undefined' && !G.Risk) require('./riskx10.js');
  const X = Risk.x, { normCdf } = Risk, mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

  // Collateral V, debt D, ratio = V / D. Log collateral value is Brownian with drift mu - sigma^2/2 (mu, sigma annual), horizon T years.
  // KMV distance to default = (ln ratio + (mu - sigma^2 / 2) T) / (sigma sqrt T); default at T when V_T < D, probability Phi(-DD).
  // Liquidation can happen at any time: first passage of ln V below ln D (barrier b = -ln ratio < 0), P = Phi((b - mT)/s) + exp(2 m b / sigma^2) Phi((b + mT)/s), s = sigma sqrt T.
  function kmv(o) {
    const m = o.mu - 0.5 * o.sigma * o.sigma, s = o.sigma * Math.sqrt(o.T), b = -Math.log(o.ratio), dd = (Math.log(o.ratio) + m * o.T) / s;
    const touch = Math.abs(m) < 1e-12 ? 2 * normCdf(b / s) : normCdf((b - m * o.T) / s) + Math.exp(2 * m * b / (o.sigma * o.sigma)) * normCdf((b + m * o.T) / s);
    return { dd, pdEnd: normCdf(-dd), pdTouch: Math.min(1, touch) };
  }

  // Empirical counterpart from daily log returns lr: every overlapping window of h days is one possible future.
  // pdEnd = share of windows ending below the barrier; pdTouch = share crossing it on any day. Loss on a crossing (seen on the first day of crossing):
  // the collateral is sold at the day's level less a penalty, loss = max(0, 1 - (1 - pen) V / D). Returns the sorted losses of all windows (0 when not crossed).
  function empirical(lr, h, ratio, pen = 0) {
    const b = -Math.log(ratio), n = lr.length - h + 1, loss = []; let end = 0, touch = 0;
    for (let i = 0; i < n; i++) {
      let c = 0, hit = -1, atHit = 0; for (let j = 0; j < h; j++) { c += lr[i + j]; if (hit < 0 && c < b) { hit = j; atHit = c; } }
      if (c < b) end++; if (hit >= 0) { touch++; loss.push(Math.max(0, 1 - (1 - pen) * ratio * Math.exp(atHit))); } else loss.push(0);
    }
    return { n, pdEnd: end / n, pdTouch: touch / n, el: mean(loss), loss: loss.sort((x, y) => x - y) };
  }

  // Migration matrix of the loan-to-value ratio. edges = ascending LTV boundaries below the liquidation level liq; the states are the bands
  // [0, e1), [e1, e2) ... [e_k, liq) and "liquidated" (absorbing: LTV reached liq on some day of the window). A loan starting at the band mid-point
  // has LTV_t = ltv0 exp(-cum return). Rows sum to one; the last column is the probability of liquidation, loss the expected loss per band.
  function migration(lr, h, edges, liq, pen = 0) {
    const lo = [0, ...edges], hi = [...edges, liq], K = lo.length, mid = lo.map((a, i) => (a + hi[i]) / 2), n = lr.length - h + 1;
    const band = (x) => { for (let i = 0; i < K; i++) if (x < hi[i]) return i; return K; };
    const P = mid.map((l0) => {
      const row = new Array(K + 1).fill(0); let L = 0;
      for (let i = 0; i < n; i++) {
        let c = 0, hit = false; for (let j = 0; j < h; j++) { c += lr[i + j]; const l = l0 * Math.exp(-c); if (l >= liq) { hit = true; L += Math.max(0, 1 - (1 - pen) / l); break; } }
        row[hit ? K : band(l0 * Math.exp(-c))]++;
      }
      return { row: row.map((x) => x / n), loss: L / n };
    });
    return { P: P.map((r) => r.row), loss: P.map((r) => r.loss), mid, bands: lo.map((a, i) => [a, hi[i]]), n };
  }

  Object.assign(X, { kmv, empirical, migration });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
