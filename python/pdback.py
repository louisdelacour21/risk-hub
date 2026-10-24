# PD back-testing: binomial and traffic-light tests
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy import stats

tr, sh, g = 500, 1, 0.02          # obligors, stress shift, forecast PD
rng = np.random.default_rng(0)
pd_forecast, true_pd = g, g * (1 + sh * 0.5)
defaults = rng.binomial(tr, true_pd)
p_value = 1 - stats.binom.cdf(defaults - 1, tr, pd_forecast)           # P(at least this many defaults | forecast correct)
z = (defaults - tr * pd_forecast) / np.sqrt(tr * pd_forecast * (1 - pd_forecast))
print(f"observed defaults {defaults}, expected {tr * pd_forecast:.1f}; binomial p-value {p_value:.4f}; z {z:.2f}")
print("zone:", "red" if p_value < 0.01 else "amber" if p_value < 0.05 else "green")
