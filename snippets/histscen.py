# Historical stress episodes: the worst non-overlapping windows
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
@@IMP@@
@@MULTI@@
h, k = @@h=10@@, @@k=5@@                  # window length (days), episodes shown
pnl = pd.Series(R @ w)
roll = pnl.rolling(h).sum().dropna()                 # h-day P&L (sum of daily returns)
picked = []
for end, val in roll.sort_values().items():
    if all(abs(end - e) >= h for e, _ in picked):    # non-overlapping
        picked.append((end, val))
    if len(picked) == k: break
for end, val in picked:
    seg = R[end - h + 1:end + 1].sum(axis=0) * w
    print(f"days {end - h + 1}-{end}: portfolio {val:+.2%}   by asset {np.round(seg, 4)}")
