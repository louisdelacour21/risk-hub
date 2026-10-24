# Funds transfer pricing: matched-maturity transfer rate and liquidity premium
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

T, base, liq, theta, pool, N = 5, 0.03, 0.01, 0.2, 0, 100
curve = lambda t: base + 0.004 * np.log1p(t)                              # swap curve placeholder
matched = curve(T) + liq * (1 - np.exp(-T / 3))                           # swap rate + liquidity premium growing with the term
pooled = curve(1) + liq                                                   # single pool rate (what the bank charges without matching)
print(f"matched-maturity FTP {matched:.3%}   pool FTP {pooled:.3%}   difference per {N}m: {(matched - pooled) * N * 1e6:,.0f} / year")
