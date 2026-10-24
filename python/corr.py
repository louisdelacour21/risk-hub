# EWMA correlation (RiskMetrics) against sample correlation
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

# Four correlated fat-tailed daily return series (replace by your own DataFrame of returns) and portfolio weights
rng = np.random.default_rng(0)
C = np.array([[1, .6, .4, .2], [.6, 1, .5, .3], [.4, .5, 1, .4], [.2, .3, .4, 1]])
R = rng.standard_t(5, (2500, 4)) @ np.linalg.cholesky(C).T * (np.array([.02, .015, .03, .01]) / np.sqrt(5 / 3))
w = np.array([.4, .3, .2, .1])

lam = 0.94
x, y = R[:, 0], R[:, 2]
sxx = syy = sxy = 1e-4 * 0 + np.var(x[:50]); syy = np.var(y[:50]); sxy = np.cov(x[:50], y[:50])[0, 1]
rho = []
for a, b in zip(x, y):
    sxx = lam * sxx + (1 - lam) * a * a
    syy = lam * syy + (1 - lam) * b * b
    sxy = lam * sxy + (1 - lam) * a * b
    rho.append(sxy / np.sqrt(sxx * syy))
print("EWMA correlation today:", rho[-1], " full-sample:", np.corrcoef(x, y)[0, 1])
