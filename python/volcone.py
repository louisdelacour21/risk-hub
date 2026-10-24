# Volatility cone: today against the history at each horizon
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
import pandas as pd
from scipy import stats

# Daily returns: replace the synthetic series by your own (e.g. pd.read_csv("btc.csv")["close"].pct_change().dropna().values)
rng = np.random.default_rng(0)
r = rng.standard_t(4, 2500) * 0.02 / np.sqrt(2)

s = pd.Series(r)
for h in (10, 20, 60, 120, 250):
    vol = s.rolling(h).std().dropna() * np.sqrt(252)
    pct = (vol < vol.iloc[-1]).mean()
    print(f"{h:4d}d  min {vol.min():.1%}  p25 {vol.quantile(.25):.1%}  median {vol.median():.1%}  p75 {vol.quantile(.75):.1%}  max {vol.max():.1%}   today {vol.iloc[-1]:.1%} (percentile {pct:.0%})")
