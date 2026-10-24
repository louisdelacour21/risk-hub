# Model risk: the same calibration, three pricing models (Black-Scholes, Merton jumps, Heston)
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy.stats import norm

S0, vol, T = 100.0, @@vol=0.22@@, @@T=1@@
lam, mj, sj = @@lam=0.5@@, @@mj=-0.1@@, 0.15
xi, rho, ka = @@xi=0.5@@, @@rho=-0.7@@, @@ka=2@@
N = 400_000; rng = np.random.default_rng(0)
def bs_terminal(): return S0 * np.exp(-0.5 * vol**2 * T + vol * np.sqrt(T) * rng.standard_normal(N))
def merton_terminal():
    k = np.exp(mj + 0.5 * sj**2) - 1; s = np.sqrt(max(vol**2 - lam * (mj**2 + sj**2), 1e-4))   # keep the ATM variance comparable
    J = rng.poisson(lam * T, N); jump = mj * J + sj * np.sqrt(J) * rng.standard_normal(N)
    return S0 * np.exp((-0.5 * s**2 - lam * k) * T + s * np.sqrt(T) * rng.standard_normal(N) + jump)
def heston_terminal(steps=100):
    dt = T / steps; v = np.full(N, vol**2); lnS = np.full(N, np.log(S0)); th = vol**2
    for _ in range(steps):
        z1 = rng.standard_normal(N); z2 = rho * z1 + np.sqrt(1 - rho**2) * rng.standard_normal(N); vp = np.maximum(v, 0)
        lnS += -0.5 * vp * dt + np.sqrt(vp * dt) * z1; v += ka * (th - vp) * dt + xi * np.sqrt(vp * dt) * z2
    return np.exp(lnS)
models = {"Black-Scholes": bs_terminal(), "Merton jump": merton_terminal(), "Heston": heston_terminal()}
for name, ST in models.items():
    call = lambda K: np.maximum(ST - K, 0).mean(); put = lambda K: np.maximum(K - ST, 0).mean()
    print(f"{name:14s} ATM call {call(100):6.3f}  digital 110: {(ST > 110).mean():.4f}  risk reversal (25 delta proxy) {call(110) - put(90):+.3f}  90% put {put(90):.3f}")
