# Heston stochastic volatility: simulation, smile and Feller condition
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy.stats import norm
from scipy.optimize import brentq

v0, th, ka, xi, rho, T = @@v0=0.04@@, @@th=0.04@@, @@ka=2@@, @@xi=0.5@@, @@rho=-0.7@@, @@T=1@@
print("Feller condition 2*kappa*theta > xi^2:", 2 * ka * th > xi**2)
N, steps, S0 = 200_000, 200, 100.0; dt = T / steps
rng = np.random.default_rng(0)
v = np.full(N, v0); lnS = np.full(N, np.log(S0))
for _ in range(steps):                                                             # full-truncation Euler scheme
    z1 = rng.standard_normal(N); z2 = rho * z1 + np.sqrt(1 - rho**2) * rng.standard_normal(N); vp = np.maximum(v, 0)
    lnS += -0.5 * vp * dt + np.sqrt(vp * dt) * z1; v += ka * (th - vp) * dt + xi * np.sqrt(vp * dt) * z2
ST = np.exp(lnS)
def bs(K, s):
    d1 = (np.log(S0 / K) + 0.5 * s**2 * T) / (s * np.sqrt(T)); return S0 * norm.cdf(d1) - K * norm.cdf(d1 - s * np.sqrt(T))
for K in (80, 90, 100, 110, 120):
    price = np.maximum(ST - K, 0).mean()
    iv = brentq(lambda s: bs(K, s) - price, 0.01, 2)
    print(f"strike {K:>3d}: call {price:7.3f}  implied vol {iv:.1%}")
