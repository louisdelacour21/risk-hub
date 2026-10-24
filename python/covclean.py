# Covariance cleaning: sample vs Ledoit-Wolf vs random-matrix, minimum-variance out of sample
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from sklearn.covariance import LedoitWolf          # pip install scikit-learn

rng = np.random.default_rng(0)
N, T, h = 9, 60, 20
A = rng.standard_normal((N, N)); true_cov = (A @ A.T / N) * 1e-4 + np.eye(N) * 1e-4

def minvar(S):
    x = np.linalg.solve(S, np.ones(len(S))); return x / x.sum()

def rmt_clip(S):
    sd = np.sqrt(np.diag(S)); C = S / np.outer(sd, sd); ev, V = np.linalg.eigh(C)
    q = len(S) / T; lmax = (1 + np.sqrt(q)) ** 2
    ev = np.where(ev > lmax, ev, ev[ev <= lmax].mean()); C2 = V @ np.diag(ev) @ V.T
    d = np.sqrt(np.diag(C2)); C2 = C2 / np.outer(d, d)
    return C2 * np.outer(sd, sd)

res = {"sample": [], "ledoit-wolf": [], "rmt": []}
for _ in range(300):
    X = rng.multivariate_normal(np.zeros(N), true_cov, T)
    S = np.cov(X.T)
    for name, est in [("sample", S), ("ledoit-wolf", LedoitWolf().fit(X).covariance_), ("rmt", rmt_clip(S))]:
        wgt = minvar(est); res[name].append(np.sqrt(wgt @ true_cov @ wgt * h))
for k, vals in res.items(): print(f"{k:12s} realised {h}-day vol of the min-variance portfolio: {np.mean(vals):.4%}")
