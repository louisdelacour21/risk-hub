# FX hedge: forward cost (covered interest parity) and hedge ratio
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

S, re, rd, bs, h, yrs = 1.10, @@re=0.02@@, @@rd=0.04@@, @@bs=0.002@@, @@h=1@@, @@yrs=5@@
fwd = S * (1 + rd * h) / (1 + re * h)                                      # forward = spot x (1+r_dom)/(1+r_foreign)
print(f"forward {fwd:.4f}  forward points {(fwd - S) * 1e4:.1f}  annualised carry of hedging {np.log(fwd / S) / h:.2%} + basis {bs:.2%}")
rng = np.random.default_rng(0); fx = rng.standard_t(5, int(252 * yrs)) * 0.005
hedge_pnl = lambda ratio: ratio * (-fx)
for ratio in (0, 0.5, 1.0):
    print(f"hedge ratio {ratio:.0%}: annual vol of the position {np.std(fx + hedge_pnl(ratio)) * np.sqrt(252):.2%}")
