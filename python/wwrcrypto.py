# Wrong-way risk on CVA: counterparty default linked to a price fall
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy.stats import norm

# Daily returns: replace the synthetic series by your own (e.g. pd.read_csv("btc.csv")["close"].pct_change().dropna().values)
rng = np.random.default_rng(0)
r = rng.standard_t(4, 2500) * 0.02 / np.sqrt(2)

rho, sp, lgd, T, mny = 0.5, 0.03, 0.6, 1, 1
vol = r.std() * np.sqrt(365); S0 = 100.0; K = mny * S0
N = 400_000; rng = np.random.default_rng(0)
Zs = rng.standard_normal(N)                                                       # price shock
Zd = rho * -Zs + np.sqrt(1 - rho**2) * rng.standard_normal(N)                     # their credit shock, linked to a price FALL
ST = S0 * np.exp(-0.5 * vol**2 * T + vol * np.sqrt(T) * Zs)
pos = "put"
expo = {"put": np.maximum(K - ST, 0), "fwdShort": np.maximum(S0 - ST, 0), "fwdLong": np.maximum(ST - S0, 0)}[pos]
pd_ = 1 - np.exp(-sp / lgd * T)
default = Zd < norm.ppf(pd_)                                                      # default indicator under the copula
cva_wrong = lgd * (expo * default).mean()
cva_indep = lgd * expo.mean() * pd_
print(f"CVA independent {cva_indep:.4f}   CVA with wrong-way link {cva_wrong:.4f}   uplift x{cva_wrong / cva_indep:.2f}")
