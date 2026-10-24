'use strict';
/* Second batch of risk maths, added to Risk.x: CDS bootstrap, CreditRisk+, SA-CCR, KVA/MVA, model-risk pricers (Black-Scholes, Merton jumps, Heston). */
((G) => {
  const Risk = G.Risk || require('./riskx.js');
  const { normCdf } = Risk;

  // ---------- Black-Scholes and implied volatility ----------
  const bs = (S, K, T, r, s, call = true) => {
    const d1 = (Math.log(S / K) + (r + 0.5 * s * s) * T) / (s * Math.sqrt(T)), d2 = d1 - s * Math.sqrt(T), c = S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
    return call ? c : c - S + K * Math.exp(-r * T);
  };
  const impVol = (price, S, K, T, r) => { let lo = 1e-4, hi = 4; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (bs(S, K, T, r, m) > price) hi = m; else lo = m; } return (lo + hi) / 2; };

  // ---------- Merton jump-diffusion, Poisson series ----------
  const mertonJump = (S, K, T, r, s, lam, muJ, sJ) => {
    const k = Math.exp(muJ + 0.5 * sJ * sJ) - 1, lp = lam * (1 + k); let p = 0, w = Math.exp(-lp * T);
    for (let n = 0; n < 60; n++) { if (n) w *= (lp * T) / n; p += w * bs(S, K, T, r - lam * k + (n * Math.log(1 + k)) / T, Math.sqrt(s * s + (n * sJ * sJ) / T)); }
    return p;
  };

  // ---------- Heston call by Lewis integration (little-trap characteristic function) ----------
  const cm = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]], cd = (a, b) => { const q = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / q, (a[1] * b[0] - a[0] * b[1]) / q]; };
  const cexp = (a) => { const e = Math.exp(a[0]); return [e * Math.cos(a[1]), e * Math.sin(a[1])]; }, clog = (a) => [Math.log(Math.hypot(a[0], a[1])), Math.atan2(a[1], a[0])];
  const csqrt = (a) => { const m = Math.sqrt(Math.hypot(a[0], a[1])), t = Math.atan2(a[1], a[0]) / 2; return [m * Math.cos(t), m * Math.sin(t)]; };
  // characteristic function of ln(S_T/S0) under Q at complex argument z (little-trap form, Albrecher et al.)
  const hestonCf = (z, T, r, p) => {
    const { v0, kappa, theta, xi, rho } = p, w = [-z[1], z[0]], bb = [kappa - rho * xi * w[0], -rho * xi * w[1]], zz = cm(z, z), bb2 = cm(bb, bb);
    const d = csqrt([bb2[0] + xi * xi * (w[0] + zz[0]), bb2[1] + xi * xi * (w[1] + zz[1])]), bm = [bb[0] - d[0], bb[1] - d[1]], g = cd(bm, [bb[0] + d[0], bb[1] + d[1]]);
    const edT = cexp([-d[0] * T, -d[1] * T]), num = [1 - g[0] * edT[0] + g[1] * edT[1], -(g[0] * edT[1] + g[1] * edT[0])], den = [1 - g[0], -g[1]], lg = clog(cd(num, den));
    const A = cm([(kappa * theta) / (xi * xi), 0], [bm[0] * T - 2 * lg[0], bm[1] * T - 2 * lg[1]]), B = cm(cd(bm, [xi * xi, 0]), cd([1 - edT[0], -edT[1]], num));
    return cexp([A[0] + v0 * B[0] + w[0] * r * T, A[1] + v0 * B[1] + w[1] * r * T]);
  };
  // Lewis (2001): C = S - sqrt(S K) e^{-rT/2} / pi * int_0^inf Re[e^{iu k} phi_F(u - i/2)] / (u^2 + 1/4) du, with phi_F the cf of ln(S_T/F) and k = ln(F/K)
  const hestonCall = (S, K, T, r, p) => {
    const k = Math.log(S / K) + r * T, N = 3000, U = 300, h = U / N; let s = 0;
    for (let i = 0; i <= N; i++) {
      const u = i * h, c = hestonCf([u, -0.5], T, r, p), adj = cexp([-0.5 * r * T, -u * r * T]), f = cm(cm(cexp([0, u * k]), c), adj)[0] / (u * u + 0.25);
      s += (i === 0 || i === N ? 0.5 : 1) * f;
    }
    return S - (Math.sqrt(S * K) * Math.exp(-r * T / 2) / Math.PI) * s * h;
  };

  // ---------- CDS: hazard bootstrap and pricing ----------
  // flat-forward piecewise-constant hazard; premium paid quarterly, accrual-on-default ignored in the bootstrap, continuous protection leg
  const cdsLegs = (T, h, r, R) => {
    // h: array of {t, h} piecewise hazard; returns {prem (risky annuity), prot}
    const hz = (t) => { let acc = 0, prev = 0; for (const seg of h) { const a = Math.min(t, seg.t); if (a > prev) acc += seg.h * (a - prev); prev = Math.max(prev, seg.t); if (t <= seg.t) return acc; } return acc + h[h.length - 1].h * (t - prev); };
    const dt = 0.25, n = Math.round(T / dt); let prem = 0, prot = 0, qPrev = 1;
    for (let i = 1; i <= n; i++) { const t = i * dt, q = Math.exp(-hz(t)), df = Math.exp(-r * t), dfm = Math.exp(-r * (t - dt / 2)); prem += dt * df * q; prot += (1 - R) * dfm * (qPrev - q); qPrev = q; }
    return { prem, prot, surv: Math.exp(-hz(T)) };
  };
  const cdsBootstrap = (tenors, spreads, r, R) => {
    const h = [];
    for (let j = 0; j < tenors.length; j++) {
      let lo = 1e-6, hi = 5; const s = spreads[j];
      for (let it = 0; it < 80; it++) { const m = (lo + hi) / 2, L = cdsLegs(tenors[j], [...h, { t: tenors[j], h: m }], r, R); if (L.prot - s * L.prem > 0) hi = m; else lo = m; }
      h.push({ t: tenors[j], h: (lo + hi) / 2 });
    }
    return h;
  };
  const cdsPv = (T, coupon, h, r, R) => { const L = cdsLegs(T, h, r, R); return { pv: L.prot - coupon * L.prem, par: L.prot / L.prem, rpv01: L.prem, surv: L.surv }; };

  // ---------- CreditRisk+ (gamma-mixed Poisson, Panjer recursion) ----------
  // loans: [{nu: integer exposure bands, p: default probability}], sig2: variance of the common gamma factor (mean 1)
  const creditRiskPlus = (loans, sig2, nMax) => {
    const mu = loans.reduce((s, l) => s + l.p, 0), maxNu = Math.max(...loans.map((l) => l.nu)), f = Array(maxNu + 1).fill(0);
    for (const l of loans) f[l.nu] += l.p / mu;
    let a, b, g0;
    if (sig2 < 1e-9) { a = 0; b = mu; g0 = Math.exp(-mu); } else { const r = 1 / sig2, pn = 1 / (1 + sig2 * mu); a = 1 - pn; b = (r - 1) * (1 - pn); g0 = Math.pow(pn, r); }
    const g = new Float64Array(nMax + 1); g[0] = g0;
    for (let n = 1; n <= nMax; n++) { let s = 0; for (let j = 1; j <= Math.min(n, maxNu); j++) if (f[j]) s += (a + (b * j) / n) * f[j] * g[n - j]; g[n] = s; }
    const cdf = []; let c = 0; for (let n = 0; n <= nMax; n++) { c += g[n]; cdf.push(c); }
    const q = (p) => { for (let n = 0; n <= nMax; n++) if (cdf[n] >= p) return n; return nMax; };
    const mean = g.reduce((s, x, n) => s + x * n, 0), es = (p) => { const v = q(p); let t = 0, w = 0; for (let n = v + 1; n <= nMax; n++) { t += g[n] * n; w += g[n]; } const lft = cdf[v] - p; return (t + lft * v) / (w + lft || 1); };
    return { pmf: g, cdf, mean, q, es, mass: c, el: loans.reduce((s, l) => s + l.p * l.nu, 0) };
  };

  // ---------- SA-CCR for interest-rate swaps ----------
  // trades: [{N notional, S start (years from now, >=0), E end, dir +1/-1, mtm}]. Margined: variation margin with threshold th and mpor days.
  const saccr = (trades, o = {}) => {
    const sd = (S, E) => (Math.exp(-0.05 * S) - Math.exp(-0.05 * E)) / 0.05, buckets = [0, 0, 0], margined = o.margined, mpor = o.mpor ?? 10;
    let V = 0;
    for (const t of trades) {
      V += t.mtm; const M = Math.max(t.E, 10 / 250), mf = margined ? 1.5 * Math.sqrt(Math.max(mpor, 10) / 250) : Math.sqrt(Math.min(M, 1)), d = t.N * sd(Math.max(0, t.S), t.E), k = t.E <= 1 ? 0 : t.E <= 5 ? 1 : 2;
      buckets[k] += t.dir * d * mf;
    }
    const [D1, D2, D3] = buckets, eff = Math.sqrt(D1 * D1 + D2 * D2 + D3 * D3 + 1.4 * D1 * D2 + 1.4 * D2 * D3 + 0.6 * D1 * D3), addon = 0.005 * eff, C = o.collateral || 0;
    const mult = Math.min(1, 0.05 + 0.95 * Math.exp((V - C) / (2 * 0.95 * (addon || 1e-12)))), pfe = mult * addon;
    const rc = margined ? Math.max(V - C, (o.th || 0) + (o.mta || 0), 0) : Math.max(V - C, 0);
    return { V, buckets, eff, addon, mult, pfe, rc, ead: 1.4 * (rc + pfe) };
  };

  // ---------- KVA and MVA proxies on top of a swapXva result ----------
  // KVA = hurdle * sum D(t) * K(t) dt, K(t) = 8% * RW * 1.4 * EE(t); MVA = funding * sum D(t) * IM(t) dt, IM(t) = z99 * annuity(t) * sigma * sqrt(10/252) (sensitivity proxy)
  const kvaMva = (x, o) => {
    const dt = x.t[1] - x.t[0], T = x.t[x.t.length - 1]; let kva = 0, mva = 0; const im = [], cap = [];
    for (let k = 1; k < x.t.length; k++) {
      const t = x.t[k], D = Math.exp(-o.r0 * t), ann = (1 - Math.exp(-o.r0 * (T - t))) / o.r0, IM = Risk.normInv(0.99) * ann * o.sig * Math.sqrt(10 / 252), K = 0.08 * o.rw * 1.4 * x.ee[k];
      im.push(IM); cap.push(K); kva += o.hurdle * D * K * dt; mva += o.fund * D * IM * dt;
    }
    return { kva, mva, im, cap };
  };

  Object.assign(Risk.x, { bs, impVol, mertonJump, hestonCall, cdsLegs, cdsBootstrap, cdsPv, creditRiskPlus, saccr, kvaMva });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
