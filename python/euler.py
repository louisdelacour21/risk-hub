# Euler allocation of Expected Shortfall: who owns the tail
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

# Four correlated fat-tailed daily return series (replace by your own DataFrame of returns) and portfolio weights
rng = np.random.default_rng(0)
C = np.array([[1, .6, .4, .2], [.6, 1, .5, .3], [.4, .5, 1, .4], [.2, .3, .4, 1]])
R = rng.standard_t(5, (2500, 4)) @ np.linalg.cholesky(C).T * (np.array([.02, .015, .03, .01]) / np.sqrt(5 / 3))
w = np.array([.4, .3, .2, .1])

cf = 0.975
pl = R @ w                                           # portfolio return
loss = -pl
var = np.quantile(loss, cf)
tail = loss >= var
es = loss[tail].mean()
contrib = -(R[tail] * w).mean(axis=0)                # E[-w_i r_i | portfolio loss >= VaR]; adds up to ES exactly
print(f"ES {cf:.1%} = {es:.4%}")
print("contributions:", np.round(contrib, 5), " sum =", contrib.sum())
print("share of tail vs share of money:", np.round(contrib / es, 3), w)
