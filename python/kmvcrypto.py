# KMV / Merton on a crypto-backed loan: distance to default and liquidation
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy.stats import norm

# Daily returns: replace the synthetic series by your own (e.g. pd.read_csv("btc.csv")["close"].pct_change().dropna().values)
rng = np.random.default_rng(0)
r = rng.standard_t(4, 2500) * 0.02 / np.sqrt(2)

ltv, liq, h, T = 0.6, 0.85, 30, 30 / 365
pen, dr = 0.05, 0
vol = r[-int(365 * 3):].std() * np.sqrt(365)                       # annualised (crypto trades every day)
mu = dr
dd = (-np.log(ltv / liq) + (mu - 0.5 * vol**2) * T) / (vol * np.sqrt(T))         # distance to default of the Merton firm
pd_end = norm.cdf(-dd)                                                           # collateral below the threshold at the horizon
# probability of touching the barrier at any time before T (reflection principle, zero-drift approximation)
b = np.log(ltv / liq); pd_touch = 2 * norm.cdf(-abs(b) / (vol * np.sqrt(T)))
print(f"vol {vol:.1%}  distance to default {dd:.2f}  P(below threshold at T) {pd_end:.2%}  P(touch before T) {pd_touch:.2%}")
print(f"expected liquidation loss (penalty {pen:.0%} of the loan) ~ {pd_touch * pen:.3%} of the loan")
