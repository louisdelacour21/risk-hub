# Concentration: Herfindahl, Gini and effective number of positions
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

@@MULTI@@
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
