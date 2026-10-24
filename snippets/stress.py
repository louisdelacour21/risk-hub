# Stress test: replay shocks on a portfolio
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

assets = ["equity", "credit", "rates", "crypto"]
w = np.array([0.40, 0.25, 0.20, 0.15])                    # portfolio weights
scenarios = {                                               # return shock per asset, in decimals
    "2008 style":      [-0.40, -0.15, 0.08, -0.60],
    "rates +200bp":    [-0.08, -0.10, -0.15, -0.10],
    "crypto winter":   [-0.05, -0.02, 0.01, -0.70],
    "inflation shock": [-0.15, -0.08, -0.12, -0.25],
}
for name, shock in scenarios.items():
    pnl = float(w @ np.array(shock))
    worst = assets[int(np.argmin(w * np.array(shock)))]
    print(f"{name:16s} P&L {pnl:+.2%}   biggest contributor: {worst}")
