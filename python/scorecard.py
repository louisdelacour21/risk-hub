# Credit scorecard: logistic regression, AUC, KS, score points
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
# pip install scikit-learn
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, roc_curve

rng = np.random.default_rng(0)
N, base, lam = 5000, 0.05, 1
X = rng.standard_normal((N, 4))
logit = np.log(base / (1 - base)) + X @ np.array([0.9, 0.6, -0.4, 0.2])
y = rng.random(N) < 1 / (1 + np.exp(-logit))
cut = int(0.7 * N)
m = LogisticRegression(C=1 / lam).fit(X[:cut], y[:cut])
p = m.predict_proba(X[cut:])[:, 1]
fpr, tpr, _ = roc_curve(y[cut:], p)
auc = roc_auc_score(y[cut:], p)
print(f"out-of-sample AUC {auc:.3f}  Gini {2 * auc - 1:.3f}  KS {np.max(tpr - fpr):.3f}")
pdo, score0, odds0 = 20, 600, 50                                  # 20 points double the odds, 600 pts = odds 50:1
factor = pdo / np.log(2); offset = score0 - factor * np.log(odds0)
score = offset - factor * (m.decision_function(X[cut:]))          # higher score = safer
print("score range:", score.min(), score.max())
