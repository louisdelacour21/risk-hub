# Netting benefit and potential future exposure of a portfolio of trades
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

n_, rho, sg, T, q = @@n=5@@, @@rho=0.3@@, @@sg=0.2@@, @@T=1@@, @@q=0.95@@
rng = np.random.default_rng(0)
C = np.full((n_, n_), rho); np.fill_diagonal(C, 1.0)
Z = rng.standard_normal((100_000, n_)) @ np.linalg.cholesky(C).T
mtm = sg * np.sqrt(T) * Z * 100                                         # each trade's value at horizon T
gross = np.maximum(mtm, 0).sum(axis=1)                                  # no netting agreement
net = np.maximum(mtm.sum(axis=1), 0)                                    # with a netting agreement
print(f"expected exposure  no netting {gross.mean():.2f}   netted {net.mean():.2f}   benefit {1 - net.mean() / gross.mean():.1%}")
print(f"PFE {q:.0%}        no netting {np.quantile(gross, q):.2f}   netted {np.quantile(net, q):.2f}")
