# CreditRisk+: Poisson mixture with a gamma factor (analytic loss distribution)
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy import stats

n, p, conc, sig, lgd = 500, 0.02, 1, 0.8, 0.45
cf = 0.999
mu = n * p                                                          # expected number of defaults
# gamma-mixed Poisson = negative binomial with mean mu and relative sd sig on the default rate
shape = 1 / sig**2; prob = shape / (shape + mu)
k = np.arange(0, int(6 * mu) + 50)
pmf = stats.nbinom.pmf(k, shape, prob)
cdf = np.cumsum(pmf)
q = int(np.searchsorted(cdf, cf))
unit = lgd * conc                                                    # loss per default (exposure x LGD)
print(f"expected loss {mu * unit:.2f}   VaR {cf:.1%} {q * unit:.2f}   unexpected loss {(q - mu) * unit:.2f}")
