# Liquidity-adjusted VaR: exit cost from the bid-ask spread and market depth
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy.stats import norm

@@RETS@@
pos, adv, par, sp, spm, cf = @@pos=1000000@@, @@adv=5000000@@, @@par=0.2@@, @@sp=0.001@@, @@spm=3@@, @@cf=0.99@@
days = max(1, int(np.ceil(pos / (par * adv))))                              # days needed to unwind at par of the daily volume
sig = r.std()
var = norm.ppf(cf) * sig * np.sqrt(days) * pos                              # market VaR over the unwind period
cost_normal = 0.5 * sp * pos                                                # half-spread, normal conditions
cost_stress = 0.5 * sp * spm * pos                                          # spread widened in stress
print(f"unwind {days} day(s);  VaR {var:,.0f};  exit cost {cost_normal:,.0f} (normal) / {cost_stress:,.0f} (stress);  LVaR {var + cost_stress:,.0f}")
