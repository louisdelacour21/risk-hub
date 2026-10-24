# FRTB internal model: Expected Shortfall 97.5% with liquidity horizons
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

rng = np.random.default_rng(0)
LH = [10, 20, 40, 60, 120]                                    # liquidity horizons (days)
R = rng.standard_t(4, (2500, 5)) * np.array([.01, .012, .015, .02, .025]) / np.sqrt(2)   # one risk-factor class per horizon
w = np.ones(5)
pl = R * w

def es(x, a=0.975):
    x = -np.sort(x)[::-1][::-1]; q = np.quantile(-x, a) if False else np.quantile(x, a)
    return x[x >= q].mean()

# ES with only the factors of liquidity horizon >= LH_j shocked (nested sets), scaled to 10 days
def es_j(j):
    cols = [i for i in range(5) if LH[i] >= LH[j]]
    L = -(pl[:, cols].sum(axis=1)); q = np.quantile(L, 0.975); return L[L >= q].mean() * np.sqrt(10) / np.sqrt(1)

total = np.sqrt(sum((es_j(j) * np.sqrt((LH[j] - (LH[j - 1] if j else 0)) / 10)) ** 2 for j in range(5)))
print("FRTB ES 97.5% (10-day base, liquidity-adjusted):", total)
print("for reference, plain 10-day ES:", es_j(0))
