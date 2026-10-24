# How sure is your VaR? Order-statistic interval and bootstrap
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
import pandas as pd
from scipy import stats

# Daily returns: replace the synthetic series by your own (e.g. pd.read_csv("btc.csv")["close"].pct_change().dropna().values)
rng = np.random.default_rng(0)
r = rng.standard_t(4, 2500) * 0.02 / np.sqrt(2)

cf, B = 0.99, 750
loss = np.sort(-r[-B:])
N = len(loss)
var = np.quantile(loss, cf)

# 1. Distribution-free 95% interval from the binomial law of order statistics
lo = int(stats.binom.ppf(0.025, N, cf)); hi = int(stats.binom.ppf(0.975, N, cf))
print(f"VaR {cf:.0%} = {var:.4%}; order-statistic 95% CI [{loss[max(lo - 1, 0)]:.4%}, {loss[min(hi, N - 1)]:.4%}]")

# 2. Bootstrap (iid resampling; use block resampling with blocks of ~10 days if returns are autocorrelated)
rng = np.random.default_rng(1)
boot = [np.quantile(rng.choice(loss, N), cf) for _ in range(2000)]
print(f"bootstrap 95% CI [{np.quantile(boot, .025):.4%}, {np.quantile(boot, .975):.4%}]")
