# Basel III standardised measurement approach (operational risk capital)
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

bi, al, ev = @@bi=5000@@, @@al=100@@, @@ev=300@@        # business indicator (m), average annual loss (m), event count
if bi <= 1000: bic = 0.12 * bi
elif bi <= 30000: bic = 0.12 * 1000 + 0.15 * (bi - 1000)
else: bic = 0.12 * 1000 + 0.15 * 29000 + 0.18 * (bi - 30000)
lc = 15 * al                                                              # loss component: 15 x average annual loss over 10 years
ilm = np.log(np.exp(1) - 1 + (lc / bic) ** 0.8) if bi > 1000 else 1.0
print(f"business indicator component {bic:.1f}  loss component {lc:.1f}  internal loss multiplier {ilm:.3f}  capital {bic * ilm:.1f}")
