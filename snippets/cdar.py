# Drawdown risk: maximum drawdown and CDaR
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
@@IMP@@
@@RETS@@
cf = @@cf=0.95@@
wealth = np.cumprod(1 + r)
dd = 1 - wealth / np.maximum.accumulate(wealth)                    # drawdown series (positive numbers)
dar = np.quantile(dd, cf)
cdar = dd[dd >= dar].mean()
print(f"max drawdown {dd.max():.2%}   DaR {cf:.0%} {dar:.2%}   CDaR {cdar:.2%}")
