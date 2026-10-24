# Risk and control self-assessment: severity x frequency and aggregation with correlation
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy.stats import norm

fm, sm, rho, q = 1, 1, 0.3, 0.99
risks = [("fraud", 2, 0.5), ("system outage", 6, 0.2), ("process error", 20, 0.05), ("legal", 0.5, 2.0)]   # (events per year, mean loss in m)
rng = np.random.default_rng(0)
N = 100_000
C = np.full((4, 4), rho); np.fill_diagonal(C, 1.0)
Z = rng.standard_normal((N, 4)) @ np.linalg.cholesky(C).T
tot = np.zeros(N); stand = []
for j, (_, f, s) in enumerate(risks):
    u = norm.cdf(Z[:, j])     # correlated uniform
    k = np.random.default_rng(j).poisson(f * fm, N)
    loss = k * s * sm * np.exp(rng.normal(0, 0.5, N)) * (0.5 + u)
    tot += loss; stand.append(np.quantile(loss, q))
print(f"stand-alone VaR {q:.0%}: {np.round(stand, 2)}  sum {sum(stand):.2f}   aggregate VaR with dependence {np.quantile(tot, q):.2f}")
