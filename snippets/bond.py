# Bond price, duration and convexity
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

cpn, y, T, f, face = @@cpn=0.05@@, @@y=0.045@@, @@T=10@@, @@f=2@@, 100.0

t = np.arange(1, int(T * f) + 1) / f          # payment dates in years
cf = np.full(t.shape, face * cpn / f); cf[-1] += face
df = (1 + y / f) ** (-t * f)
price = (cf * df).sum()
mac = (t * cf * df).sum() / price               # Macaulay duration
mod = mac / (1 + y / f)                         # modified duration
conv = (t * (t + 1 / f) * cf * df).sum() / (price * (1 + y / f) ** 2)
dv01 = mod * price * 1e-4
print(f"price {price:.4f}  mac.dur {mac:.3f}  mod.dur {mod:.3f}  convexity {conv:.2f}  DV01 {dv01:.4f}")

dy = 0.01   # +100 bp: duration-convexity approximation vs full repricing
approx = price * (-mod * dy + 0.5 * conv * dy**2)
full = (cf * (1 + (y + dy) / f) ** (-t * f)).sum() - price
print("price change for +100bp: approx", approx, " full", full)
