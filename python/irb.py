# Basel IRB risk-weight formula (corporate)
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy.stats import norm

pd_, lgd, M, ead = 0.02, 0.45, 2.5, 100
pd_ = max(pd_, 0.0003)                                              # regulatory floor
w = (1 - np.exp(-50 * pd_)) / (1 - np.exp(-50))
R = 0.12 * w + 0.24 * (1 - w)                                        # asset correlation
b = (0.11852 - 0.05478 * np.log(pd_)) ** 2                           # maturity adjustment
K = (lgd * norm.cdf((norm.ppf(pd_) + np.sqrt(R) * norm.ppf(0.999)) / np.sqrt(1 - R)) - pd_ * lgd) * (1 + (M - 2.5) * b) / (1 - 1.5 * b)
rw = K * 12.5
print(f"asset correlation {R:.3f}  capital K {K:.4f}  risk weight {rw:.1%}  RWA {rw * ead:.2f}  capital (8%) {0.08 * rw * ead:.2f}")
