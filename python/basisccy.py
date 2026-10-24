# Cross-currency basis: cost of synthetic dollar funding
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

S, rE, rU, T, bs, yU = 1.1, 0.03, 0.05, 1, -0.0035, 1
fwd_cip = S * (1 + rE * T) / (1 + rU * T)                                   # EURUSD forward with no basis
fwd_mkt = S * (1 + rE * T) / (1 + (rU + bs * -1) * T)                       # a negative basis raises the implicit USD rate
implicit_usd = (S * (1 + rE * T) / fwd_mkt - 1) / T
print(f"CIP forward {fwd_cip:.5f}   market forward {fwd_mkt:.5f}   implicit USD rate {implicit_usd:.3%} vs {rU:.3%} (extra {(implicit_usd - rU) * 1e4:.1f} bp)")
print(f"cost of {yU:g}bn of synthetic USD funding: {abs(bs) * yU * 1e9:,.0f} per year")
