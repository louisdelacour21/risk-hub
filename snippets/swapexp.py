# Expected exposure profile of an interest-rate swap
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

T, sig, a, direction = @@T=5@@, @@sig=0.01@@, @@a=0.1@@, @@=swapexp_3@@
steps = int(T * 12); dt = T / steps; t = np.arange(1, steps + 1) * dt
rng = np.random.default_rng(0)
x = np.zeros((20000, steps)); cur = np.zeros(20000)
for i in range(steps):                                                 # Vasicek / Hull-White deviation from the forward curve
    cur = cur - a * cur * dt + sig * np.sqrt(dt) * rng.standard_normal(20000); x[:, i] = cur
annuity = np.maximum(T - t, 0)
mtm = direction * 100 * annuity * x
ee, ene = np.maximum(mtm, 0).mean(0), np.maximum(-mtm, 0).mean(0)
pfe = np.quantile(np.maximum(mtm, 0), 0.95, axis=0)
i = int(np.argmax(ee))
print(f"peak expected exposure {ee.max():.3f} at {t[i]:.2f}y;  peak PFE 95% {pfe.max():.3f};  expected negative exposure peak {ene.max():.3f}")
