# Ornstein-Uhlenbeck: simulation, half-life and parameter estimation
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

ka, mu, sg = 5, 0, 0.5
dt, N = 1 / 252, 2520
rng = np.random.default_rng(0)
x = np.empty(N); x[0] = mu
for t in range(1, N):
    x[t] = x[t - 1] + ka * (mu - x[t - 1]) * dt + sg * np.sqrt(dt) * rng.standard_normal()
# estimate by regressing x[t+1] on x[t]: x[t+1] = a + b x[t] + e
b, a = np.polyfit(x[:-1], x[1:], 1)
ka_hat = -np.log(b) / dt; mu_hat = a / (1 - b)
resid = x[1:] - (a + b * x[:-1]); sg_hat = resid.std() * np.sqrt(2 * ka_hat / (1 - b**2))
print(f"true kappa {ka}, estimated {ka_hat:.2f};  mu {mu_hat:.3f};  sigma {sg_hat:.3f}")
print(f"half-life of a deviation: {np.log(2) / ka_hat * 252:.1f} trading days;  stationary std {sg_hat / np.sqrt(2 * ka_hat):.3f}")
