# Model risk reserve and ranking
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

s0, rho, q, rv = 2 / 100, 0.3, 0.99, 1
M = [("Exotic option pricing", 400, 5, 2), ("Retail PD scorecard", 2500, 2, 1), ("IFRS 9 staging", 1800, 3, 2),
     ("VaR / ES engine", 900, 3, 0.5), ("Crypto haircut", 150, 2, 3)]                      # (name, value driven, complexity, years since validation)
rng = np.random.default_rng(0); N = 200_000
C = np.full((len(M), len(M)), rho); np.fill_diagonal(C, 1.0)
Z = rng.standard_normal((N, len(M))) @ np.linalg.cholesky(C).T
tot = np.zeros(N); rows = []
for j, (nm, val, cx, yrs) in enumerate(M):
    s = s0 * cx * (1 + 0.15 * yrs * rv)                                                   # relative error grows with complexity and age
    loss = val * np.maximum(0, s * Z[:, j])                                               # only adverse errors cost
    var = np.quantile(loss, q); es = loss[loss >= var].mean(); tot += loss; rows.append((nm, var, es))
for nm, var, es in sorted(rows, key=lambda r: -r[2]): print(f"{nm:22s} VaR {var:8.1f}  ES {es:8.1f}")
agg = np.quantile(tot, q)
print(f"sum of stand-alone VaR {sum(r[1] for r in rows):.1f}   aggregate reserve {agg:.1f}   diversification {1 - agg / sum(r[1] for r in rows):.1%}")
