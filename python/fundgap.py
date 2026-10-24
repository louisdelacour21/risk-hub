# Funding gap ladder: inflows, outflows and rollover
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

buckets = ["1d", "1w", "1m", "3m", "6m", "1y"]
inflow = np.array([10, 15, 30, 40, 60, 90.0])
outflow = np.array([12, 25, 55, 70, 80, 100.0])
roll, delay, lim = 70 / 100, 10 / 100, 20
net = inflow * (1 - delay) - outflow * (1 - roll)
cum = np.cumsum(net)
for b, g, c in zip(buckets, net, cum):
    print(f"{b:>3s}  gap {g:+7.1f}  cumulative {c:+7.1f}  {'BREACH' if c < -lim else ''}")
