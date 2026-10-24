# Extreme Value Theory: peaks-over-threshold with a Generalised Pareto tail
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy.stats import genpareto

@@RETS@@
loss = -r
u_q, cf = @@u=0.95@@, @@c=0.99@@        # threshold quantile, VaR confidence
u = np.quantile(loss, u_q)
exc = loss[loss > u] - u
xi, _, beta = genpareto.fit(exc, floc=0)           # shape xi, scale beta
Nu, N = len(exc), len(loss)

var = u + beta / xi * (((N / Nu) * (1 - cf)) ** (-xi) - 1)
es = var / (1 - xi) + (beta - xi * u) / (1 - xi)
print(f"threshold {u:.4%}  xi {xi:.3f}  beta {beta:.4f}  ({Nu} exceedances)")
print(f"EVT VaR {cf:.1%} = {var:.4%}   ES = {es:.4%}")
