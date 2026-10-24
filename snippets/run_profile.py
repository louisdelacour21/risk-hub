# Risk profile: return distribution, volatility, drawdown
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
import pandas as pd
from scipy import stats
@@RETS@@
r = pd.Series(r)
print(f"vol {r.std() * np.sqrt(252):.1%}/yr, skew {stats.skew(r):.2f}, excess kurtosis {stats.kurtosis(r):.2f}")
print("Jarque-Bera p-value:", round(stats.jarque_bera(r).pvalue, 4))
path = (1 + r).cumprod()
dd = path / path.cummax() - 1
print(f"max drawdown {dd.min():.1%},  days under water {(dd < 0).mean():.0%}")
vol20 = r.rolling(20).std() * np.sqrt(252)
print(f"20-day vol now {vol20.iloc[-1]:.1%}, min {vol20.min():.1%}, max {vol20.max():.1%}")
print("quantiles 1%/5%/50%/95%/99%:", np.round(r.quantile([.01, .05, .5, .95, .99]).values, 4))
