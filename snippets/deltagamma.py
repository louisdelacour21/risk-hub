# Option book VaR: delta-normal, delta-gamma, full revaluation
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy.stats import norm

S0, vol, T, h, c, k = 100.0, @@vol=0.3@@, @@T=0.25@@, @@h=10@@, @@c=0.99@@, @@k=1@@
sign = @@=deltagamma_5@@       # +1 long, -1 short;  straddle = call + put at strike k*S0
straddle = @@=deltagamma_6@@
K, r = k * S0, 0.0

def bs(S, K, T, vol, call=True):
    d1 = (np.log(S / K) + 0.5 * vol**2 * T) / (vol * np.sqrt(T)); d2 = d1 - vol * np.sqrt(T)
    return S * norm.cdf(d1) - K * norm.cdf(d2) if call else K * norm.cdf(-d2) - S * norm.cdf(-d1)

def value(S, T=T):
    return sign * (bs(S, K, T, vol, True) + (bs(S, K, T, vol, False) if straddle else 0.0))

eps = 1e-3 * S0
delta = (value(S0 + eps) - value(S0 - eps)) / (2 * eps)
gamma = (value(S0 + eps) - 2 * value(S0) + value(S0 - eps)) / eps**2
sd = S0 * vol * np.sqrt(h / 252)                              # std of the spot move over h days

rng = np.random.default_rng(0); dS = rng.normal(0, sd, 500_000)
pnl_full = value(S0 + dS, T - h / 252) - value(S0)
pnl_dg = delta * dS + 0.5 * gamma * dS**2
z = norm.ppf(c)
print(f"delta {delta:.4f}  gamma {gamma:.5f}")
print("delta-normal VaR :", z * abs(delta) * sd)
print("delta-gamma  VaR :", -np.quantile(pnl_dg, 1 - c))
print("full revaluation :", -np.quantile(pnl_full, 1 - c))
