# KMV / Merton on a crypto-backed loan: distance to default and liquidation
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy.stats import norm

@@RETS@@
ltv, liq, h, T = @@ltv=0.6@@, @@liq=0.85@@, @@h=30@@, @@h=30@@ / 365
pen, dr = @@pen=0.05@@, @@dr=0@@
vol = r[-int(365 * @@yrs=3@@):].std() * np.sqrt(365)                       # annualised (crypto trades every day)
mu = dr
dd = (-np.log(ltv / liq) + (mu - 0.5 * vol**2) * T) / (vol * np.sqrt(T))         # distance to default of the Merton firm
pd_end = norm.cdf(-dd)                                                           # collateral below the threshold at the horizon
# probability of touching the barrier at any time before T (reflection principle, zero-drift approximation)
b = np.log(ltv / liq); pd_touch = 2 * norm.cdf(-abs(b) / (vol * np.sqrt(T)))
print(f"vol {vol:.1%}  distance to default {dd:.2f}  P(below threshold at T) {pd_end:.2%}  P(touch before T) {pd_touch:.2%}")
print(f"expected liquidation loss (penalty {pen:.0%} of the loan) ~ {pd_touch * pen:.3%} of the loan")
