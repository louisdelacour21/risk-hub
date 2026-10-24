# Vasicek short-rate model: simulation and bond price
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

r0, th, ka, sg = @@r0=0.03@@, @@th=0.04@@, @@ka=0.5@@, @@sg=0.01@@
T = 10; steps = 2520; dt = T / steps
rng = np.random.default_rng(0)
r = np.full(5000, r0); path = [r.copy()]
for _ in range(steps):
    r = r + ka * (th - r) * dt + sg * np.sqrt(dt) * rng.standard_normal(5000); path.append(r.copy())
path = np.array(path)
print("mean rate at 1y / 5y / 10y:", path[[252, 1260, 2520]].mean(axis=1), " theory 10y:", th + (r0 - th) * np.exp(-ka * T))
B = lambda t: (1 - np.exp(-ka * t)) / ka
A = lambda t: np.exp((th - sg**2 / (2 * ka**2)) * (B(t) - t) - sg**2 * B(t)**2 / (4 * ka))
print("zero-coupon bond price 5y (closed form):", A(5) * np.exp(-B(5) * r0))
