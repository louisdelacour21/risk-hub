# Monte-Carlo VaR: how many simulations are enough?
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy.stats import norm

reps, cf = @@reps=200@@, @@cf=0.99@@
rng = np.random.default_rng(0)
true = -norm.ppf(1 - cf)       # standard-normal VaR, known exactly
for N in (1_000, 5_000, 20_000, 100_000):
    est = np.array([np.quantile(rng.standard_normal(N), cf) for _ in range(reps)])
    print(f"N={N:>7,d}  mean {est.mean():.4f}  std {est.std():.4f}  (true {true:.4f}, relative error {est.std() / true:.2%})")
