# Extreme Value Theory: peaks-over-threshold with a Generalised Pareto tail
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy.stats import genpareto

# Daily returns: replace the synthetic series by your own (e.g. pd.read_csv("btc.csv")["close"].pct_change().dropna().values)
rng = np.random.default_rng(0)
r = rng.standard_t(4, 2500) * 0.02 / np.sqrt(2)

loss = -r
u_q, cf = 0.95, 0.99        # threshold quantile, VaR confidence
u = np.quantile(loss, u_q)
exc = loss[loss > u] - u
xi, _, beta = genpareto.fit(exc, floc=0)           # shape xi, scale beta
Nu, N = len(exc), len(loss)

var = u + beta / xi * (((N / Nu) * (1 - cf)) ** (-xi) - 1)
es = var / (1 - xi) + (beta - xi * u) / (1 - xi)
print(f"threshold {u:.4%}  xi {xi:.3f}  beta {beta:.4f}  ({Nu} exceedances)")
print(f"EVT VaR {cf:.1%} = {var:.4%}   ES = {es:.4%}")
