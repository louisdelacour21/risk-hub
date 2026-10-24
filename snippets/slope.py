# Yield-curve slope as a recession signal (probit)
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
# pip install statsmodels
import numpy as np
import statsmodels.api as sm

rng = np.random.default_rng(0)
n = 600
slope = rng.normal(1.0, 1.0, n)                                            # 10y - 3m spread, in %  (replace by FRED data: T10Y3M)
p = 1 / (1 + np.exp(-(-1.2 - 1.1 * slope)))
recession_in_12m = rng.random(n) < p
fit = sm.Probit(recession_in_12m.astype(int), sm.add_constant(slope)).fit(disp=False)
print(fit.params)
for s in (-1.0, 0.0, 1.0, 2.0):
    print(f"slope {s:+.1f}% -> P(recession in 12 months) = {fit.predict([[1, s]])[0]:.1%}")
