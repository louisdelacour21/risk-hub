# Crypto-agility register: fund the migrations that cut expected loss most
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy.stats import norm

med, sig, k, cut = @@med=14@@, @@sig=0.4@@, @@k=3@@, @@cut=0.5@@
S = [("payments hub", 8, 3, 900), ("customer PII", 15, 4, 400), ("HSM keys", 10, 5, 250), ("backups", 7, 2, 120),
     ("treasury API", 5, 2, 300), ("archives", 20, 3, 80), ("VPN", 3, 1, 60), ("code signing", 12, 3, 150)]   # (name, shelf life X, migration Y, value m)
p = lambda x, y: norm.cdf((np.log(x + y) - np.log(med)) / sig)
rows = sorted([(nm, val * p(x, y), x, y, val) for nm, x, y, val in S], key=lambda r: -r[1])
print("ranking by expected loss:")
for nm, el, *_ in rows: print(f"  {nm:14s} {el:8.1f}")
funded = {r[0] for r in rows[: int(k)]}
after = sum(val * p(x, y * (1 - cut)) if nm in funded else val * p(x, y) for nm, x, y, val in S)
print(f"expected loss {sum(r[1] for r in rows):.1f} -> {after:.1f} after funding the top {int(k)} (migration {cut:.0%} faster)")
