# Conditional simulation: filtered historical simulation from a calm or stormy start
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

# Daily returns: replace the synthetic series by your own (e.g. pd.read_csv("btc.csv")["close"].pct_change().dropna().values)
rng = np.random.default_rng(0)
r = rng.standard_t(4, 2500) * 0.02 / np.sqrt(2)

h, lam, cf = 10, 0.94, 0.99
sig2 = np.empty_like(r); sig2[0] = r[:50].var()
for t in range(1, len(r)):
    sig2[t] = lam * sig2[t - 1] + (1 - lam) * r[t - 1] ** 2        # EWMA variance
z = r / np.sqrt(sig2)                                               # standardised residuals
rng = np.random.default_rng(0)
for name, s0 in [("calm (p10)", np.quantile(sig2, .10)), ("median", np.median(sig2)), ("today", sig2[-1]), ("stormy (p90)", np.quantile(sig2, .90))]:
    paths = np.zeros(20_000); s = np.full(20_000, s0)
    for _ in range(h):
        e = rng.choice(z, 20_000) * np.sqrt(s)
        paths += e; s = lam * s + (1 - lam) * e**2
    print(f"{name:13s} {h}-day VaR {cf:.0%}: {-np.quantile(paths, 1 - cf):.4%}   (sqrt-time of today: {np.sqrt(h * sig2[-1]) * 2.326:.4%})")
