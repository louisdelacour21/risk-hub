# SA-CCR exposure at default (simplified, one netting set)
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

# trades: (notional, effective maturity in years, supervisory factor, delta). Interest-rate style add-on.
trades = [(@@n1=100@@, @@e1=5@@, 0.005, 1), (@@n2=80@@, @@e2=3@@, 0.005, -1), (@@n3=60@@, @@e3=10@@, 0.005, 1)]
mtm, collateral = @@mtm=5@@, @@col=3@@
sd = lambda e: (np.exp(-0.05 * 0) - np.exp(-0.05 * e)) / 0.05          # supervisory duration
addon = {}
for N, e, sf, d in trades:
    addon[e] = addon.get(e, 0) + d * N * sd(e)
eff = np.sqrt(sum(a**2 for a in addon.values()) + 1.4 * sum(a * b for a in addon.values() for b in addon.values() if a is not b))
mult = min(1, 0.05 + 0.95 * np.exp((mtm - collateral) / (2 * 0.95 * max(eff * 0.005, 1e-9))))
pfe = mult * 0.005 * abs(eff)
rc = max(mtm - collateral, 0)
ead = 1.4 * (rc + pfe)
print(f"replacement cost {rc:.2f}  PFE add-on {pfe:.3f}  multiplier {mult:.3f}  EAD = 1.4 x (RC + PFE) = {ead:.3f}")
