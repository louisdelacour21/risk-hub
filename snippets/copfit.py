# Fit Gaussian, t, Clayton and Gumbel copulas by maximum likelihood, compare by AIC
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy import stats
from scipy.optimize import minimize, minimize_scalar

@@MULTI@@
x, y = R[:, 0], R[:, 2]
n = len(x)
u, v = stats.rankdata(x) / (n + 1), stats.rankdata(y) / (n + 1)          # pseudo-observations

def nll_gauss(rho):
    a, b = stats.norm.ppf(u), stats.norm.ppf(v)
    return -np.sum(-0.5 * np.log(1 - rho**2) - (rho**2 * (a**2 + b**2) - 2 * rho * a * b) / (2 * (1 - rho**2)))

def nll_t(p):
    rho, nu = np.tanh(p[0]), 2 + np.exp(p[1]); a, b = stats.t.ppf(u, nu), stats.t.ppf(v, nu)
    lc = (stats.multivariate_t(shape=[[1, rho], [rho, 1]], df=nu).logpdf(np.c_[a, b]) - stats.t.logpdf(a, nu) - stats.t.logpdf(b, nu))
    return -lc.sum()

def nll_clayton(th):
    return -np.sum(np.log1p(th) - (1 + th) * np.log(u * v) - (2 + 1 / th) * np.log(u**-th + v**-th - 1))

def nll_gumbel(th):
    a, b = -np.log(u), -np.log(v); s = a**th + b**th; C = np.exp(-s ** (1 / th))
    return -np.sum(np.log(C) + (th - 1) * (np.log(a) + np.log(b)) - np.log(u * v) + (1 / th - 2) * np.log(s) + np.log(s ** (1 / th) + th - 1))

fits = {}
r = minimize_scalar(nll_gauss, bounds=(-.99, .99), method="bounded"); fits["Gaussian"] = (r.fun, 1)
r = minimize(nll_t, [0.5, 1.5], method="Nelder-Mead"); fits["Student t"] = (r.fun, 2)
r = minimize_scalar(nll_clayton, bounds=(1e-3, 20), method="bounded"); fits["Clayton"] = (r.fun, 1)
r = minimize_scalar(nll_gumbel, bounds=(1.001, 20), method="bounded"); fits["Gumbel"] = (r.fun, 1)
for name, (f, k) in sorted(fits.items(), key=lambda kv: 2 * kv[1][1] + 2 * kv[1][0]):
    print(f"{name:10s} log-lik {-f:9.2f}   AIC {2 * k + 2 * f:9.2f}")
