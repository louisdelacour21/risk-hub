# Parameter stability: CUSUM of residuals and Chow break scan
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy import stats

@@MULTI@@
yrs = @@yrs=6@@
m = R[-int(252 * yrs):, 0]; a = R[-int(252 * yrs):, 2]                             # benchmark ("@@=cusum_2@@") and the asset
X = np.c_[np.ones(len(m)), m]
b = np.linalg.lstsq(X, a, rcond=None)[0]; e = a - X @ b
cusum = np.cumsum(e) / (e.std(ddof=2) * np.sqrt(len(e)))
print(f"beta {b[1]:.3f}  max |CUSUM| {np.abs(cusum).max():.3f}  (95% bound 1.358 -> {'BREAK' if np.abs(cusum).max() > 1.358 else 'stable'})")
def chow(k):
    f = lambda Xs, ys: (lambda bb: ((ys - Xs @ bb) ** 2).sum())(np.linalg.lstsq(Xs, ys, rcond=None)[0])
    s_all = f(X, a); s1 = f(X[:k], a[:k]); s2 = f(X[k:], a[k:]); p = 2
    return ((s_all - s1 - s2) / p) / ((s1 + s2) / (len(a) - 2 * p))
trim = int(0.15 * len(a)); F = np.array([chow(k) for k in range(trim, len(a) - trim)])
print(f"largest Chow F {F.max():.2f} at observation {trim + F.argmax()} of {len(a)}  (compare with sup-F critical value ~ 8.85 at 5% for 2 parameters)")
