# Reverse stress test: the most plausible scenario that loses L
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

@@MULTI@@
L = @@=reverse_1@@                             # target loss as a share of the portfolio
h = @@h=21@@                                    # horizon in days
S = np.cov(R.T) * h                                  # covariance over the horizon
# minimise x' S^-1 x (squared Mahalanobis distance) subject to w'x = -L  ->  x* = -L S w / (w' S w)
x = -L * (S @ w) / (w @ S @ w)
maha = L / np.sqrt(w @ S @ w)
from scipy.stats import norm
print("scenario (return per asset):", np.round(x, 4))
print(f"Mahalanobis distance {maha:.2f} sigmas;  normal probability of a move at least this bad: {norm.cdf(-maha):.3e}")
