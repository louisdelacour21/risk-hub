# Merton jump-diffusion: simulation and the option smile it creates
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from math import factorial
from scipy.stats import norm
from scipy.optimize import brentq

S0, vol, T = 100.0, 0.2, 1.0
lam, mj, dj = 0.5, -0.1, 0.15
def bs(S, K, T, s, call=True):
    d1 = (np.log(S / K) + 0.5 * s**2 * T) / (s * np.sqrt(T)); d2 = d1 - s * np.sqrt(T)
    return S * norm.cdf(d1) - K * norm.cdf(d2) if call else K * norm.cdf(-d2) - S * norm.cdf(-d1)
k = np.exp(mj + 0.5 * dj**2) - 1
def merton(K, call=True, terms=60):                                              # exact series of Black-Scholes prices
    p = 0.0; lp = lam * (1 + k) * T
    for j in range(terms):
        sj = np.sqrt(vol**2 + j * dj**2 / T); rj = -lam * k + j * (mj + 0.5 * dj**2) / T
        S = S0 * np.exp(rj * T); w = np.exp(-lp) * lp**j / factorial(j)
        p += w * bs(S, K, T, sj, call)
    return p
for K in (80, 90, 100, 110, 120):
    price = merton(K); iv = brentq(lambda s: bs(S0, K, T, s) - price, 0.01, 2)
    print(f"strike {K:>3d}: price {price:7.3f}  implied vol {iv:.1%}")
