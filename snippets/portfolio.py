# Portfolio: weights, daily portfolio returns, volatility and diversification
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
import pandas as pd
@@MULTI@@
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
