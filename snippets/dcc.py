# DCC-GARCH: dynamic correlation between two assets
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
# pip install arch
import numpy as np
from arch import arch_model
from scipy.optimize import minimize

@@MULTI@@
X = R[-@@n=1500@@:, [0, 2]] * 100
z = np.empty_like(X)
for j in range(2):                                                # step 1: univariate GARCH(1,1) on each series
    res = arch_model(X[:, j], mean="Zero", vol="GARCH", p=1, q=1).fit(disp="off")
    z[:, j] = res.resid / res.conditional_volatility

Qbar = np.cov(z.T)
def filt(p):
    a, b = p; Q = Qbar.copy(); rho = []
    for t in range(len(z)):
        d = np.sqrt(np.diag(Q)); rho.append(Q[0, 1] / (d[0] * d[1]))
        Q = (1 - a - b) * Qbar + a * np.outer(z[t], z[t]) + b * Q
    return np.array(rho)
def nll(p):
    a, b = p
    if a < 0 or b < 0 or a + b >= 0.999: return 1e10
    rho = filt(p); zz = z
    return 0.5 * np.sum(np.log(1 - rho**2) + (zz[:, 0]**2 + zz[:, 1]**2 - 2 * rho * zz[:, 0] * zz[:, 1]) / (1 - rho**2))
fit = minimize(nll, [0.03, 0.95], method="Nelder-Mead")            # step 2: correlation dynamics
rho = filt(fit.x)
print("a, b =", fit.x, "  correlation today:", rho[-1], "  range:", rho.min(), rho.max())
