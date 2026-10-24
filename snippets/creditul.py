# Credit portfolio loss: single-factor Gaussian copula, unexpected loss and credit VaR
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy.stats import norm

# two segments: (exposure, PD, LGD)
seg = [(@@e1=100@@, @@p1=0.02@@, @@l1=0.45@@), (@@e2=100@@, @@p2=0.05@@, @@l2=0.45@@)]
rho, N, conf = @@rho=0.15@@, 400_000, 0.999
rng = np.random.default_rng(0)
Z = rng.standard_normal(N)                                         # systematic factor
loss = np.zeros(N)
for e, pd_, lgd in seg:
    thr = norm.ppf(pd_)
    cond_pd = norm.cdf((thr - np.sqrt(rho) * Z) / np.sqrt(1 - rho))   # PD given the factor (Vasicek)
    loss += e * lgd * cond_pd                                         # large-pool limit
el = sum(e * p * l for e, p, l in seg)
var = np.quantile(loss, conf)
print(f"expected loss {el:.2f}   credit VaR {conf:.1%} {var:.2f}   unexpected loss (economic capital) {var - el:.2f}")
