# Quantile-regression VaR (regress the quantile on risk indicators)
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
# pip install statsmodels
import numpy as np
import pandas as pd
import statsmodels.api as sm

@@RETS@@
cf = @@cf=0.99@@
df = pd.DataFrame({"r": r})
df["absr"] = df.r.abs().shift(1)                                        # yesterday's absolute return
df["vol"] = df.r.rolling(20).std().shift(1)    # yesterday's 20-day volatility
df = df.dropna()
X = sm.add_constant(df[["absr", "vol"]])
fit = sm.QuantReg(df.r, X).fit(q=1 - cf)
print(fit.params)
var_t = -float(fit.predict(X.iloc[[-1]]).iloc[0])
print(f"quantile-regression VaR {cf:.0%} for tomorrow: {var_t:.4%}")
exc = (df.r < fit.predict(X)).mean()
print("hit rate (should be", round(1 - cf, 4), "):", round(float(exc), 4))
