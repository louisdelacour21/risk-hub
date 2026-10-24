'use strict';
/* Eighth batch, added to Risk.x: IFRS 9 expected credit loss (12-month vs lifetime, probability-weighted scenarios, staging cliff). */
((G) => {
  const Risk = G.Risk || require('./riskx.js'); if (typeof require !== 'undefined' && !G.Risk) require('./riskx7.js');
  const X = Risk.x;

  // Loan of T years, annual instalments (level principal), annual hazard h = PD scaled by the scenario multiplier m (capped at 1).
  // ECL over the first n years = sum_t S(t-1) h LGD EAD(t) DF(t), EAD(t) = balance at the start of year t, default taken mid-year (DF at t - 0.5).
  
  // scenarios: [{w, mult, lgdMult}], stage 1 = 12 months, stage 2/3 = lifetime (stage 3: PD = 1 on current balance).
  
  Object.assign(X, {  });
  if (typeof module !== 'undefined') module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
