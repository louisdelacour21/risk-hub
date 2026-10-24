# Estimation and method risk of a VaR
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
@@IMP@@
@@RETS@@
win, B, cf = @@win=500@@, @@B=400@@, @@cf=0.99@@
x = -r[-win:]
rng = np.random.default_rng(0)

methods = {
    "historical": lambda l: np.quantile(l, cf),
    "normal":     lambda l: l.mean() + l.std(ddof=1) * stats.norm.ppf(cf),
    "student-t":  lambda l: stats.t.ppf(cf, *stats.t.fit(l)[:1], *stats.t.fit(l)[1:]),
    "EWMA":       lambda l: np.sqrt(np.sum(0.94 ** np.arange(len(l))[::-1] * l**2) * 0.06) * stats.norm.ppf(cf),
}
for name, f in methods.items():
    boot = [f(rng.choice(x, win)) for _ in range(B)]
    print(f"{name:11s} VaR {f(x):.4%}   estimation interval 95% [{np.quantile(boot, .025):.4%}, {np.quantile(boot, .975):.4%}]")
est = np.array([f(x) for f in methods.values()])
print(f"spread across methods (method risk): {est.max() - est.min():.4%}")
