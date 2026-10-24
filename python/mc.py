# Monte-Carlo paths under geometric Brownian motion
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

S0, sigma, mu, T = 100.0, 0.25, 0.06, 1
steps, paths = 252, 10_000
rng = np.random.default_rng(42)
dt = T / steps
z = rng.standard_normal((paths, steps))
logret = (mu - 0.5 * sigma**2) * dt + sigma * np.sqrt(dt) * z
S = S0 * np.exp(np.cumsum(logret, axis=1))

ST = S[:, -1]
pnl = ST / S0 - 1
cf = 0.99
print("mean terminal price", ST.mean(), " (theory", S0 * np.exp(mu * T), ")")
print(f"VaR {cf:.0%} over {T}y:", -np.quantile(pnl, 1 - cf))
print(f"ES  {cf:.0%} over {T}y:", -pnl[pnl <= np.quantile(pnl, 1 - cf)].mean())
