# Loan-to-value migration matrix from price history (CreditMetrics style)
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

@@RETS@@
liq, h, pen = @@liq=0.85@@, int(@@h=30@@), @@pen=0.05@@
edges = np.array([0, .2, .4, .6, .8, liq]); k = len(edges) - 1
mid = (edges[:-1] + edges[1:]) / 2
logp = np.cumsum(r[-int(365 * @@yrs=3@@):])
ratio = np.exp(logp[h:] - logp[:-h])                                              # overlapping h-day price ratios
M = np.zeros((k, k + 1))
for i, l0 in enumerate(mid):
    l1 = l0 / ratio                                                               # LTV at the horizon
    for j in range(k): M[i, j] = np.mean((l1 >= edges[j]) & (l1 < edges[j + 1]))
    M[i, k] = np.mean(l1 >= liq)                                                  # liquidation (absorbing)
print("rows: starting band, columns: bands 0-20..80-liq, liquidation")
print(np.round(M, 3))
print(f"expected loss for the last band (penalty {pen:.0%}):", M[-1, -1] * pen)
