# Historical stress episodes: the worst non-overlapping windows
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
import pandas as pd
from scipy import stats

# Four correlated fat-tailed daily return series (replace by your own DataFrame of returns) and portfolio weights
rng = np.random.default_rng(0)
C = np.array([[1, .6, .4, .2], [.6, 1, .5, .3], [.4, .5, 1, .4], [.2, .3, .4, 1]])
R = rng.standard_t(5, (2500, 4)) @ np.linalg.cholesky(C).T * (np.array([.02, .015, .03, .01]) / np.sqrt(5 / 3))
w = np.array([.4, .3, .2, .1])

h, k = 10, 5                  # window length (days), episodes shown
pnl = pd.Series(R @ w)
roll = pnl.rolling(h).sum().dropna()                 # h-day P&L (sum of daily returns)
picked = []
for end, val in roll.sort_values().items():
    if all(abs(end - e) >= h for e, _ in picked):    # non-overlapping
        picked.append((end, val))
    if len(picked) == k: break
for end, val in picked:
    seg = R[end - h + 1:end + 1].sum(axis=0) * w
    print(f"days {end - h + 1}-{end}: portfolio {val:+.2%}   by asset {np.round(seg, 4)}")
