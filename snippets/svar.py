# Stressed VaR (Basel 2.5): VaR on the worst 12 months
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
@@IMP@@
@@RETS@@
win, mult, cf = @@win=250@@, @@mult=3@@, @@cf=0.975@@
s = pd.Series(r)
vol = s.rolling(win).std()
end = int(vol.values[win:].argmax()) + win                     # end of the most volatile window
stressed = s.iloc[end - win + 1:end + 1]
var_cur = np.quantile(-s.iloc[-win:], cf)
var_str = np.quantile(-stressed, cf)
print(f"current VaR {var_cur:.4%}   stressed VaR {var_str:.4%}   (stress window ends at day {end})")
print(f"capital multiplier x (VaR + sVaR), 10-day: {mult * (var_cur + var_str) * np.sqrt(10):.4%}")
