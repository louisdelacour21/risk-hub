'use strict';
/* Python snippets, family 5: the data and portfolio pages and the risk-profile screen. Registered into PyCode.PYCODE. */
((G) => {
  const P = G.PyCode || require('./pycode.js');
  const { HDR, RETS, MULTI } = P;

  P.add({
    portfolio: () => HDR('Portfolio: weights, daily portfolio returns, volatility and diversification') + `import numpy as np
import pandas as pd
${MULTI}
w = np.array([0.4, 0.3, 0.2, 0.1])                 # weights, sum to 1 (the app normalises them the same way)
w = w / w.sum()
R = pd.DataFrame(R, columns=["A", "B", "C", "D"]) if not isinstance(R, pd.DataFrame) else R
port = R.values @ w
cov = R.cov().values * 252
vol = np.sqrt(w @ cov @ w)
vols = np.sqrt(np.diag(cov))
print(f"portfolio vol {vol:.1%},  weighted average of single vols {w @ vols:.1%},  diversification ratio {w @ vols / vol:.2f}")
print("risk contribution:", dict(zip(R.columns, np.round(w * (cov @ w) / vol**2, 3))))
print(f"annual return {port.mean() * 252:.1%},  Sharpe (rf=0) {port.mean() * 252 / vol:.2f}")
`,
    market: () => HDR('Market data: load a price CSV, compute returns and summary statistics') + `import numpy as np
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
`,
    import: () => HDR('Import: read a table pasted from Excel or a CSV file into daily returns') + `import io
import numpy as np
import pandas as pd

text = """date;close
2024-01-02;100,0
2024-01-03;101,5
2024-01-04;100,8
2024-01-05;102,2"""                                  # paste from Excel here (tab or ; separated, decimal comma allowed)
sep = "\t" if "\t" in text else (";" if ";" in text else ",")
df = pd.read_csv(io.StringIO(text), sep=sep, decimal="," if sep != "," else ".", parse_dates=[0], index_col=0)
px = df.iloc[:, 0].dropna().sort_index()
r = px.pct_change().dropna()
print(r.describe())
`,
    'run/profile': () => HDR('Risk profile: return distribution, volatility, drawdown') + `import numpy as np
import pandas as pd
from scipy import stats
${RETS}
r = pd.Series(r)
print(f"vol {r.std() * np.sqrt(252):.1%}/yr, skew {stats.skew(r):.2f}, excess kurtosis {stats.kurtosis(r):.2f}")
print("Jarque-Bera p-value:", round(stats.jarque_bera(r).pvalue, 4))
path = (1 + r).cumprod()
dd = path / path.cummax() - 1
print(f"max drawdown {dd.min():.1%},  days under water {(dd < 0).mean():.0%}")
vol20 = r.rolling(20).std() * np.sqrt(252)
print(f"20-day vol now {vol20.iloc[-1]:.1%}, min {vol20.min():.1%}, max {vol20.max():.1%}")
print("quantiles 1%/5%/50%/95%/99%:", np.round(r.quantile([.01, .05, .5, .95, .99]).values, 4))
`,
  });
  P.add({ 'run/stress': P.PYCODE.stress });
})(typeof window !== 'undefined' ? window : globalThis);
