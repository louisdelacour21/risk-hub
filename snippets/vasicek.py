# Vasicek: default rate distribution of a large loan pool
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy.stats import norm

pd_, rho, lgd, conf = @@pd=0.02@@, @@rho=0.15@@, @@lgd=0.45@@, @@conf=0.999@@
worst = norm.cdf((norm.ppf(pd_) + np.sqrt(rho) * norm.ppf(conf)) / np.sqrt(1 - rho))   # PD in the 99.9% worst year
print(f"through-the-cycle PD {pd_:.2%};  {conf:.1%} worst-case default rate {worst:.2%};  capital K = LGD x (worst - PD) = {lgd * (worst - pd_):.2%}")
x = np.linspace(0.0005, 0.3, 6)                                          # density of the pool default rate
pdf = np.sqrt((1 - rho) / rho) * np.exp(-0.5 * (np.sqrt(1 - rho) * norm.ppf(x) - norm.ppf(pd_)) ** 2 / rho + 0.5 * norm.ppf(x) ** 2)
print("default-rate density at", x.round(4), "->", pdf.round(3))
