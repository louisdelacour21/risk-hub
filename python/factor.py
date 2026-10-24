# Beta, alpha and idiosyncratic risk (single-factor regression)
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
import pandas as pd

rng = np.random.default_rng(0)
mkt = rng.standard_t(5, 2500) * 0.01
asset = 0.0002 + 1.3 * mkt + rng.normal(0, 0.012, 2500)
w = 126
beta = np.cov(asset, mkt)[0, 1] / mkt.var(ddof=1)
alpha = asset.mean() - beta * mkt.mean()
res = asset - alpha - beta * mkt
r2 = 1 - res.var() / asset.var()
print(f"beta {beta:.3f}  alpha {alpha * 252:.2%}/yr  R2 {r2:.2%}  idiosyncratic vol {res.std() * np.sqrt(252):.2%}")
roll = pd.Series(asset).rolling(w).cov(pd.Series(mkt)) / pd.Series(mkt).rolling(w).var()
print(f"rolling {w}-day beta: min {roll.min():.2f}  max {roll.max():.2f}  last {roll.iloc[-1]:.2f}")
