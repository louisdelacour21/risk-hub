# Drawdown risk: maximum drawdown and CDaR
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
import pandas as pd
from scipy import stats

# Daily returns: replace the synthetic series by your own (e.g. pd.read_csv("btc.csv")["close"].pct_change().dropna().values)
rng = np.random.default_rng(0)
r = rng.standard_t(4, 2500) * 0.02 / np.sqrt(2)

cf = 0.95
wealth = np.cumprod(1 + r)
dd = 1 - wealth / np.maximum.accumulate(wealth)                    # drawdown series (positive numbers)
dar = np.quantile(dd, cf)
cdar = dd[dd >= dar].mean()
print(f"max drawdown {dd.max():.2%}   DaR {cf:.0%} {dar:.2%}   CDaR {cdar:.2%}")
