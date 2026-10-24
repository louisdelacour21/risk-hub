# Explaining a scoring model: permutation importance and exact Shapley values
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
# pip install scikit-learn
import numpy as np
from itertools import combinations
from math import factorial
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

rho, who = 0.8, "hi"
names = ["debt ratio", "utilisation", "income", "age", "late payments"]
rng = np.random.default_rng(0); N = 3000
base = rng.standard_normal((N, 5)); X = base.copy(); X[:, 1] = rho * X[:, 0] + np.sqrt(1 - rho**2) * X[:, 1]
y = rng.random(N) < 1 / (1 + np.exp(-(-1.5 + 0.8 * X[:, 0] + 0.4 * X[:, 1] - 0.6 * X[:, 2] - 0.1 * X[:, 3] + 0.7 * X[:, 4])))
m = LogisticRegression().fit(X, y)
auc = roc_auc_score(y, m.predict_proba(X)[:, 1])
imp = []
for j in range(5):                                                             # permutation importance = drop in AUC
    Xp = X.copy(); Xp[:, j] = rng.permutation(Xp[:, j]); imp.append(auc - roc_auc_score(y, m.predict_proba(Xp)[:, 1]))
print("permutation importance:", dict(zip(names, np.round(imp, 4))))

score = m.decision_function(X)
x0 = X[np.argsort(score)[{"hi": int(.95 * N), "mid": N // 2, "lo": int(.05 * N)}[who]]]
mu = X.mean(axis=0)
def value(S):                                                                  # model output with features outside S set to the mean
    z = mu.copy(); z[list(S)] = x0[list(S)]; return float(m.decision_function(z[None])[0])
phi = np.zeros(5)
for j in range(5):                                                             # exact Shapley by enumerating the 2^4 coalitions
    others = [i for i in range(5) if i != j]
    for r in range(5):
        for S in combinations(others, r):
            wgt = factorial(r) * factorial(4 - r) / factorial(5)
            phi[j] += wgt * (value(S + (j,)) - value(S))
print("Shapley (log-odds):", dict(zip(names, np.round(phi, 3))), "  sum", phi.sum().round(3), "= f(x) - f(mean) =", round(value(range(5)) - value([]), 3))
