'use strict';
/* Eighth batch, added to Risk.x: IFRS 9 expected credit loss (12-month vs lifetime, probability-weighted scenarios, staging cliff). */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); if (typeof require !== 'undefined' && !G.Risk) require('./riskx7.js');
  const X = Risk.x;

  // Loan of T years, annual instalments (level principal), annual hazard h = PD scaled by the scenario multiplier m (capped at 1).
  // ECL over the first n years = sum_t S(t-1) h LGD EAD(t) DF(t), EAD(t) = balance at the start of year t, default taken mid-year (DF at t - 0.5).
  function ecl(o) {
    const h = Math.min(0.999, o.pd * (o.mult ?? 1)), T = o.T, n = Math.min(T, o.years ?? T); let s = 1, tot = 0, pdCum = 0;
    for (let t = 1; t <= n; t++) { const ead = o.ead * (1 - (t - 1) / T), df = Math.pow(1 + o.eir, -(t - 0.5)); tot += s * h * o.lgd * ead * df; pdCum += s * h; s *= 1 - h; }
    return { ecl: tot, pdCum };
  }
  // scenarios: [{w, mult, lgdMult}], stage 1 = 12 months, stage 2/3 = lifetime (stage 3: PD = 1 on current balance).
  function eclWeighted(o) {
    let e = 0, e12 = 0, el = 0;
    for (const s of o.scenarios) {
      const b = { ...o, mult: s.mult, lgd: Math.min(1, o.lgd * (s.lgdMult ?? 1)) };
      const a = ecl({ ...b, years: 1 }).ecl, l = ecl({ ...b, years: o.T }).ecl; e12 += s.w * a; el += s.w * l;
    }
    e = o.stage === 1 ? e12 : o.stage === 2 ? el : o.ead * Math.min(1, o.lgd * (o.scenarios[0].lgdMult ?? 1));
    return { ecl: e, ecl12: e12, ecllife: el, coverage: e / o.ead };
  }
  Object.assign(X, { ecl, eclWeighted });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
