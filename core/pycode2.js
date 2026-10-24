'use strict';
/* Python snippets, family 1: market risk, tails, dependence, portfolio, econometrics. Registered into PyCode.PYCODE (see pycode.js). */
((G) => {
  const P = G.PyCode || require('./pycode.js');
  const { n, HDR, RETS, MULTI } = P;
  const IMP = 'import numpy as np\nimport pandas as pd\nfrom scipy import stats\n';

  P.add({
    stress: () => HDR('Stress test: replay shocks on a portfolio') + `import numpy as np

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
`,

    histscen: (v) => HDR('Historical stress episodes: the worst non-overlapping windows') + `${IMP}
${MULTI}
h, k = ${n(v.h, 10)}, ${n(v.k, 5)}                  # window length (days), episodes shown
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
`,

    qvar: (v) => HDR('Quantile-regression VaR (regress the quantile on risk indicators)') + `# pip install statsmodels
import numpy as np
import pandas as pd
import statsmodels.api as sm

${RETS}
cf = ${n(v.cf, 0.99)}
df = pd.DataFrame({"r": r})
df["absr"] = df.r.abs().shift(1)                                        # yesterday's absolute return
df["vol"] = df.r.rolling(20).std().shift(1)    # yesterday's 20-day volatility
df = df.dropna()
X = sm.add_constant(df[["absr", "vol"]])
fit = sm.QuantReg(df.r, X).fit(q=1 - cf)
print(fit.params)
var_t = -float(fit.predict(X.iloc[[-1]]).iloc[0])
print(f"quantile-regression VaR {cf:.0%} for tomorrow: {var_t:.4%}")
exc = (df.r < fit.predict(X)).mean()
print("hit rate (should be", round(1 - cf, 4), "):", round(float(exc), 4))
`,

    ci: (v) => HDR('How sure is your VaR? Order-statistic interval and bootstrap') + `${IMP}
${RETS}
cf, B = ${n(v.c, 0.99)}, ${n(v.w, 750)}
loss = np.sort(-r[-B:])
N = len(loss)
var = np.quantile(loss, cf)

# 1. Distribution-free 95% interval from the binomial law of order statistics
lo = int(stats.binom.ppf(0.025, N, cf)); hi = int(stats.binom.ppf(0.975, N, cf))
print(f"VaR {cf:.0%} = {var:.4%}; order-statistic 95% CI [{loss[max(lo - 1, 0)]:.4%}, {loss[min(hi, N - 1)]:.4%}]")

# 2. Bootstrap (iid resampling; use block resampling with blocks of ~10 days if returns are autocorrelated)
rng = np.random.default_rng(1)
boot = [np.quantile(rng.choice(loss, N), cf) for _ in range(2000)]
print(f"bootstrap 95% CI [{np.quantile(boot, .025):.4%}, {np.quantile(boot, .975):.4%}]")
`,

    corr: (v) => HDR('EWMA correlation (RiskMetrics) against sample correlation') + `import numpy as np

${MULTI}
lam = ${n(v.l, 0.94)}
x, y = R[:, 0], R[:, 2]
sxx = syy = sxy = 1e-4 * 0 + np.var(x[:50]); syy = np.var(y[:50]); sxy = np.cov(x[:50], y[:50])[0, 1]
rho = []
for a, b in zip(x, y):
    sxx = lam * sxx + (1 - lam) * a * a
    syy = lam * syy + (1 - lam) * b * b
    sxy = lam * sxy + (1 - lam) * a * b
    rho.append(sxy / np.sqrt(sxx * syy))
print("EWMA correlation today:", rho[-1], " full-sample:", np.corrcoef(x, y)[0, 1])
`,

    volcone: () => HDR('Volatility cone: today against the history at each horizon') + `${IMP}
${RETS}
s = pd.Series(r)
for h in (10, 20, 60, 120, 250):
    vol = s.rolling(h).std().dropna() * np.sqrt(252)
    pct = (vol < vol.iloc[-1]).mean()
    print(f"{h:4d}d  min {vol.min():.1%}  p25 {vol.quantile(.25):.1%}  median {vol.median():.1%}  p75 {vol.quantile(.75):.1%}  max {vol.max():.1%}   today {vol.iloc[-1]:.1%} (percentile {pct:.0%})")
`,

    subadd: (v) => HDR('VaR is not subadditive, ES is: n independent defaultable loans') + `import numpy as np
from scipy import stats

n, p, c, L = ${n(v.n, 2)}, ${n(v.p, 0.04)}, ${n(v.c, 0.95)}, ${n(v.L, 100)}   # loans, default probability, confidence, loss per loan

def var_es(losses, probs, c):
    order = np.argsort(losses); losses, probs = np.array(losses)[order], np.array(probs)[order]
    cum = np.cumsum(probs); i = int(np.searchsorted(cum, c - 1e-12))
    var = losses[i]
    tail = probs * (losses > var); es = (var * (cum[i] - c) + (losses * tail).sum()) / (1 - c)
    return var, es

v1, e1 = var_es([0, L], [1 - p, p], c)                       # a single loan
k = np.arange(n + 1)
vn, en = var_es(k * L, stats.binom.pmf(k, n, p), c)          # pool of n loans
print(f"one loan : VaR {v1:.1f}  ES {e1:.1f}")
print(f"pool of {n}: VaR {vn:.1f}  ES {en:.1f}   (sum of stand-alone: VaR {n * v1:.1f}, ES {n * e1:.1f})")
print("VaR subadditive?", vn <= n * v1 + 1e-9, "  ES subadditive?", en <= n * e1 + 1e-9)
`,

    deltagamma: (v) => HDR('Option book VaR: delta-normal, delta-gamma, full revaluation') + `import numpy as np
from scipy.stats import norm

S0, vol, T, h, c, k = 100.0, ${n(v.vol, 0.3)}, ${n(v.T, 0.25)}, ${n(v.h, 10)}, ${n(v.c, 0.99)}, ${n(v.k, 1)}
sign = ${v.pos === 'lc' ? 1 : -1}       # +1 long, -1 short;  straddle = call + put at strike k*S0
straddle = ${['ss', 'ls'].includes(v.pos || 'ss') ? 'True' : 'False'}
K, r = k * S0, 0.0

def bs(S, K, T, vol, call=True):
    d1 = (np.log(S / K) + 0.5 * vol**2 * T) / (vol * np.sqrt(T)); d2 = d1 - vol * np.sqrt(T)
    return S * norm.cdf(d1) - K * norm.cdf(d2) if call else K * norm.cdf(-d2) - S * norm.cdf(-d1)

def value(S, T=T):
    return sign * (bs(S, K, T, vol, True) + (bs(S, K, T, vol, False) if straddle else 0.0))

eps = 1e-3 * S0
delta = (value(S0 + eps) - value(S0 - eps)) / (2 * eps)
gamma = (value(S0 + eps) - 2 * value(S0) + value(S0 - eps)) / eps**2
sd = S0 * vol * np.sqrt(h / 252)                              # std of the spot move over h days

rng = np.random.default_rng(0); dS = rng.normal(0, sd, 500_000)
pnl_full = value(S0 + dS, T - h / 252) - value(S0)
pnl_dg = delta * dS + 0.5 * gamma * dS**2
z = norm.ppf(c)
print(f"delta {delta:.4f}  gamma {gamma:.5f}")
print("delta-normal VaR :", z * abs(delta) * sd)
print("delta-gamma  VaR :", -np.quantile(pnl_dg, 1 - c))
print("full revaluation :", -np.quantile(pnl_full, 1 - c))
`,

    sqrtt: (v) => HDR('Square-root-of-time rule against actual H-day losses') + `${IMP}
${RETS}
H, cf = ${n(v.H, 20)}, ${n(v.cf, 0.99)}
loss1 = -r
var1 = np.quantile(loss1, cf)
lossH = -pd.Series(r).rolling(H).sum().dropna().values           # overlapping H-day losses
varH = np.quantile(lossH, cf)
print(f"1-day VaR {var1:.4%};  sqrt-time scaling {var1 * np.sqrt(H):.4%};  actual {H}-day VaR {varH:.4%}")
print(f"ratio actual / scaled = {varH / (var1 * np.sqrt(H)):.2f}  (> 1: the rule understates; < 1: it overstates)")
`,

    riskbudget: (v) => HDR('Risk budgeting: contributions to portfolio volatility and VaR') + `import numpy as np
from scipy.stats import norm

${MULTI}
cf = ${n(v.cf, 0.99)}
S = np.cov(R.T)                                   # covariance matrix of daily returns
sig = np.sqrt(w @ S @ w)
mrc = S @ w / sig                                  # marginal contribution to volatility
rc = w * mrc                                       # Euler: sums to sigma
print("weights            ", w)
print("risk shares        ", np.round(rc / sig, 3))
print(f"portfolio vol {sig:.4%}   normal VaR {cf:.0%} {norm.ppf(cf) * sig:.4%}   component VaR {np.round(norm.ppf(cf) * rc, 5)}")
`,

    euler: (v) => HDR('Euler allocation of Expected Shortfall: who owns the tail') + `import numpy as np

${MULTI}
cf = ${n(v.cf, 0.975)}
pl = R @ w                                           # portfolio return
loss = -pl
var = np.quantile(loss, cf)
tail = loss >= var
es = loss[tail].mean()
contrib = -(R[tail] * w).mean(axis=0)                # E[-w_i r_i | portfolio loss >= VaR]; adds up to ES exactly
print(f"ES {cf:.1%} = {es:.4%}")
print("contributions:", np.round(contrib, 5), " sum =", contrib.sum())
print("share of tail vs share of money:", np.round(contrib / es, 3), w)
`,

    svar: (v) => HDR('Stressed VaR (Basel 2.5): VaR on the worst 12 months') + `${IMP}
${RETS}
win, mult, cf = ${n(v.win, 250)}, ${n(v.mult, 3)}, ${n(v.cf, 0.975)}
s = pd.Series(r)
vol = s.rolling(win).std()
end = int(vol.values[win:].argmax()) + win                     # end of the most volatile window
stressed = s.iloc[end - win + 1:end + 1]
var_cur = np.quantile(-s.iloc[-win:], cf)
var_str = np.quantile(-stressed, cf)
print(f"current VaR {var_cur:.4%}   stressed VaR {var_str:.4%}   (stress window ends at day {end})")
print(f"capital multiplier x (VaR + sVaR), 10-day: {mult * (var_cur + var_str) * np.sqrt(10):.4%}")
`,

    btscore: (v) => HDR('VaR scoring: pinball loss and Diebold-Mariano test between two methods') + `${IMP}
${RETS}
win, cf = ${n(v.win, 250)}, ${n(v.cf, 0.99)}
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
`,

    cdar: (v) => HDR('Drawdown risk: maximum drawdown and CDaR') + `${IMP}
${RETS}
cf = ${n(v.cf, 0.95)}
wealth = np.cumprod(1 + r)
dd = 1 - wealth / np.maximum.accumulate(wealth)                    # drawdown series (positive numbers)
dar = np.quantile(dd, cf)
cdar = dd[dd >= dar].mean()
print(f"max drawdown {dd.max():.2%}   DaR {cf:.0%} {dar:.2%}   CDaR {cdar:.2%}")
`,

    expectile: (v) => HDR('Expectile and spectral risk measure') + `import numpy as np

${RETS}
tau, k = ${n(v.tau, 0.99)}, ${n(v.k, 20)}
loss = -r

def expectile(x, tau, tol=1e-10):
    e = x.mean()
    for _ in range(200):                                           # asymmetric least squares fixed point
        w = np.where(x > e, tau, 1 - tau); new = (w * x).sum() / w.sum()
        if abs(new - e) < tol: break
        e = new
    return e

ex = expectile(loss, tau)
print(f"expectile {tau}: {ex:.4%}  (matches the VaR level {np.mean(loss <= ex):.2%} of the loss distribution)")

# exponential spectral measure: weight phi(u) = k exp(-k (1-u)) / (1 - exp(-k)) on the u-quantile
u = (np.arange(len(loss)) + 0.5) / len(loss)
phi = k * np.exp(-k * (1 - u)) / (1 - np.exp(-k))
spectral = np.sum(np.sort(loss) * phi) / len(loss)
print(f"spectral risk measure (k={k}): {spectral:.4%}   ES 99%: {loss[loss >= np.quantile(loss, .99)].mean():.4%}")
`,

    mcconv: (v) => HDR('Monte-Carlo VaR: how many simulations are enough?') + `import numpy as np

reps, cf = ${n(v.reps, 200)}, ${n(v.cf, 0.99)}
rng = np.random.default_rng(0)
true = -__import__("scipy.stats", fromlist=["norm"]).norm.ppf(1 - cf)       # standard-normal VaR, known exactly
for N in (1_000, 5_000, 20_000, 100_000):
    est = np.array([np.quantile(rng.standard_normal(N), cf) for _ in range(reps)])
    print(f"N={N:>7,d}  mean {est.mean():.4f}  std {est.std():.4f}  (true {true:.4f}, relative error {est.std() / true:.2%})")
`,

    condsim: (v) => HDR('Conditional simulation: filtered historical simulation from a calm or stormy start') + `import numpy as np

${RETS}
h, lam, cf = ${n(v.h, 10)}, ${n(v.lam, 0.94)}, ${n(v.cf, 0.99)}
sig2 = np.empty_like(r); sig2[0] = r[:50].var()
for t in range(1, len(r)):
    sig2[t] = lam * sig2[t - 1] + (1 - lam) * r[t - 1] ** 2        # EWMA variance
z = r / np.sqrt(sig2)                                               # standardised residuals
rng = np.random.default_rng(0)
for name, s0 in [("calm (p10)", np.quantile(sig2, .10)), ("median", np.median(sig2)), ("today", sig2[-1]), ("stormy (p90)", np.quantile(sig2, .90))]:
    paths = np.zeros(20_000); s = np.full(20_000, s0)
    for _ in range(h):
        e = rng.choice(z, 20_000) * np.sqrt(s)
        paths += e; s = lam * s + (1 - lam) * e**2
    print(f"{name:13s} {h}-day VaR {cf:.0%}: {-np.quantile(paths, 1 - cf):.4%}   (sqrt-time of today: {np.sqrt(h * sig2[-1]) * 2.326:.4%})")
`,

    paramunc: (v) => HDR('Estimation and method risk of a VaR') + `${IMP}
${RETS}
win, B, cf = ${n(v.win, 500)}, ${n(v.B, 400)}, ${n(v.cf, 0.99)}
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
`,

    reverse: (v) => HDR('Reverse stress test: the most plausible scenario that loses L') + `import numpy as np

${MULTI}
L = ${n(v.L, 20) / 100}                             # target loss as a share of the portfolio
h = ${n(v.h, 21)}                                    # horizon in days
S = np.cov(R.T) * h                                  # covariance over the horizon
# minimise x' S^-1 x (squared Mahalanobis distance) subject to w'x = -L  ->  x* = -L S w / (w' S w)
x = -L * (S @ w) / (w @ S @ w)
maha = L / np.sqrt(w @ S @ w)
from scipy.stats import norm
print("scenario (return per asset):", np.round(x, 4))
print(f"Mahalanobis distance {maha:.2f} sigmas;  normal probability of a move at least this bad: {norm.cdf(-maha):.3e}")
`,

    tailcop: (v) => HDR('Tail dependence: Gaussian against Student-t copula') + `import numpy as np
from scipy import stats

nu, rho, N = ${n(v.nu, 5)}, 0.5, 500_000
rng = np.random.default_rng(0)
L = np.linalg.cholesky([[1, rho], [rho, 1]])
g = rng.standard_normal((N, 2)) @ L.T
t = g / np.sqrt(rng.chisquare(nu, (N, 1)) / nu)
q = 0.01
def joint_exceed(z):
    u = stats.rankdata(z, axis=0) / (N + 1)
    return np.mean((u[:, 0] < q) & (u[:, 1] < q)) / q                 # P(U2<q | U1<q)
lam_t = 2 * stats.t.cdf(-np.sqrt((nu + 1) * (1 - rho) / (1 + rho)), nu + 1)    # theoretical lower tail dependence
print(f"P(both in worst {q:.0%} | one is): Gaussian {joint_exceed(g):.3f}   t({nu:g}) {joint_exceed(t):.3f}   theory t: {lam_t:.3f}   theory Gaussian: 0")
`,

    copfit: () => HDR('Fit Gaussian, t, Clayton and Gumbel copulas by maximum likelihood, compare by AIC') + `import numpy as np
from scipy import stats
from scipy.optimize import minimize, minimize_scalar

${MULTI}
x, y = R[:, 0], R[:, 2]
n = len(x)
u, v = stats.rankdata(x) / (n + 1), stats.rankdata(y) / (n + 1)          # pseudo-observations

def nll_gauss(rho):
    a, b = stats.norm.ppf(u), stats.norm.ppf(v)
    return -np.sum(-0.5 * np.log(1 - rho**2) - (rho**2 * (a**2 + b**2) - 2 * rho * a * b) / (2 * (1 - rho**2)))

def nll_t(p):
    rho, nu = np.tanh(p[0]), 2 + np.exp(p[1]); a, b = stats.t.ppf(u, nu), stats.t.ppf(v, nu)
    lc = (stats.multivariate_t(shape=[[1, rho], [rho, 1]], df=nu).logpdf(np.c_[a, b]) - stats.t.logpdf(a, nu) - stats.t.logpdf(b, nu))
    return -lc.sum()

def nll_clayton(th):
    return -np.sum(np.log1p(th) - (1 + th) * np.log(u * v) - (2 + 1 / th) * np.log(u**-th + v**-th - 1))

def nll_gumbel(th):
    a, b = -np.log(u), -np.log(v); s = a**th + b**th; C = np.exp(-s ** (1 / th))
    return -np.sum(np.log(C) + (th - 1) * (np.log(a) + np.log(b)) - np.log(u * v) + (1 / th - 2) * np.log(s) + np.log(s ** (1 / th) + th - 1))

fits = {}
r = minimize_scalar(nll_gauss, bounds=(-.99, .99), method="bounded"); fits["Gaussian"] = (r.fun, 1)
r = minimize(nll_t, [0.5, 1.5], method="Nelder-Mead"); fits["Student t"] = (r.fun, 2)
r = minimize_scalar(nll_clayton, bounds=(1e-3, 20), method="bounded"); fits["Clayton"] = (r.fun, 1)
r = minimize_scalar(nll_gumbel, bounds=(1.001, 20), method="bounded"); fits["Gumbel"] = (r.fun, 1)
for name, (f, k) in sorted(fits.items(), key=lambda kv: 2 * kv[1][1] + 2 * kv[1][0]):
    print(f"{name:10s} log-lik {-f:9.2f}   AIC {2 * k + 2 * f:9.2f}")
`,

    concen: () => HDR('Concentration: Herfindahl, Gini and effective number of positions') + `import numpy as np

${MULTI}
S = np.cov(R.T)
risk = w * (S @ w) / (w @ S @ w)                       # risk shares (Euler)

def stats_(s):
    s = np.sort(np.asarray(s)); n = len(s)
    hhi = (s**2).sum()
    gini = (2 * np.arange(1, n + 1) - n - 1) @ s / (n * s.sum())
    return hhi, gini, 1 / hhi
for name, s in [("capital", w), ("risk", risk)]:
    hhi, gini, neff = stats_(s)
    print(f"{name:8s} HHI {hhi:.3f}  Gini {gini:.3f}  effective N {neff:.2f}  largest share {s.max():.1%}")
`,

    depend: (v) => HDR('Dependence beyond Pearson: rank correlations, distance correlation, mutual information') + `import numpy as np
from scipy import stats

${MULTI}
N = ${n(v.n, 1000)}
x, y = R[-N:, 0], R[-N:, 2]

def dcor(a, b):
    A = np.abs(a[:, None] - a[None, :]); B = np.abs(b[:, None] - b[None, :])
    A = A - A.mean(0) - A.mean(1)[:, None] + A.mean(); B = B - B.mean(0) - B.mean(1)[:, None] + B.mean()
    return np.sqrt((A * B).mean() / np.sqrt((A * A).mean() * (B * B).mean()))

print("Pearson ", stats.pearsonr(x, y)[0])
print("Spearman", stats.spearmanr(x, y)[0], "  Kendall", stats.kendalltau(x, y)[0])
print("distance correlation", dcor(x, y))
from sklearn.feature_selection import mutual_info_regression        # pip install scikit-learn
print("mutual information  ", mutual_info_regression(x.reshape(-1, 1), y, random_state=0)[0])
dn, up = x < 0, x > 0
print("correlation when asset 1 falls:", np.corrcoef(x[dn], y[dn])[0, 1], " when it rises:", np.corrcoef(x[up], y[up])[0, 1])
`,

    covclean: (v) => HDR('Covariance cleaning: sample vs Ledoit-Wolf vs random-matrix, minimum-variance out of sample') + `import numpy as np
from sklearn.covariance import LedoitWolf          # pip install scikit-learn

rng = np.random.default_rng(0)
N, T, h = 9, ${n(v.T, 60)}, ${n(v.h, 20)}
A = rng.standard_normal((N, N)); true_cov = (A @ A.T / N) * 1e-4 + np.eye(N) * 1e-4

def minvar(S):
    x = np.linalg.solve(S, np.ones(len(S))); return x / x.sum()

def rmt_clip(S):
    sd = np.sqrt(np.diag(S)); C = S / np.outer(sd, sd); ev, V = np.linalg.eigh(C)
    q = len(S) / T; lmax = (1 + np.sqrt(q)) ** 2
    ev = np.where(ev > lmax, ev, ev[ev <= lmax].mean()); C2 = V @ np.diag(ev) @ V.T
    d = np.sqrt(np.diag(C2)); C2 = C2 / np.outer(d, d)
    return C2 * np.outer(sd, sd)

res = {"sample": [], "ledoit-wolf": [], "rmt": []}
for _ in range(300):
    X = rng.multivariate_normal(np.zeros(N), true_cov, T)
    S = np.cov(X.T)
    for name, est in [("sample", S), ("ledoit-wolf", LedoitWolf().fit(X).covariance_), ("rmt", rmt_clip(S))]:
        wgt = minvar(est); res[name].append(np.sqrt(wgt @ true_cov @ wgt * h))
for k, vals in res.items(): print(f"{k:12s} realised {h}-day vol of the min-variance portfolio: {np.mean(vals):.4%}")
`,

    higham: (v) => HDR('Nearest valid correlation matrix (Higham alternating projections)') + `import numpy as np

C = np.array([[1, ${n(v.ab, 0.9)}, ${n(v.ac, -0.9)}],
              [${n(v.ab, 0.9)}, 1, ${n(v.bc, 0.9)}],
              [${n(v.ac, -0.9)}, ${n(v.bc, 0.9)}, 1]])
print("smallest eigenvalue before:", np.linalg.eigvalsh(C).min())

def nearest_corr(A, tol=1e-10, maxit=1000):
    dS = np.zeros_like(A); Y = A.copy()
    for _ in range(maxit):
        R = Y - dS
        ev, V = np.linalg.eigh(R); X = V @ np.diag(np.maximum(ev, 0)) @ V.T      # project on PSD
        dS = X - R
        Y_new = X.copy(); np.fill_diagonal(Y_new, 1.0)                              # project on unit diagonal
        if np.linalg.norm(Y_new - Y, "fro") < tol: Y = Y_new; break
        Y = Y_new
    return Y

Cn = nearest_corr(C)
print(np.round(Cn, 4)); print("smallest eigenvalue after:", np.linalg.eigvalsh(Cn).min())
`,

    dcc: (v) => HDR('DCC-GARCH: dynamic correlation between two assets') + `# pip install arch
import numpy as np
from arch import arch_model
from scipy.optimize import minimize

${MULTI}
X = R[-${n(v.n, 1500)}:, [0, 2]] * 100
z = np.empty_like(X)
for j in range(2):                                                # step 1: univariate GARCH(1,1) on each series
    res = arch_model(X[:, j], mean="Zero", vol="GARCH", p=1, q=1).fit(disp="off")
    z[:, j] = res.resid / res.conditional_volatility

Qbar = np.cov(z.T)
def filt(p):
    a, b = p; Q = Qbar.copy(); rho = []
    for t in range(len(z)):
        d = np.sqrt(np.diag(Q)); rho.append(Q[0, 1] / (d[0] * d[1]))
        Q = (1 - a - b) * Qbar + a * np.outer(z[t], z[t]) + b * Q
    return np.array(rho)
def nll(p):
    a, b = p
    if a < 0 or b < 0 or a + b >= 0.999: return 1e10
    rho = filt(p); zz = z
    return 0.5 * np.sum(np.log(1 - rho**2) + (zz[:, 0]**2 + zz[:, 1]**2 - 2 * rho * zz[:, 0] * zz[:, 1]) / (1 - rho**2))
fit = minimize(nll, [0.03, 0.95], method="Nelder-Mead")            # step 2: correlation dynamics
rho = filt(fit.x)
print("a, b =", fit.x, "  correlation today:", rho[-1], "  range:", rho.min(), rho.max())
`,

    hrp: (v) => HDR('Equal weight, minimum variance, risk parity and Hierarchical Risk Parity') + `import numpy as np
from scipy.cluster.hierarchy import linkage, leaves_list
from scipy.optimize import minimize

${MULTI}
def hrp(S):
    C = S / np.outer(np.sqrt(np.diag(S)), np.sqrt(np.diag(S)))
    order = leaves_list(linkage(np.sqrt(0.5 * (1 - C))[np.triu_indices(len(S), 1)], "single"))
    w = np.ones(len(S))
    def cvar(idx):
        sub = S[np.ix_(idx, idx)]; ivp = 1 / np.diag(sub); ivp /= ivp.sum(); return ivp @ sub @ ivp
    def bisect(items):
        if len(items) < 2: return
        a, b = items[:len(items) // 2], items[len(items) // 2:]
        va, vb = cvar(a), cvar(b); alpha = 1 - va / (va + vb)
        w[a] *= alpha; w[b] *= 1 - alpha
        bisect(a); bisect(b)
    bisect(list(order)); return w / w.sum()

def minvar(S): x = np.linalg.solve(S, np.ones(len(S))); return x / x.sum()
def parity(S):
    f = lambda x: np.sum((x * (S @ x) - (x @ S @ x) / len(S)) ** 2)
    r = minimize(f, np.ones(len(S)) / len(S), bounds=[(0, 1)] * len(S), constraints={"type": "eq", "fun": lambda x: x.sum() - 1}); return r.x

win, reb = ${n(v.win, 500)}, ${n(v.reb, 63)}
strategies = {"equal": lambda S: np.ones(len(S)) / len(S), "min-var": minvar, "risk parity": parity, "HRP": hrp}
for name, f in strategies.items():
    pnl = []
    for t in range(win, len(R) - reb, reb):
        wt = f(np.cov(R[t - win:t].T)); pnl.extend(R[t:t + reb] @ wt)
    pnl = np.array(pnl); print(f"{name:12s} out-of-sample vol {pnl.std() * np.sqrt(252):.2%}  Sharpe {pnl.mean() / pnl.std() * np.sqrt(252):.2f}")
`,

    regimes: (v) => HDR('Two-regime Markov-switching model of returns (calm / stressed)') + `# pip install statsmodels
import numpy as np
import statsmodels.api as sm

${RETS}
K = ${n(v.K, 2)}
mod = sm.tsa.MarkovRegression(r[-${n(v.win, 3000)}:] * 100, k_regimes=K, switching_variance=True)
res = mod.fit(disp=False)
print(res.summary().tables[1])
pr = dict(zip(res.model.param_names, res.params))
sig = [np.sqrt(pr[f"sigma2[{i}]"]) for i in range(K)]
calm = int(np.argmin(sig))
print("daily vol by regime (%):", np.round(sig, 3), " probability of the stressed regime today:", 1 - res.smoothed_marginal_probabilities[-1, calm])
print("transition matrix:\\n", np.round(res.regime_transition.squeeze(), 3))
`,

    factor: (v) => HDR('Beta, alpha and idiosyncratic risk (single-factor regression)') + `import numpy as np
import pandas as pd

rng = np.random.default_rng(0)
mkt = rng.standard_t(5, 2500) * 0.01
asset = 0.0002 + 1.3 * mkt + rng.normal(0, 0.012, 2500)
w = ${n(v.w, 126)}
beta = np.cov(asset, mkt)[0, 1] / mkt.var(ddof=1)
alpha = asset.mean() - beta * mkt.mean()
res = asset - alpha - beta * mkt
r2 = 1 - res.var() / asset.var()
print(f"beta {beta:.3f}  alpha {alpha * 252:.2%}/yr  R2 {r2:.2%}  idiosyncratic vol {res.std() * np.sqrt(252):.2%}")
roll = pd.Series(asset).rolling(w).cov(pd.Series(mkt)) / pd.Series(mkt).rolling(w).var()
print(f"rolling {w}-day beta: min {roll.min():.2f}  max {roll.max():.2f}  last {roll.iloc[-1]:.2f}")
`,

    acf: (v) => HDR('Autocorrelation, AR(1) and normality tests') + `# pip install statsmodels
import numpy as np
from statsmodels.tsa.stattools import acf
from statsmodels.stats.diagnostic import acorr_ljungbox
from scipy import stats

${RETS}
L = ${n(v.lags, 25)}
print("ACF of returns :", np.round(acf(r, nlags=5)[1:], 3))
print("ACF of squares :", np.round(acf(r**2, nlags=5)[1:], 3), "  <- volatility clustering")
print(acorr_ljungbox(r**2, lags=[L]))
phi = np.corrcoef(r[1:], r[:-1])[0, 1]
print("AR(1) coefficient:", phi)
print("Jarque-Bera:", stats.jarque_bera(r), " skew", stats.skew(r), " excess kurtosis", stats.kurtosis(r))
`,

    ols: (v) => HDR('Regression with diagnostics (HAC errors, Durbin-Watson, Breusch-Pagan, Jarque-Bera)') + `# pip install statsmodels
import numpy as np
import statsmodels.api as sm
from statsmodels.stats.diagnostic import het_breuschpagan
from statsmodels.stats.stattools import durbin_watson, jarque_bera

rng = np.random.default_rng(0)
x = rng.standard_t(5, 1500) * 0.01
y = 0.0003 + 0.8 * x + rng.normal(0, 0.01, 1500)
X = sm.add_constant(x)
fit = sm.OLS(y, X).fit(cov_type=${v.se === 'hac' || v.se === undefined ? '"HAC", cov_kwds={"maxlags": 5}' : '"nonrobust"'})
print(fit.summary())
print("Durbin-Watson:", durbin_watson(fit.resid))
print("Breusch-Pagan p-value:", het_breuschpagan(fit.resid, X)[1])
print("Jarque-Bera p-value:", jarque_bera(fit.resid)[1])
`,

    unitroot: (v) => HDR('Unit roots (Augmented Dickey-Fuller) and spurious regression') + `# pip install statsmodels
import numpy as np
import statsmodels.api as sm
from statsmodels.tsa.stattools import adfuller

rng = np.random.default_rng(0)
price_a = np.cumsum(rng.normal(0, 1, 1000)); price_b = np.cumsum(rng.normal(0, 1, 1000))   # two unrelated random walks
for name, s in [("price", price_a), ("return", np.diff(price_a))]:
    stat, p, *_ = adfuller(s, regression="${v.tr || 'c'}", autolag="${(v.lg || 'aic').toUpperCase()}")
    print(f"ADF on {name}: stat {stat:.2f}, p-value {p:.3f}  ({'stationary' if p < 0.05 else 'unit root not rejected'})")

fit = sm.OLS(price_a, sm.add_constant(price_b)).fit()
print(f"spurious regression: R2 {fit.rsquared:.2f}, slope t-stat {fit.tvalues[1]:.1f}, Durbin-Watson {sm.stats.durbin_watson(fit.resid):.2f}")
`,

    fan: (v) => HDR('Where could my portfolio be? Bootstrap fan chart') + `import numpy as np

${RETS}
yrs, goal = ${n(v.y, 3)}, ${n(v.g, 0.2)}
steps, paths = int(252 * yrs), 10_000
rng = np.random.default_rng(0)
sim = rng.choice(r, (paths, steps))                                  # resample the history day by day
wealth = np.cumprod(1 + sim, axis=1)
end = wealth[:, -1]
print(f"P(loss after {yrs}y): {(end < 1).mean():.1%};  P(gain >= {goal:.0%}): {(end >= 1 + goal).mean():.1%}")
print("5% / 25% / 50% / 75% / 95% quantiles of final wealth:", np.round(np.quantile(end, [.05, .25, .5, .75, .95]), 3))
print(f"average of the worst 5% outcomes: {end[end <= np.quantile(end, .05)].mean():.3f}")
`,

    corrstab: (v) => HDR('Correlation stability: average pairwise correlation, calm days against crash days') + `import numpy as np
import pandas as pd

${MULTI}
df = pd.DataFrame(R, columns=list("ABCD"))
w_ = ${n(v.w, 180)}
iu = np.triu_indices(4, 1)
avg = [np.corrcoef(df.iloc[t - w_:t].values.T)[iu].mean() for t in range(w_, len(df), 20)]
print("rolling average pairwise correlation: min", min(avg), "max", max(avg), "last", avg[-1])
basket = df.mean(axis=1)
worst = basket <= basket.quantile(${n(v.f, 0.1)})
print("average correlation on the worst days:", np.corrcoef(df[worst].values.T)[iu].mean(), "| on other days:", np.corrcoef(df[~worst].values.T)[iu].mean())
`,

    frtb: () => HDR('FRTB internal model: Expected Shortfall 97.5% with liquidity horizons') + `import numpy as np

rng = np.random.default_rng(0)
LH = [10, 20, 40, 60, 120]                                    # liquidity horizons (days)
R = rng.standard_t(4, (2500, 5)) * np.array([.01, .012, .015, .02, .025]) / np.sqrt(2)   # one risk-factor class per horizon
w = np.ones(5)
pl = R * w

def es(x, a=0.975):
    x = -np.sort(x)[::-1][::-1]; q = np.quantile(-x, a) if False else np.quantile(x, a)
    return x[x >= q].mean()

# ES with only the factors of liquidity horizon >= LH_j shocked (nested sets), scaled to 10 days
def es_j(j):
    cols = [i for i in range(5) if LH[i] >= LH[j]]
    L = -(pl[:, cols].sum(axis=1)); q = np.quantile(L, 0.975); return L[L >= q].mean() * np.sqrt(10) / np.sqrt(1)

total = np.sqrt(sum((es_j(j) * np.sqrt((LH[j] - (LH[j - 1] if j else 0)) / 10)) ** 2 for j in range(5)))
print("FRTB ES 97.5% (10-day base, liquidity-adjusted):", total)
print("for reference, plain 10-day ES:", es_j(0))
`,

    frtbsa: () => HDR('FRTB standardised approach: delta capital by buckets (three correlation scenarios)') + `import numpy as np

# Weighted sensitivities WS = RW * sensitivity, two names in each of three buckets (replace by your own)
WS = {"A": np.array([40.0, 25.0]), "B": np.array([-30.0, 20.0]), "C": np.array([15.0, 10.0])}
rho_in, gamma = 0.30, 0.50                       # within-bucket correlation, between-bucket correlation

def charge(scale_rho, scale_gamma):
    K, S = {}, {}
    for b, ws in WS.items():
        rho = scale_rho(rho_in); M = rho * np.ones((len(ws), len(ws))); np.fill_diagonal(M, 1.0)
        K[b] = np.sqrt(max(0.0, ws @ M @ ws)); S[b] = np.clip(ws.sum(), -K[b], K[b])
    names = list(WS); tot = sum(k**2 for k in K.values())
    for i, a in enumerate(names):
        for b in names[i + 1:]: tot += 2 * scale_gamma(gamma) * S[a] * S[b]
    return np.sqrt(max(tot, 0.0))

scen = {"medium": (lambda x: x, lambda g: g),
        "high":   (lambda x: min(1.25 * x, 1.0), lambda g: min(1.25 * g, 1.0)),
        "low":    (lambda x: max(2 * x - 1, 0.75 * x), lambda g: max(2 * g - 1, 0.75 * g))}
res = {k: charge(*f) for k, f in scen.items()}
print(res, " -> capital =", max(res.values()))
`,

    pla: (v) => HDR('FRTB P&L attribution test: Spearman and Kolmogorov-Smirnov') + `import numpy as np
from scipy import stats

rng = np.random.default_rng(0)
hpl = rng.standard_t(5, 250) * 1.0                          # hypothetical P&L from full revaluation
rtpl = hpl * 0.9 + rng.normal(0, 0.35, 250)                 # risk-theoretical P&L from the model (Greeks)
sp = stats.spearmanr(hpl, rtpl)[0]
ks = stats.ks_2samp(hpl, rtpl).statistic
zone = "red" if sp < 0.70 or ks > 0.12 else "amber" if sp < 0.80 or ks > 0.09 else "green"
print(f"Spearman {sp:.3f} (green > 0.80, red < 0.70)   KS {ks:.3f} (green < 0.09, red > 0.12)   -> {zone}")
`,

    curvfrtb: (v) => HDR('FRTB curvature charge on an option position') + `import numpy as np
from scipy.stats import norm

S0, T, w, nopt = 100.0, ${n(v.T, 30)} / 365, ${n(v.w, 0.5)}, ${n(v.n, 10)}
K, vol = ${n(v.mny, 1)} * S0, 0.6
sign = ${['sc', 'ss', 'bf'].includes(v.pos || 'ss') ? -1 : 1}
straddle = ${['ss', 'ls'].includes(v.pos || 'ss') ? 'True' : 'False'}

def bs(S, call):
    d1 = (np.log(S / K) + 0.5 * vol**2 * T) / (vol * np.sqrt(T)); d2 = d1 - vol * np.sqrt(T)
    return S * norm.cdf(d1) - K * norm.cdf(d2) if call else K * norm.cdf(-d2) - S * norm.cdf(-d1)
V = lambda S: sign * nopt * (bs(S, True) + (bs(S, False) if straddle else 0))
eps = 1e-4 * S0; delta = (V(S0 + eps) - V(S0 - eps)) / (2 * eps)
up, dn = S0 * (1 + w), S0 * (1 - w)
cvr_up = -(V(up) - V(S0) - delta * (up - S0))            # shortfall against the linear (delta) estimate
cvr_dn = -(V(dn) - V(S0) - delta * (dn - S0))
print(f"CVR up {cvr_up:.2f}  CVR down {cvr_dn:.2f}  curvature charge {max(cvr_up, cvr_dn, 0):.2f}")
`,

    drc: (v) => HDR('FRTB default risk charge: jump to default, netting and hedge benefit') + `import numpy as np

lgd, hs = ${n(v.lgd, 0.75)}, ${n(v.hs, 1)}
# (issuer, notional, +1 long / -1 short, risk weight by rating)
book = [("A", 100, +1, 0.01), ("B", 60, +1, 0.04), ("C", 80, -1, 0.04), ("D", 50, +1, 0.15)]
long_jtd = sum(nm * lgd * rw_ for _, nm, s, rw_ in book if s > 0)
short_jtd = sum(nm * lgd * rw_ for _, nm, s, rw_ in book if s < 0)
gross_long = sum(nm * lgd for _, nm, s, _ in book if s > 0)
gross_short = sum(nm * lgd for _, nm, s, _ in book if s < 0)
wts = gross_long / (gross_long + gross_short)                    # weighted-to-short ratio
drc = max(0.0, long_jtd - hs * (1 - wts) * short_jtd)           # shorts only hedge a share of the longs
print(f"net long JTD {long_jtd:.2f}, short JTD {short_jtd:.2f}, hedge ratio {1 - wts:.2f}, DRC {drc:.2f}")
`,

    optbook: (v) => HDR('Option book: Greeks and full revaluation on a spot / volatility grid') + `import numpy as np
from scipy.stats import norm

S0, T, vol0, nopt, shock = 100.0, ${n(v.T, 30)} / 365, 0.6, ${n(v.n, 10)}, ${n(v.vs, 0.2)}
legs = {"ss": [(-1, 1, 1), (-1, 1, 0)], "ls": [(1, 1, 1), (1, 1, 0)], "rr": [(1, 1.1, 1), (-1, 0.9, 0)],
        "cs": [(-1, 1.1, 1), (-1, 0.9, 0)], "bf": [(1, 0.9, 1), (-2, 1.0, 1), (1, 1.1, 1)]}["${v.st || 'ss'}"]   # (qty, strike/spot, call?)

def bs(S, K, T, vol, call, greeks=False):
    d1 = (np.log(S / K) + 0.5 * vol**2 * T) / (vol * np.sqrt(T)); d2 = d1 - vol * np.sqrt(T)
    p = S * norm.cdf(d1) - K * norm.cdf(d2) if call else K * norm.cdf(-d2) - S * norm.cdf(-d1)
    if not greeks: return p
    return p, (norm.cdf(d1) if call else norm.cdf(d1) - 1), norm.pdf(d1) / (S * vol * np.sqrt(T)), S * norm.pdf(d1) * np.sqrt(T)

def book(S, vol, T=T):
    return sum(q * nopt * bs(S, k * S0, T, vol, c) for q, k, c in legs)
G = np.array([[q * nopt * x for x in bs(S0, k * S0, T, vol0, c, True)[1:]] for q, k, c in legs]).sum(axis=0)
print(f"delta {G[0]:.2f}  gamma {G[1]:.3f}  vega(per 1.00 vol) {G[2]:.2f}")
base = book(S0, vol0)
for ds in (-0.3, -0.15, 0, 0.15, 0.3):
    print(f"spot {ds:+.0%}:", [f"{book(S0 * (1 + ds), vol0 + dv) - base:+.1f}" for dv in (-shock, 0, shock)], " (vol -/0/+)")
`,

    greeks2: (v) => HDR('Second-order Greeks: vanna and volga') + `import numpy as np
from scipy.stats import norm

S, K, r, vol, T = 100.0, 100.0, 0.0, ${n(v.vol, 0.25)}, ${n(v.T, 0.5)}
d1 = (np.log(S / K) + (r + 0.5 * vol**2) * T) / (vol * np.sqrt(T)); d2 = d1 - vol * np.sqrt(T)
vega = S * norm.pdf(d1) * np.sqrt(T)
vanna = -norm.pdf(d1) * d2 / vol                      # d(delta)/d(vol) = d(vega)/dS / S ... per 1.00 vol
volga = vega * d1 * d2 / vol                          # d(vega)/d(vol)
dv = ${n(v.dv, 5)} / 100
print(f"vega {vega:.4f}  vanna {vanna:.4f}  volga {volga:.4f}")
print(f"vol +{dv:.0%}: delta changes by {vanna * dv:+.4f}, vega changes by {volga * dv:+.4f}")
`,

    krd: (v) => HDR('Key-rate DV01 and parallel / steepener / flattener shocks') + `import numpy as np

# Bond book: (maturity in years, notional, coupon). Curve: zero rates at key tenors, linear interpolation.
tenors = np.array([0.25, 1, 2, 3, 5, 7, 10, 20, 30])
zeros = np.array([.040, .041, .042, .042, .043, .044, .045, .047, .048])    # replace by your curve (${v.cv === 'eur' ? 'euro area' : 'US Treasury'})
book = [(2, 100, .03), (5, 150, .04), (10, 200, .045), (30, 50, .05)]

def pv(z):
    tot = 0.0
    for T, N, c in book:
        t = np.arange(1, T + 1.0); cf = np.full(t.shape, N * c); cf[-1] += N
        tot += (cf * np.exp(-np.interp(t, tenors, z) * t)).sum()
    return tot
base = pv(zeros); bp = 1e-4
for i, T in enumerate(tenors):
    bump = zeros.copy(); bump[i] += bp
    print(f"KRD {T:>5g}y  {pv(bump) - base:+10.4f}")
shocks = {"parallel up": np.ones_like(tenors) * 0.02, "parallel down": -np.ones_like(tenors) * 0.02,
          "steepener": -0.65 * 0.025 * np.exp(-tenors / 4) + 0.9 * 0.025 * (1 - np.exp(-tenors / 4)),
          "flattener": 0.8 * 0.025 * np.exp(-tenors / 4) - 0.6 * 0.025 * (1 - np.exp(-tenors / 4)),
          "short up": 0.025 * np.exp(-tenors / 4), "short down": -0.025 * np.exp(-tenors / 4)}
for name, s in shocks.items(): print(f"{name:14s} P&L {pv(zeros + s) - base:+10.3f}")
`,
  });
})(typeof window !== 'undefined' ? window : globalThis);
