# Deposit run-off, liquidity buffer survival and stable funding
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

rcap, ccap, tau, rr, hq, hc, keep = @@rcap=5@@, @@ccap=5@@, @@tau=30@@, @@rr=10@@, @@hq=15@@, @@hc=10@@, @@keep=50@@
days = np.arange(0, 91)
retail = 100 * np.exp(-rr / 100 * days / tau * 0.3)                     # retail deposits, slow decay
corp = 100 * np.exp(-days / tau)                                         # corporate deposits, faster
outflow = (100 - retail) * rcap / 100 + (100 - corp) * ccap / 100
buffer = hq * (1 - hc / 100) + 0 * days
net = buffer - np.cumsum(np.gradient(outflow))
print("cumulative outflow at 30 / 60 / 90 days:", np.round(outflow[[30, 60, 90]], 2))
survival = days[np.argmax(buffer < outflow)] if (buffer < outflow).any() else None
print("buffer exhausted on day:", survival if survival is not None else "not within 90 days")
