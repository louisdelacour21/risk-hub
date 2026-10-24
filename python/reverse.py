# Reverse stress test: the most plausible scenario that loses L
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

# Four correlated fat-tailed daily return series (replace by your own DataFrame of returns) and portfolio weights
rng = np.random.default_rng(0)
C = np.array([[1, .6, .4, .2], [.6, 1, .5, .3], [.4, .5, 1, .4], [.2, .3, .4, 1]])
R = rng.standard_t(5, (2500, 4)) @ np.linalg.cholesky(C).T * (np.array([.02, .015, .03, .01]) / np.sqrt(5 / 3))
w = np.array([.4, .3, .2, .1])

L = 0.2                             # target loss as a share of the portfolio
h = 21                                    # horizon in days
S = np.cov(R.T) * h                                  # covariance over the horizon
# minimise x' S^-1 x (squared Mahalanobis distance) subject to w'x = -L  ->  x* = -L S w / (w' S w)
x = -L * (S @ w) / (w @ S @ w)
maha = L / np.sqrt(w @ S @ w)
from scipy.stats import norm
print("scenario (return per asset):", np.round(x, 4))
print(f"Mahalanobis distance {maha:.2f} sigmas;  normal probability of a move at least this bad: {norm.cdf(-maha):.3e}")
