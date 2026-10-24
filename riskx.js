'use strict';
/* Risk, second wave: operational-risk LDA, Merton structural credit, swap exposure and XVA (Vasicek), FRTB liquidity-horizon ES, LCR / NSFR,
   reverse stress test, hierarchical risk parity, Basel IRB capital and IFRS 9 ECL, rating-transition matrices.
   Pure functions, no DOM, tested under Node (test-riskx.js) and against independent Python code (tools/verify_riskx.py). Extends Risk (after quant.js). */
(function (root) {
  const Risk = root.Risk || require('./quant.js');
  const { normCdf: N, normInv: Ninv, mean } = Risk;
  const quantile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];

  // ---------- operational risk: loss distribution approach ----------
  function poisson(R, lam) { if (lam > 30) return Math.max(0, Math.round(lam + Math.sqrt(lam) * R.n())); const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= R.u(); } while (p > L); return k - 1; }
  function gammaDraw(R, a) {                                            // Marsaglia-Tsang
    if (a < 1) return gammaDraw(R, a + 1) * Math.pow(R.u(), 1 / a);
    const d = a - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) { let x, v; do { x = R.n(); v = 1 + c * x; } while (v <= 0); v = v * v * v; const u = R.u(); if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; }
  }
  /* o = {lam, disp (0 = Poisson, else negative-binomial variance/mean excess), mu, sigma, xi (0 = pure lognormal), q (body/tail split quantile), n, seed}
     severity: lognormal body; above the q-quantile u the excess follows a generalised Pareto with shape xi and scale beta = sigma-matched below. */
  function lda(o) {
    const R = Risk.rng(o.seed || 7), n = o.n || 50000, u = Math.exp(o.mu + o.sigma * Ninv(o.q || 0.9)), beta = o.beta || u * 0.5;
    const sev = () => { const x = Math.exp(o.mu + o.sigma * R.n()); if (!o.xi || x <= u) return x; return u + beta * (Math.pow(1 - R.u(), -o.xi) - 1) / o.xi; };
    const years = new Float64Array(n), counts = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const lam = o.disp > 0 ? gammaDraw(R, o.lam / o.disp) * o.disp : o.lam, k = poisson(R, lam); let s = 0; for (let j = 0; j < k; j++) s += sev(); years[i] = s; counts[i] = k;
    }
    const sorted = Float64Array.from(years).sort(), tail = (p) => { const k = Math.ceil(n * (1 - p)); let s = 0; for (let i = n - k; i < n; i++) s += sorted[i]; return s / k; };
    const meanSev = o.xi ? null : Math.exp(o.mu + o.sigma ** 2 / 2);
    return { years, sorted, mean: mean(Array.from(sorted)), var: (p) => quantile(sorted, p), es: tail, meanSev, countMean: mean(Array.from(counts)),
      sla: meanSev ? (p) => Math.exp(o.mu + o.sigma * Ninv(1 - (1 - p) / o.lam)) + (o.lam - 1) * meanSev : null };   // single-loss approximation (Bocker-Kluppelberg) for the Poisson-lognormal case
  }

  // ---------- Merton structural credit ----------
  const mertonEq = (V, D, r, T, s) => { const d1 = (Math.log(V / D) + (r + s * s / 2) * T) / (s * Math.sqrt(T)), d2 = d1 - s * Math.sqrt(T); return { E: V * N(d1) - D * Math.exp(-r * T) * N(d2), d1, d2 }; };
  function merton(E, sigE, D, r, T) {                                   // invert the two equations E = call(V), sigE*E = N(d1)*sigV*V by fixed point on sigV
    let s = sigE * E / (E + D), V = E + D;
    for (let it = 0; it < 500; it++) {
      let lo = E, hi = E + D * 3; for (let k = 0; k < 100; k++) { const mid = (lo + hi) / 2; mertonEq(mid, D, r, T, s).E > E ? (hi = mid) : (lo = mid); }
      V = (lo + hi) / 2; const { d1 } = mertonEq(V, D, r, T, s), sNew = sigE * E / (V * N(d1)); if (Math.abs(sNew - s) < 1e-12) { s = sNew; break; } s = 0.5 * s + 0.5 * sNew;
    }
    const { d1, d2 } = mertonEq(V, D, r, T, s), debt = V - E, y = -Math.log(debt / D) / T;
    return { V, sigV: s, d1, d2, pdRN: N(-d2), debt, yield: y, spread: y - r, lev: D / V, dd: (mu) => (Math.log(V / D) + (mu - s * s / 2) * T) / (s * Math.sqrt(T)) };
  }

  // ---------- swap exposure and XVA under Vasicek ----------
  const vasBond = (r, tau, a, b, s) => { if (tau <= 1e-12) return 1; const B = (1 - Math.exp(-a * tau)) / a; return Math.exp((b - s * s / (2 * a * a)) * (B - tau) - s * s * B * B / (4 * a) - B * r); };
  /* o = {r0, a, b, sig, T, K (null = par), pay (+1 payer fixed, -1 receiver), paths, seed, hCp, lgdCp, hOwn, lgdOwn, fund, mpor (months), thr (null = no CSA), omega (wrong-way)}; monthly grid, annual fixed leg. */
  function swapXva(o) {
    const { r0, a, b, sig, T } = o, dt = 1 / 12, N_ = Math.round(T * 12), P = o.paths || 4000, R = Risk.rng(o.seed || 11), pay = o.pay || 1;
    const dates = Array.from({ length: Math.ceil(T) }, (_, i) => i + 1), ann = dates.reduce((s, d) => s + vasBond(r0, d, a, b, sig), 0), K = o.K ?? (1 - vasBond(r0, T, a, b, sig)) / ann;
    const value = (t, r, rr) => {                                        // float leg = P(t,Ti)/P(Tprev,Ti) - P(t,T) (rate fixed at the last reset), fixed leg = K * sum of the remaining P(t,Tj)
      const i = Math.floor(t + 1e-9) + 1; if (i > T) return 0; let fx = 0; for (const d of dates) if (d >= i) fx += vasBond(r, d - t, a, b, sig);
      return pay * (vasBond(r, i - t, a, b, sig) / vasBond(rr, 1, a, b, sig) - vasBond(r, T - t, a, b, sig) - K * fx);
    };
    const m = o.mpor || 0, csa = o.thr != null, H = o.thr || 0, sdStat = sig / Math.sqrt(2 * a), ee = Array(N_ + 1).fill(0), ene = Array(N_ + 1).fill(0), eeD = Array(N_ + 1).fill(0), eneD = Array(N_ + 1).fill(0), cvaP = [], ex = Array.from({ length: N_ + 1 }, () => new Float32Array(P));
    const ex0 = Math.exp(-a * dt), sd = sig * Math.sqrt((1 - Math.exp(-2 * a * dt)) / (2 * a));
    let cva = 0, dva = 0, fca = 0, fba = 0, zs = [];
    for (let p = 0; p < P; p++) {
      const sgn = p % 2 ? -1 : 1; if (!(p % 2)) zs = Array.from({ length: N_ }, () => R.n());
      let r = r0, D = 1, S = 1, Sown = 1, rPrev = r0, rr = r0, pc = 0; const V = [value(0, r0, r0)];
      for (let k = 1; k <= N_; k++) {
        r = r * ex0 + b * (1 - ex0) + sd * sgn * zs[k - 1]; D *= Math.exp(-0.5 * (r + rPrev) * dt); rPrev = r; if (k % 12 === 0) rr = r; V.push(value(k * dt, r, rr));
        const C = !csa || k - m < 0 ? 0 : (() => { const v = V[k - m]; return v > H ? v - H : v < -H ? v + H : 0; })(), expo = V[k] - C, pos = Math.max(expo, 0), neg = Math.max(-expo, 0);
        const h = o.hCp * Math.exp((o.omega || 0) * (r - r0) / sdStat), dS = S * (1 - Math.exp(-h * dt)); S -= dS;
        const dSo = Sown * (1 - Math.exp(-o.hOwn * dt)); Sown -= dSo;
        pc += o.lgdCp * D * pos * dS; dva += o.lgdOwn * D * neg * dSo / P; fca += o.fund * D * pos * dt / P; fba += o.fund * D * neg * dt / P;
        ee[k] += pos / P; ene[k] += neg / P; eeD[k] += D * pos / P; eneD[k] += D * neg / P; ex[k][p] = pos;
      }
      cva += pc / P; cvaP.push(pc);
    }
    const mC = mean(cvaP), se = Math.sqrt(cvaP.reduce((s, x) => s + (x - mC) ** 2, 0) / (P - 1) / P);
    const pfe = ex.map((arr) => { const s = Float32Array.from(arr).sort(); return s[Math.min(P - 1, Math.floor(0.975 * P))]; });
    return { K, t: Array.from({ length: N_ + 1 }, (_, k) => k * dt), ee, ene, eeD, eneD, pfe, cva, cvaSe: se, dva, fca, fba, fva: fca - fba, epe: mean(ee.slice(1)), peak: Math.max(...ee) };
  }

  // ---------- FRTB expected shortfall with liquidity horizons ----------
  const LHS = [10, 20, 40, 60, 120];
  

  // ---------- liquidity regulation ----------
  const LCR_OUT = [['retail_stable', 'Retail deposits, stable', 0.05], ['retail_less', 'Retail deposits, less stable', 0.10], ['corp_op', 'Corporate deposits, operational', 0.25], ['corp_non', 'Corporate deposits, non-operational', 0.40], ['fin', 'Financial-institution deposits', 1.00], ['lines', 'Undrawn committed credit lines', 0.10], ['secured', 'Secured funding maturing in 30 days', 0.25]];
  const LCR_IN = [['loans', 'Performing loans maturing in 30 days', 0.50], ['reverse', 'Reverse repos, unencumbered', 1.00]];
  
  const NSFR_ASF = [['cap', 'Regulatory capital', 1.00], ['ret_stable', 'Retail deposits, stable', 0.95], ['ret_less', 'Retail deposits, less stable', 0.90], ['wh_op', 'Operational and corporate deposits', 0.50], ['wh_st', 'Wholesale funding under 6 months', 0.00], ['lt', 'Funding over 1 year', 1.00]];
  const NSFR_RSF = [['hq1', 'Level 1 assets', 0.05], ['hq2', 'Level 2 assets', 0.15], ['mort', 'Residential mortgages', 0.65], ['corp', 'Corporate loans', 0.85], ['other', 'Other assets, equities, fixed assets', 1.00], ['off', 'Off-balance sheet commitments', 0.05]];
  

  // ---------- reverse stress test ----------
  

  // ---------- hierarchical risk parity, min-variance, max-diversification ----------
  
  

  // ---------- Basel IRB capital and IFRS 9 ----------
  
  const RATINGS = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'D'];
  const TRANS = [[90.81, 8.33, 0.68, 0.06, 0.12, 0, 0, 0], [0.70, 90.65, 7.79, 0.64, 0.06, 0.14, 0.02, 0], [0.09, 2.27, 91.05, 5.52, 0.74, 0.26, 0.01, 0.06], [0.02, 0.33, 5.95, 86.93, 5.30, 1.17, 0.12, 0.18], [0.03, 0.14, 0.67, 7.73, 80.53, 8.84, 1.00, 1.06], [0, 0.11, 0.24, 0.43, 6.48, 83.46, 4.07, 5.20], [0.22, 0, 0.22, 1.30, 2.38, 11.24, 64.86, 19.79], [0, 0, 0, 0, 0, 0, 0, 100]].map((r) => { const s = r.reduce((a, b) => a + b, 0); return r.map((x) => x / s); });
  
     // out[y-1][i] = P(default within y years | start rating i)
  

  Object.assign(Risk, { x: { poisson, gammaDraw, lda, mertonEq, merton, vasBond, swapXva,  LHS,   LCR_OUT, LCR_IN, NSFR_ASF, NSFR_RSF,     RATINGS, TRANS,   } });
  if (typeof module !== 'undefined' && module.exports) module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
