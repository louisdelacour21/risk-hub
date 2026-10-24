# Square-root-of-time rule against actual H-day losses
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
@@IMP@@
@@RETS@@
H, cf = @@H=20@@, @@cf=0.99@@
loss1 = -r
var1 = np.quantile(loss1, cf)
lossH = -pd.Series(r).rolling(H).sum().dropna().values           # overlapping H-day losses
varH = np.quantile(lossH, cf)
print(f"1-day VaR {var1:.4%};  sqrt-time scaling {var1 * np.sqrt(H):.4%};  actual {H}-day VaR {varH:.4%}")
print(f"ratio actual / scaled = {varH / (var1 * np.sqrt(H)):.2f}  (> 1: the rule understates; < 1: it overstates)")
