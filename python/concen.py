# Concentration: Herfindahl, Gini and effective number of positions
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

# Four correlated fat-tailed daily return series (replace by your own DataFrame of returns) and portfolio weights
rng = np.random.default_rng(0)
C = np.array([[1, .6, .4, .2], [.6, 1, .5, .3], [.4, .5, 1, .4], [.2, .3, .4, 1]])
R = rng.standard_t(5, (2500, 4)) @ np.linalg.cholesky(C).T * (np.array([.02, .015, .03, .01]) / np.sqrt(5 / 3))
w = np.array([.4, .3, .2, .1])

S = np.cov(R.T)
risk = w * (S @ w) / (w @ S @ w)                       # risk shares (Euler)

def stats_(s):
    s = np.sort(np.asarray(s)); n = len(s)
    hhi = (s**2).sum()
    gini = (2 * np.arange(1, n + 1) - n - 1) @ s / (n * s.sum())
    return hhi, gini, 1 / hhi
for name, s in [("capital", w), ("risk", risk)]:
    hhi, gini, neff = stats_(s)
    print(f"{name:8s} HHI {hhi:.3f}  Gini {gini:.3f}  effective N {neff:.2f}  largest share {s.max():.1%}")
