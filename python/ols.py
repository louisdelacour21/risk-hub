# Regression with diagnostics (HAC errors, Durbin-Watson, Breusch-Pagan, Jarque-Bera)
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
# pip install statsmodels
import numpy as np
import statsmodels.api as sm
from statsmodels.stats.diagnostic import het_breuschpagan
from statsmodels.stats.stattools import durbin_watson, jarque_bera

rng = np.random.default_rng(0)
x = rng.standard_t(5, 1500) * 0.01
y = 0.0003 + 0.8 * x + rng.normal(0, 0.01, 1500)
X = sm.add_constant(x)
fit = sm.OLS(y, X).fit(cov_type="HAC", cov_kwds={"maxlags": 5})
print(fit.summary())
print("Durbin-Watson:", durbin_watson(fit.resid))
print("Breusch-Pagan p-value:", het_breuschpagan(fit.resid, X)[1])
print("Jarque-Bera p-value:", jarque_bera(fit.resid)[1])
