# Minimum-variance hedge ratio and hedging effectiveness
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

val, fut, tb = @@val=10@@, @@fut=1@@, @@tb=1@@                 # position value, futures contract value, tracking basis noise
rng = np.random.default_rng(0)
f = rng.standard_t(5, 2000) * 0.01
s = 0.9 * f + rng.normal(0, 0.004 * tb, 2000)                               # spot position returns, imperfectly correlated with the future
h = np.cov(s, f)[0, 1] / f.var(ddof=1)                                       # minimum-variance hedge ratio
effect = 1 - np.var(s - h * f) / np.var(s)                                   # = rho^2
contracts = h * val / fut
print(f"hedge ratio {h:.3f}  contracts to short {contracts:.2f}  variance removed {effect:.1%}  correlation {np.corrcoef(s, f)[0, 1]:.3f}")
