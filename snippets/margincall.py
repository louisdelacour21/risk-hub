# Margin calls on a leveraged position: liquidation probability
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

@@RETS@@
lev, mt, h, yrs = @@lev=3@@, @@mt=0.25@@, @@h=30@@, @@yrs=5@@
x = r[-int(252 * yrs):]
hits = 0; trials = len(x) - int(h)
for i in range(trials):
    path = np.cumprod(1 + x[i:i + int(h)])
    equity = lev * path - (lev - 1)                                   # equity of the account, per unit of initial equity
    if (equity / (lev * path) <= mt).any(): hits += 1                    # margin ratio = equity / position value (lev x path)
print(f"probability of a margin call within {int(h)} days at {lev}x leverage and {mt:.0%} maintenance: {hits / trials:.1%}")
print("price drop that triggers it:", 1 - (lev - 1) / lev / (1 - mt))
