# FRTB default risk charge: jump to default, netting and hedge benefit
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

lgd, hs = @@lgd=0.75@@, @@hs=1@@
# (issuer, notional, +1 long / -1 short, risk weight by rating)
book = [("A", 100, +1, 0.01), ("B", 60, +1, 0.04), ("C", 80, -1, 0.04), ("D", 50, +1, 0.15)]
long_jtd = sum(nm * lgd * rw_ for _, nm, s, rw_ in book if s > 0)
short_jtd = sum(nm * lgd * rw_ for _, nm, s, rw_ in book if s < 0)
gross_long = sum(nm * lgd for _, nm, s, _ in book if s > 0)
gross_short = sum(nm * lgd for _, nm, s, _ in book if s < 0)
wts = gross_long / (gross_long + gross_short)                    # weighted-to-short ratio
drc = max(0.0, long_jtd - hs * (1 - wts) * short_jtd)           # shorts only hedge a share of the longs
print(f"net long JTD {long_jtd:.2f}, short JTD {short_jtd:.2f}, hedge ratio {1 - wts:.2f}, DRC {drc:.2f}")
