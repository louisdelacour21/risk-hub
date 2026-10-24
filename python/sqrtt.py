# Square-root-of-time rule against actual H-day losses
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
import pandas as pd
from scipy import stats

# Daily returns: replace the synthetic series by your own (e.g. pd.read_csv("btc.csv")["close"].pct_change().dropna().values)
rng = np.random.default_rng(0)
r = rng.standard_t(4, 2500) * 0.02 / np.sqrt(2)

H, cf = 20, 0.99
loss1 = -r
var1 = np.quantile(loss1, cf)
lossH = -pd.Series(r).rolling(H).sum().dropna().values           # overlapping H-day losses
varH = np.quantile(lossH, cf)
print(f"1-day VaR {var1:.4%};  sqrt-time scaling {var1 * np.sqrt(H):.4%};  actual {H}-day VaR {varH:.4%}")
print(f"ratio actual / scaled = {varH / (var1 * np.sqrt(H)):.2f}  (> 1: the rule understates; < 1: it overstates)")
