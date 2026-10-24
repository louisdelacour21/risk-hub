# XVA suite: CVA, DVA, FVA, MVA and KVA together
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

T, cs, os_, fs, om = @@T=5@@, @@cs=0.02@@, @@os=0.01@@, @@fs=0.01@@, @@om=0.01@@
R, r, sg = 0.4, 0.03, 0.01
steps = int(T * 12); dt = T / steps; t = np.arange(1, steps + 1) * dt
rng = np.random.default_rng(0)
x = np.cumsum(sg * rng.standard_normal((20000, steps)) * np.sqrt(dt), axis=1)
mtm = 100 * np.maximum(T - t, 1e-9) * x * @@=xvasuite_5@@
epe = np.maximum(mtm, 0).mean(0); ene = np.maximum(-mtm, 0).mean(0); disc = np.exp(-r * t)
dp = lambda s: np.exp(-s / (1 - R) * (t - dt)) - np.exp(-s / (1 - R) * t)
cva = (1 - R) * np.sum(disc * epe * dp(cs)); dva = (1 - R) * np.sum(disc * ene * dp(os_))
fva = fs * np.sum(disc * (epe - ene) * dt)
im = 2.33 * np.std(np.diff(mtm, axis=1), axis=0) * np.sqrt(10 / 21 * 1)  # crude 10-day 99% initial margin profile
im = np.r_[im, 0][: len(t)]
mva = fs * np.sum(disc * im * dt)
kva = 0.10 * np.sum(disc * 0.08 * 1.4 * epe * dt)
print(dict(CVA=cva, DVA=dva, FVA=fva, MVA=mva, KVA=kva), " total:", cva - dva + fva + mva + kva)
