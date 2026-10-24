# Unit roots (Augmented Dickey-Fuller) and spurious regression
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
# pip install statsmodels
import numpy as np
import statsmodels.api as sm
from statsmodels.tsa.stattools import adfuller

rng = np.random.default_rng(0)
price_a = np.cumsum(rng.normal(0, 1, 1000)); price_b = np.cumsum(rng.normal(0, 1, 1000))   # two unrelated random walks
for name, s in [("price", price_a), ("return", np.diff(price_a))]:
    stat, p, *_ = adfuller(s, regression="c", autolag="AIC")
    print(f"ADF on {name}: stat {stat:.2f}, p-value {p:.3f}  ({'stationary' if p < 0.05 else 'unit root not rejected'})")

fit = sm.OLS(price_a, sm.add_constant(price_b)).fit()
print(f"spurious regression: R2 {fit.rsquared:.2f}, slope t-stat {fit.tvalues[1]:.1f}, Durbin-Watson {sm.stats.durbin_watson(fit.resid):.2f}")
