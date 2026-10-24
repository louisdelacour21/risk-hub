# FX VaR for a currency position
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy import stats

# Daily returns: replace the synthetic series by your own (e.g. pd.read_csv("btc.csv")["close"].pct_change().dropna().values)
rng = np.random.default_rng(0)
r = rng.standard_t(4, 2500) * 0.02 / np.sqrt(2)

h, yrs, cf = 1, 5, 0.99
fx = r[-int(252 * yrs):]
pos = 1_000_000                                                           # position in foreign currency units (converted to base)
roll = np.convolve(fx, np.ones(int(h)), "valid")                           # h-day returns
print(f"historical VaR {cf:.0%} {int(h)}d: {-np.quantile(roll, 1 - cf) * pos:,.0f}   normal VaR {-(roll.mean() + stats.norm.ppf(1 - cf) * roll.std()) * pos:,.0f}")
