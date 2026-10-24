# Harvest now, decrypt later: the Mosca inequality
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy.stats import norm

med, sg, spd = 12, 0.5, 1
systems = [("TLS web sessions", 2, 1), ("Customer database", 5, 7), ("Archived contracts", 10, 4), ("Your system", 3 * spd, 10)]   # (name, migration X years, secrecy Y years)
for name, x, y in systems:
    x = x / spd
    p = norm.cdf((np.log(x + y) - np.log(med)) / sg)                          # P(X + Y > Z), Z lognormal time to Q-Day
    print(f"{name:20s} X+Y = {x + y:5.1f}y  slack vs median {med - (x + y):+5.1f}y  P(exposed) = {p:.1%}")
