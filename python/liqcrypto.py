# Crypto liquidity: unwinding a position against market depth and spread
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

# Daily returns: replace the synthetic series by your own (e.g. pd.read_csv("btc.csv")["close"].pct_change().dropna().values)
rng = np.random.default_rng(0)
r = rng.standard_t(4, 2500) * 0.02 / np.sqrt(2)

pos, pr = 1000000, 0.1
adv = 2e8                                                                    # average daily volume in USD (replace by exchange data)
days = max(1.0, pos / (pr * adv))
sig = r.std()
impact = 0.1 * sig * np.sqrt(pos / adv)                                      # square-root impact model
print(f"unwind in {days:.2f} days at {pr:.0%} participation; market impact {impact:.3%} (= {impact * pos:,.0f});  VaR 99% over the unwind {2.326 * sig * np.sqrt(days) * pos:,.0f}")
