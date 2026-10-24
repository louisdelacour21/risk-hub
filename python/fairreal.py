# Fairness metrics on a credit scoring model
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
# The page uses the German Credit file (UCI, CC BY 4.0). To use it: fetch_openml("credit-g") and build the features/group below from it.
# pip install scikit-learn
import numpy as np
from sklearn.linear_model import LogisticRegression

rng = np.random.default_rng(0); N = 1000
group = rng.random(N) < 0.3                                                      # 1 = group compared ("female")
X = rng.standard_normal((N, 5)); X[:, 0] += 0.4 * group                          # a proxy variable correlated with the group
y = (rng.random(N) < 1 / (1 + np.exp(-(0.8 + 0.7 * X[:, 0] - 0.5 * X[:, 1] + 0.3 * X[:, 2] - 0.2 * group)))).astype(int)   # 1 = repaid
use_attr = True
F = np.c_[X, group] if use_attr else X
m = LogisticRegression().fit(F, y)
pred = m.predict_proba(F)[:, 1] > 0.5                                 # approve above the threshold
def rate(mask, a): return a[mask].mean()
dp = rate(group, pred) - rate(~group, pred)                                       # demographic parity gap
tpr = lambda g: pred[g & (y == 1)].mean(); eo = tpr(group) - tpr(~group)          # equal opportunity gap
prec = lambda g: y[g & pred].mean(); pp = prec(group) - prec(~group)              # predictive parity gap
di = rate(group, pred) / rate(~group, pred)                                       # disparate impact ratio (four-fifths rule: >= 0.80)
print(f"approval rate gap {dp:+.3f}   equal-opportunity gap {eo:+.3f}   predictive-parity gap {pp:+.3f}   disparate impact {di:.2f}")
