# Expectile and spectral risk measure
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

# Daily returns: replace the synthetic series by your own (e.g. pd.read_csv("btc.csv")["close"].pct_change().dropna().values)
rng = np.random.default_rng(0)
r = rng.standard_t(4, 2500) * 0.02 / np.sqrt(2)

tau, k = 0.99, 20
loss = -r

def expectile(x, tau, tol=1e-10):
    e = x.mean()
    for _ in range(200):                                           # asymmetric least squares fixed point
        w = np.where(x > e, tau, 1 - tau); new = (w * x).sum() / w.sum()
        if abs(new - e) < tol: break
        e = new
    return e

ex = expectile(loss, tau)
print(f"expectile {tau}: {ex:.4%}  (matches the VaR level {np.mean(loss <= ex):.2%} of the loss distribution)")

# exponential spectral measure: weight phi(u) = k exp(-k (1-u)) / (1 - exp(-k)) on the u-quantile
u = (np.arange(len(loss)) + 0.5) / len(loss)
phi = k * np.exp(-k * (1 - u)) / (1 - np.exp(-k))
spectral = np.sum(np.sort(loss) * phi) / len(loss)
print(f"spectral risk measure (k={k}): {spectral:.4%}   ES 99%: {loss[loss >= np.quantile(loss, .99)].mean():.4%}")
