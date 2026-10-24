# Merton structural model: asset value, asset volatility, distance to default, PD
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy.stats import norm
from scipy.optimize import fsolve

E, sE, D, r, T, mu = 40, 0.5, 100, 0.03, 1, 0.07

def equations(x):
    V, sV = x
    d1 = (np.log(V / D) + (r + 0.5 * sV**2) * T) / (sV * np.sqrt(T))
    d2 = d1 - sV * np.sqrt(T)
    return [V * norm.cdf(d1) - D * np.exp(-r * T) * norm.cdf(d2) - E,     # equity is a call on the assets
            norm.cdf(d1) * V * sV - E * sE]                                # equity volatility link

V, sV = fsolve(equations, [E + D, sE * E / (E + D)])
d2 = (np.log(V / D) + (r - 0.5 * sV**2) * T) / (sV * np.sqrt(T))
print(f"asset value {V:.2f}, asset vol {sV:.3f}")
print(f"risk-neutral PD {norm.cdf(-((np.log(V / D) + (r - 0.5 * sV**2) * T) / (sV * np.sqrt(T)))):.4%}")
dd = (np.log(V / D) + (mu - 0.5 * sV**2) * T) / (sV * np.sqrt(T))
print(f"distance to default {dd:.3f}, real-world PD {norm.cdf(-dd):.4%}")
