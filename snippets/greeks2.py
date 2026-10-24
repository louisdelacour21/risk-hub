# Second-order Greeks: vanna and volga
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy.stats import norm

S, K, r, vol, T = 100.0, 100.0, 0.0, @@vol=0.25@@, @@T=0.5@@
d1 = (np.log(S / K) + (r + 0.5 * vol**2) * T) / (vol * np.sqrt(T)); d2 = d1 - vol * np.sqrt(T)
vega = S * norm.pdf(d1) * np.sqrt(T)
vanna = -norm.pdf(d1) * d2 / vol                      # d(delta)/d(vol) = d(vega)/dS / S ... per 1.00 vol
volga = vega * d1 * d2 / vol                          # d(vega)/d(vol)
dv = @@dv=5@@ / 100
print(f"vega {vega:.4f}  vanna {vanna:.4f}  volga {volga:.4f}")
print(f"vol +{dv:.0%}: delta changes by {vanna * dv:+.4f}, vega changes by {volga * dv:+.4f}")
