# EWMA correlation (RiskMetrics) against sample correlation
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

@@MULTI@@
lam = @@l=0.94@@
x, y = R[:, 0], R[:, 2]
sxx = syy = sxy = 1e-4 * 0 + np.var(x[:50]); syy = np.var(y[:50]); sxy = np.cov(x[:50], y[:50])[0, 1]
rho = []
for a, b in zip(x, y):
    sxx = lam * sxx + (1 - lam) * a * a
    syy = lam * syy + (1 - lam) * b * b
    sxy = lam * sxy + (1 - lam) * a * b
    rho.append(sxy / np.sqrt(sxx * syy))
print("EWMA correlation today:", rho[-1], " full-sample:", np.corrcoef(x, y)[0, 1])
