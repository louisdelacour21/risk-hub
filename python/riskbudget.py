# Risk budgeting: contributions to portfolio volatility and VaR
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy.stats import norm

# Four correlated fat-tailed daily return series (replace by your own DataFrame of returns) and portfolio weights
rng = np.random.default_rng(0)
C = np.array([[1, .6, .4, .2], [.6, 1, .5, .3], [.4, .5, 1, .4], [.2, .3, .4, 1]])
R = rng.standard_t(5, (2500, 4)) @ np.linalg.cholesky(C).T * (np.array([.02, .015, .03, .01]) / np.sqrt(5 / 3))
w = np.array([.4, .3, .2, .1])

cf = 0.99
S = np.cov(R.T)                                   # covariance matrix of daily returns
sig = np.sqrt(w @ S @ w)
mrc = S @ w / sig                                  # marginal contribution to volatility
rc = w * mrc                                       # Euler: sums to sigma
print("weights            ", w)
print("risk shares        ", np.round(rc / sig, 3))
print(f"portfolio vol {sig:.4%}   normal VaR {cf:.0%} {norm.ppf(cf) * sig:.4%}   component VaR {np.round(norm.ppf(cf) * rc, 5)}")
