# VaR scoring: pinball loss and Diebold-Mariano test between two methods
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
@@IMP@@
@@RETS@@
win, cf = @@win=250@@, @@cf=0.99@@
q = 1 - cf
hist, norm_ = [], []
for t in range(win, len(r)):
    past = r[t - win:t]
    hist.append(np.quantile(past, q))
    norm_.append(past.mean() + past.std(ddof=1) * stats.norm.ppf(q))
y = r[win:]; hist, norm_ = np.array(hist), np.array(norm_)
pinball = lambda f: np.mean((q - (y < f)) * (y - f))              # lower is better
print("breaches: historical", (y < hist).mean(), " normal", (y < norm_).mean(), " target", q)
print("pinball loss: historical", pinball(hist), " normal", pinball(norm_))
d = (q - (y < hist)) * (y - hist) - (q - (y < norm_)) * (y - norm_)
dm = d.mean() / (d.std(ddof=1) / np.sqrt(len(d)))                 # simple DM (no HAC correction)
print("Diebold-Mariano stat", dm, "p-value", 2 * (1 - stats.norm.cdf(abs(dm))))
