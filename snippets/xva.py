# CVA, DVA and FVA of an interest-rate swap by Monte-Carlo
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

T, sg, rho, n_ = @@T=5@@, @@sg=0.01@@, @@rho=0@@, @@n=10000@@
cs, os_, R, fs, r = @@cs=0.02@@, @@os=0.01@@, @@R=0.4@@, @@fs=0.01@@, @@r=0.03@@
steps = int(T * 12); dt = T / steps; t = np.arange(1, steps + 1) * dt
rng = np.random.default_rng(0)
# rate paths: Gaussian (Hull-White without drift), swap value ~ annuity x (rate - strike)
dW = rng.standard_normal((n_, steps)) * np.sqrt(dt)
x = np.cumsum(sg * dW, axis=1)
annuity = np.maximum(T - t, 0) + 1e-9
mtm = 100 * annuity * x                                                # notional 100, receive-fixed at the money
disc = np.exp(-r * t)
lam_c, lam_o = cs / (1 - R), os_ / (1 - R)
dpd_c = np.exp(-lam_c * (t - dt)) - np.exp(-lam_c * t)                 # default probabilities per period
dpd_o = np.exp(-lam_o * (t - dt)) - np.exp(-lam_o * t)
epe = np.maximum(mtm, 0).mean(axis=0); ene = np.maximum(-mtm, 0).mean(axis=0)
cva = (1 - R) * np.sum(disc * epe * dpd_c)
dva = (1 - R) * np.sum(disc * ene * dpd_o)
fva = fs * np.sum(disc * (epe - ene) * dt)
print(f"CVA {cva:.4f}  DVA {dva:.4f}  FVA {fva:.4f}  total XVA {cva - dva + fva:.4f}")
