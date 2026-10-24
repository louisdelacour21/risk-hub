# FRTB standardised approach: delta capital by buckets (three correlation scenarios)
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

# Weighted sensitivities WS = RW * sensitivity, two names in each of three buckets (replace by your own)
WS = {"A": np.array([40.0, 25.0]), "B": np.array([-30.0, 20.0]), "C": np.array([15.0, 10.0])}
rho_in, gamma = 0.30, 0.50                       # within-bucket correlation, between-bucket correlation

def charge(scale_rho, scale_gamma):
    K, S = {}, {}
    for b, ws in WS.items():
        rho = scale_rho(rho_in); M = rho * np.ones((len(ws), len(ws))); np.fill_diagonal(M, 1.0)
        K[b] = np.sqrt(max(0.0, ws @ M @ ws)); S[b] = np.clip(ws.sum(), -K[b], K[b])
    names = list(WS); tot = sum(k**2 for k in K.values())
    for i, a in enumerate(names):
        for b in names[i + 1:]: tot += 2 * scale_gamma(gamma) * S[a] * S[b]
    return np.sqrt(max(tot, 0.0))

scen = {"medium": (lambda x: x, lambda g: g),
        "high":   (lambda x: min(1.25 * x, 1.0), lambda g: min(1.25 * g, 1.0)),
        "low":    (lambda x: max(2 * x - 1, 0.75 * x), lambda g: max(2 * g - 1, 0.75 * g))}
res = {k: charge(*f) for k, f in scen.items()}
print(res, " -> capital =", max(res.values()))
