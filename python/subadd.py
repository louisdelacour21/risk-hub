# VaR is not subadditive, ES is: n independent defaultable loans
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy import stats

n, p, c, L = 2, 0.04, 0.95, 100   # loans, default probability, confidence, loss per loan

def var_es(losses, probs, c):
    order = np.argsort(losses); losses, probs = np.array(losses)[order], np.array(probs)[order]
    cum = np.cumsum(probs); i = int(np.searchsorted(cum, c - 1e-12))
    var = losses[i]
    tail = probs * (losses > var); es = (var * (cum[i] - c) + (losses * tail).sum()) / (1 - c)
    return var, es

v1, e1 = var_es([0, L], [1 - p, p], c)                       # a single loan
k = np.arange(n + 1)
vn, en = var_es(k * L, stats.binom.pmf(k, n, p), c)          # pool of n loans
print(f"one loan : VaR {v1:.1f}  ES {e1:.1f}")
print(f"pool of {n}: VaR {vn:.1f}  ES {en:.1f}   (sum of stand-alone: VaR {n * v1:.1f}, ES {n * e1:.1f})")
print("VaR subadditive?", vn <= n * v1 + 1e-9, "  ES subadditive?", en <= n * e1 + 1e-9)
