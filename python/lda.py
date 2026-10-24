# Operational risk: loss distribution approach (frequency x severity)
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

lam, med, sg, xi = 25, 20, 1.4, 0.5
cf = 0.999
rng = np.random.default_rng(0)
N = 100_000
counts = rng.poisson(lam, N)
sev = lambda k: med * np.exp(sg * rng.standard_normal(k))              # lognormal body (thousands)
annual = np.array([sev(k).sum() for k in counts])
var = np.quantile(annual, cf); es = annual[annual >= var].mean()
print(f"expected annual loss {annual.mean():.1f}   VaR {cf:.1%} {var:.1f}   ES {es:.1f}   capital (VaR - EL) {var - annual.mean():.1f}")
