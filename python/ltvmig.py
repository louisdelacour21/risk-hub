# Loan-to-value migration matrix from price history (CreditMetrics style)
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

# Daily returns: replace the synthetic series by your own (e.g. pd.read_csv("btc.csv")["close"].pct_change().dropna().values)
rng = np.random.default_rng(0)
r = rng.standard_t(4, 2500) * 0.02 / np.sqrt(2)

liq, h, pen = 0.85, int(30), 0.05
edges = np.array([0, .2, .4, .6, .8, liq]); k = len(edges) - 1
mid = (edges[:-1] + edges[1:]) / 2
logp = np.cumsum(r[-int(365 * 3):])
ratio = np.exp(logp[h:] - logp[:-h])                                              # overlapping h-day price ratios
M = np.zeros((k, k + 1))
for i, l0 in enumerate(mid):
    l1 = l0 / ratio                                                               # LTV at the horizon
    for j in range(k): M[i, j] = np.mean((l1 >= edges[j]) & (l1 < edges[j + 1]))
    M[i, k] = np.mean(l1 >= liq)                                                  # liquidation (absorbing)
print("rows: starting band, columns: bands 0-20..80-liq, liquidation")
print(np.round(M, 3))
print(f"expected loss for the last band (penalty {pen:.0%}):", M[-1, -1] * pen)
