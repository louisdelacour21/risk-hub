# Dependence beyond Pearson: rank correlations, distance correlation, mutual information
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy import stats

@@MULTI@@
N = @@n=1000@@
x, y = R[-N:, 0], R[-N:, 2]

def dcor(a, b):
    A = np.abs(a[:, None] - a[None, :]); B = np.abs(b[:, None] - b[None, :])
    A = A - A.mean(0) - A.mean(1)[:, None] + A.mean(); B = B - B.mean(0) - B.mean(1)[:, None] + B.mean()
    return np.sqrt((A * B).mean() / np.sqrt((A * A).mean() * (B * B).mean()))

print("Pearson ", stats.pearsonr(x, y)[0])
print("Spearman", stats.spearmanr(x, y)[0], "  Kendall", stats.kendalltau(x, y)[0])
print("distance correlation", dcor(x, y))
from sklearn.feature_selection import mutual_info_regression        # pip install scikit-learn
print("mutual information  ", mutual_info_regression(x.reshape(-1, 1), y, random_state=0)[0])
dn, up = x < 0, x > 0
print("correlation when asset 1 falls:", np.corrcoef(x[dn], y[dn])[0, 1], " when it rises:", np.corrcoef(x[up], y[up])[0, 1])
