# Market data: load a price CSV, compute returns and summary statistics
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
import pandas as pd
from scipy import stats

# px = pd.read_csv("btc.csv", parse_dates=["date"], index_col="date")["close"]
rng = np.random.default_rng(0)
px = pd.Series(100 * np.exp(np.cumsum(rng.standard_t(4, 2500) * 0.014)), index=pd.bdate_range("2015-01-01", periods=2500))
r = px.pct_change().dropna()
print(f"{len(r)} returns from {r.index[0].date()} to {r.index[-1].date()}")
print(f"mean {r.mean() * 252:.1%}/yr  vol {r.std() * np.sqrt(252):.1%}/yr  skew {stats.skew(r):.2f}  excess kurtosis {stats.kurtosis(r):.2f}")
print(f"worst day {r.min():.1%} on {r.idxmin().date()},  best day {r.max():.1%}")
dd = px / px.cummax() - 1
print(f"max drawdown {dd.min():.1%}")
