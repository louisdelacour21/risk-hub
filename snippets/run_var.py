# VaR and Expected Shortfall: historical, parametric (normal), Monte-Carlo
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy.stats import norm

@@RETS@@
cf = 0.99                      # confidence level
loss = -r                      # losses are positive numbers

# 1. Historical simulation
var_h = np.quantile(loss, cf)
es_h = loss[loss >= var_h].mean()

# 2. Parametric normal
mu, sd = r.mean(), r.std(ddof=1)
var_n = -(mu + sd * norm.ppf(1 - cf))
es_n = -mu + sd * norm.pdf(norm.ppf(1 - cf)) / (1 - cf)

# 3. Monte-Carlo (normal draws; swap in a fat-tailed law to be more realistic)
sim = rng.normal(mu, sd, 200_000)
var_m = np.quantile(-sim, cf)
es_m = (-sim)[-sim >= var_m].mean()

for name, v, e in [("historical", var_h, es_h), ("normal", var_n, es_n), ("monte-carlo", var_m, es_m)]:
    print(f"{name:12s} VaR {cf:.0%} = {v:.4%}   ES = {e:.4%}")

# Kupiec backtest (unconditional coverage) on the same series
from scipy.stats import chi2
x = int((loss > var_h).sum()); N = len(loss); p = 1 - cf
lr = -2 * (np.log((1 - p) ** (N - x) * p ** x) - np.log((1 - x / N) ** (N - x) * (x / N) ** x)) if 0 < x < N else np.nan
print(f"exceptions {x}/{N}, Kupiec LR = {lr:.3f}, p-value = {1 - chi2.cdf(lr, 1):.3f}")
