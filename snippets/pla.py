# FRTB P&L attribution test: Spearman and Kolmogorov-Smirnov
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy import stats

rng = np.random.default_rng(0)
hpl = rng.standard_t(5, 250) * 1.0                          # hypothetical P&L from full revaluation
rtpl = hpl * 0.9 + rng.normal(0, 0.35, 250)                 # risk-theoretical P&L from the model (Greeks)
sp = stats.spearmanr(hpl, rtpl)[0]
ks = stats.ks_2samp(hpl, rtpl).statistic
zone = "red" if sp < 0.70 or ks > 0.12 else "amber" if sp < 0.80 or ks > 0.09 else "green"
print(f"Spearman {sp:.3f} (green > 0.80, red < 0.70)   KS {ks:.3f} (green < 0.09, red > 0.12)   -> {zone}")
