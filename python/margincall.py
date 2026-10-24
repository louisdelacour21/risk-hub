# Margin calls on a leveraged position: liquidation probability
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

# Daily returns: replace the synthetic series by your own (e.g. pd.read_csv("btc.csv")["close"].pct_change().dropna().values)
rng = np.random.default_rng(0)
r = rng.standard_t(4, 2500) * 0.02 / np.sqrt(2)

lev, mt, h, yrs = 3, 0.25, 30, 5
x = r[-int(252 * yrs):]
hits = 0; trials = len(x) - int(h)
for i in range(trials):
    path = np.cumprod(1 + x[i:i + int(h)])
    equity = lev * path - (lev - 1)                                   # equity of the account, per unit of initial equity
    if (equity / (lev * path) <= mt).any(): hits += 1                    # margin ratio = equity / position value (lev x path)
print(f"probability of a margin call within {int(h)} days at {lev}x leverage and {mt:.0%} maintenance: {hits / trials:.1%}")
print("price drop that triggers it:", 1 - (lev - 1) / lev / (1 - mt))
