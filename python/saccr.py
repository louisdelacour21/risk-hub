# SA-CCR exposure at default (simplified, one netting set)
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

# trades: (notional, effective maturity in years, supervisory factor, delta). Interest-rate style add-on.
trades = [(100, 5, 0.005, 1), (80, 3, 0.005, -1), (60, 10, 0.005, 1)]
mtm, collateral = 5, 3
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
