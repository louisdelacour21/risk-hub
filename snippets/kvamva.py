# KVA: cost of the capital held against a derivative over its life
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

T, cs, rw, hurdle, fs = @@T=5@@, @@cs=0.01@@, @@rw=1@@, @@hu=0.1@@, @@fs=0.01@@
sig = @@sig=0.01@@
t = np.linspace(0.0, T, 61)[:-1] + T / 120                           # mid-points
dt = T / 60
ee = 100 * sig * np.sqrt(t * np.maximum(T - t, 1e-6)) * 2            # hump-shaped expected exposure profile
disc = np.exp(-0.03 * t)
ead = 1.4 * ee; cap = 0.08 * rw * ead                                 # regulatory capital through time
kva = hurdle * np.sum(cap * disc) * dt * (1 - 0.0)                    # KVA = hurdle x integral of discounted capital
print(f"peak EE {ee.max():.2f}   KVA {kva:.4f}   per unit of notional {kva / 100:.4%}")
