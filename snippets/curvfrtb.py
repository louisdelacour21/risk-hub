# FRTB curvature charge on an option position
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy.stats import norm

S0, T, w, nopt = 100.0, @@T=30@@ / 365, @@w=0.5@@, @@n=10@@
K, vol = @@mny=1@@ * S0, 0.6
sign = @@=curvfrtb_4@@
straddle = @@=curvfrtb_5@@

def bs(S, call):
    d1 = (np.log(S / K) + 0.5 * vol**2 * T) / (vol * np.sqrt(T)); d2 = d1 - vol * np.sqrt(T)
    return S * norm.cdf(d1) - K * norm.cdf(d2) if call else K * norm.cdf(-d2) - S * norm.cdf(-d1)
V = lambda S: sign * nopt * (bs(S, True) + (bs(S, False) if straddle else 0))
eps = 1e-4 * S0; delta = (V(S0 + eps) - V(S0 - eps)) / (2 * eps)
up, dn = S0 * (1 + w), S0 * (1 - w)
cvr_up = -(V(up) - V(S0) - delta * (up - S0))            # shortfall against the linear (delta) estimate
cvr_dn = -(V(dn) - V(S0) - delta * (dn - S0))
print(f"CVR up {cvr_up:.2f}  CVR down {cvr_dn:.2f}  curvature charge {max(cvr_up, cvr_dn, 0):.2f}")
