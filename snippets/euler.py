# Euler allocation of Expected Shortfall: who owns the tail
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

@@MULTI@@
cf = @@cf=0.975@@
pl = R @ w                                           # portfolio return
loss = -pl
var = np.quantile(loss, cf)
tail = loss >= var
es = loss[tail].mean()
contrib = -(R[tail] * w).mean(axis=0)                # E[-w_i r_i | portfolio loss >= VaR]; adds up to ES exactly
print(f"ES {cf:.1%} = {es:.4%}")
print("contributions:", np.round(contrib, 5), " sum =", contrib.sum())
print("share of tail vs share of money:", np.round(contrib / es, 3), w)
