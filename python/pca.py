# PCA of yield-curve changes: level, slope, curvature
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

rng = np.random.default_rng(0)
tenors = np.array([1, 2, 3, 5, 7, 10, 20, 30.0])
n = int(252 * 10)
lvl, slp, crv = rng.standard_normal((3, n)) * np.array([[0.05], [0.03], [0.015]])
load = np.vstack([np.ones(8), np.linspace(-1, 1, 8), (np.linspace(-1, 1, 8)) ** 2 - 0.4])
dy = (lvl[:, None] * load[0] + slp[:, None] * load[1] + crv[:, None] * load[2]) + rng.normal(0, 0.005, (n, 8))   # daily yield changes in %
C = np.cov(dy.T); ev, V = np.linalg.eigh(C); ev, V = ev[::-1], V[:, ::-1]
print("variance explained by the first 3 components:", np.round(ev[:3] / ev.sum(), 3), " total", (ev[:3] / ev.sum()).sum().round(3))
print("PC1 loadings (level):", np.round(V[:, 0], 2))
print("PC2 loadings (slope):", np.round(V[:, 1], 2))
