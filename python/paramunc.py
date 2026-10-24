# Estimation and method risk of a VaR
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
import pandas as pd
from scipy import stats

# Daily returns: replace the synthetic series by your own (e.g. pd.read_csv("btc.csv")["close"].pct_change().dropna().values)
rng = np.random.default_rng(0)
r = rng.standard_t(4, 2500) * 0.02 / np.sqrt(2)

win, B, cf = 500, 400, 0.99
x = -r[-win:]
rng = np.random.default_rng(0)

methods = {
    "historical": lambda l: np.quantile(l, cf),
    "normal":     lambda l: l.mean() + l.std(ddof=1) * stats.norm.ppf(cf),
    "student-t":  lambda l: stats.t.ppf(cf, *stats.t.fit(l)[:1], *stats.t.fit(l)[1:]),
    "EWMA":       lambda l: np.sqrt(np.sum(0.94 ** np.arange(len(l))[::-1] * l**2) * 0.06) * stats.norm.ppf(cf),
}
for name, f in methods.items():
    boot = [f(rng.choice(x, win)) for _ in range(B)]
    print(f"{name:11s} VaR {f(x):.4%}   estimation interval 95% [{np.quantile(boot, .025):.4%}, {np.quantile(boot, .975):.4%}]")
est = np.array([f(x) for f in methods.values()])
print(f"spread across methods (method risk): {est.max() - est.min():.4%}")
