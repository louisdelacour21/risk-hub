# Tail dependence: Gaussian against Student-t copula
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy import stats

nu, rho, N = @@nu=5@@, 0.5, 500_000
rng = np.random.default_rng(0)
L = np.linalg.cholesky([[1, rho], [rho, 1]])
g = rng.standard_normal((N, 2)) @ L.T
t = g / np.sqrt(rng.chisquare(nu, (N, 1)) / nu)
q = 0.01
def joint_exceed(z):
    u = stats.rankdata(z, axis=0) / (N + 1)
    return np.mean((u[:, 0] < q) & (u[:, 1] < q)) / q                 # P(U2<q | U1<q)
lam_t = 2 * stats.t.cdf(-np.sqrt((nu + 1) * (1 - rho) / (1 + rho)), nu + 1)    # theoretical lower tail dependence
print(f"P(both in worst {q:.0%} | one is): Gaussian {joint_exceed(g):.3f}   t({nu:g}) {joint_exceed(t):.3f}   theory t: {lam_t:.3f}   theory Gaussian: 0")
