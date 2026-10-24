# Option book: Greeks and full revaluation on a spot / volatility grid
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy.stats import norm

S0, T, vol0, nopt, shock = 100.0, @@T=30@@ / 365, 0.6, @@n=10@@, @@vs=0.2@@
legs = {"ss": [(-1, 1, 1), (-1, 1, 0)], "ls": [(1, 1, 1), (1, 1, 0)], "rr": [(1, 1.1, 1), (-1, 0.9, 0)],
        "cs": [(-1, 1.1, 1), (-1, 0.9, 0)], "bf": [(1, 0.9, 1), (-2, 1.0, 1), (1, 1.1, 1)]}["@@=optbook_3@@"]   # (qty, strike/spot, call?)

def bs(S, K, T, vol, call, greeks=False):
    d1 = (np.log(S / K) + 0.5 * vol**2 * T) / (vol * np.sqrt(T)); d2 = d1 - vol * np.sqrt(T)
    p = S * norm.cdf(d1) - K * norm.cdf(d2) if call else K * norm.cdf(-d2) - S * norm.cdf(-d1)
    if not greeks: return p
    return p, (norm.cdf(d1) if call else norm.cdf(d1) - 1), norm.pdf(d1) / (S * vol * np.sqrt(T)), S * norm.pdf(d1) * np.sqrt(T)

def book(S, vol, T=T):
    return sum(q * nopt * bs(S, k * S0, T, vol, c) for q, k, c in legs)
G = np.array([[q * nopt * x for x in bs(S0, k * S0, T, vol0, c, True)[1:]] for q, k, c in legs]).sum(axis=0)
print(f"delta {G[0]:.2f}  gamma {G[1]:.3f}  vega(per 1.00 vol) {G[2]:.2f}")
base = book(S0, vol0)
for ds in (-0.3, -0.15, 0, 0.15, 0.3):
    print(f"spot {ds:+.0%}:", [f"{book(S0 * (1 + ds), vol0 + dv) - base:+.1f}" for dv in (-shock, 0, shock)], " (vol -/0/+)")
