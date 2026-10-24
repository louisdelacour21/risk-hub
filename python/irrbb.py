# Interest-rate risk in the banking book: delta EVE and delta NII
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

# Simplified balance sheet: assets and liabilities with durations; shocks in bp (Basel six scenarios)
A, Lb, E = 4, 2, 8                 # asset duration, liability duration, equity (% of assets)
assets = 100.0; liabs = assets - E
reprice_a, reprice_l = 3, 0.5                   # years to repricing
shocks = {"parallel up": 200, "parallel down": -200, "steepener": 0, "flattener": 0, "short up": 250, "short down": -250}
for name, bp in shocks.items():
    d = bp / 1e4
    d_eve = -(assets * A - liabs * Lb) * d                               # change in economic value of equity
    d_nii = (assets / reprice_a - liabs / reprice_l) * d * 1.0           # one-year change in net interest income (crude)
    print(f"{name:14s} delta EVE {d_eve:+7.2f} ({d_eve / E:+.0%} of equity)   delta NII {d_nii:+7.2f}")
print("outlier test: delta EVE > 15% of Tier 1 capital")
