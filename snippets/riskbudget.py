# Risk budgeting: contributions to portfolio volatility and VaR
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy.stats import norm

@@MULTI@@
cf = @@cf=0.99@@
S = np.cov(R.T)                                   # covariance matrix of daily returns
sig = np.sqrt(w @ S @ w)
mrc = S @ w / sig                                  # marginal contribution to volatility
rc = w * mrc                                       # Euler: sums to sigma
print("weights            ", w)
print("risk shares        ", np.round(rc / sig, 3))
print(f"portfolio vol {sig:.4%}   normal VaR {cf:.0%} {norm.ppf(cf) * sig:.4%}   component VaR {np.round(norm.ppf(cf) * rc, 5)}")
