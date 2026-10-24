# Population Stability Index and two-sample Kolmogorov-Smirnov drift test
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy.stats import ks_2samp

def psi(ref, new, bins=10):
    edges = np.quantile(ref, np.linspace(0, 1, bins + 1)); edges[0], edges[-1] = -np.inf, np.inf
    a = np.histogram(ref, edges)[0] / len(ref); b = np.histogram(new, edges)[0] / len(new)
    a, b = np.clip(a, 1e-6, None), np.clip(b, 1e-6, None)
    return float(np.sum((b - a) * np.log(b / a)))

rng = np.random.default_rng(1)
ref = rng.normal(0, 1, 500)                 # reference period
new = rng.normal(0.3, 1.3, 90)              # recent window: replace by your data
print("PSI:", psi(ref, new), "(< 0.10 stable, 0.10-0.25 watch, > 0.25 act)")
print("KS :", ks_2samp(ref, new))
