'use strict';
/* Python snippets, family 3: quantum risk, AI model risk, crypto credit, model risk and stochastic processes. Registered into PyCode.PYCODE. */
((G) => {
  const P = G.PyCode || require('./pycode.js');
  const { n, HDR, RETS, MULTI } = P;

  P.add({
    qday: (v) => HDR('Q-Day as a tail event on a crypto book') + `import numpy as np
from scipy.stats import norm

med, sg, yr, J, cf = ${n(v.med, 6)}, ${n(v.sg, 0.5)}, ${n(v.yr, 3)}, ${n(v.J, 0.5)}, ${n(v.cf, 0.99)}
F = lambda t: norm.cdf((np.log(t) - np.log(med)) / sg)                      # P(Q-Day <= t), lognormal
p_year = (F(yr + 1) - F(yr)) / (1 - F(yr))                                   # Q-Day falls in the year starting at yr, given it has not happened
print(f"P(Q-Day within that year | not yet) = {p_year:.2%}")

book = {"BTC": 0.5, "ETH": 0.3, "SOL": 0.2}                                  # weights (replace by yours)
shock_btc = -0.5                                                              # Bitcoin loss if keys fall
tail_beta = {"BTC": 1.0, "ETH": 0.8, "SOL": 0.7}                              # tail dependence measured on your data (see Tail dependence module)
loss_if_qday = -sum(w * shock_btc * tail_beta[k] for k, w in book.items())
print(f"book loss if Q-Day occurs: {loss_if_qday:.1%};  expected loss over the year {p_year * loss_if_qday:.2%}")
rng = np.random.default_rng(0); N = 1_000_000
hit = rng.random(N) < p_year
loss = hit * loss_if_qday * np.exp(rng.normal(0, 0.2, N)) + (~hit) * np.abs(rng.standard_t(4, N)) * 0.01
print(f"{cf:.0%} VaR {np.quantile(loss, cf):.2%}   ES {loss[loss >= np.quantile(loss, cf)].mean():.2%}   (p_year {'above' if p_year > 1 - cf else 'below'} the tail level {1 - cf:.0%})")
`,

    qharvest: (v) => HDR('Harvest now, decrypt later: the Mosca inequality') + `import numpy as np
from scipy.stats import norm

med, sg, spd = ${n(v.med, 12)}, ${n(v.sg, 0.5)}, ${n(v.spd, 1)}
systems = [("TLS web sessions", 2, 1), ("Customer database", 5, 7), ("Archived contracts", 10, 4), ("Your system", ${n(v.ux, 3)} * spd, ${n(v.uy, 10)})]   # (name, migration X years, secrecy Y years)
for name, x, y in systems:
    x = x / spd
    p = norm.cdf((np.log(x + y) - np.log(med)) / sg)                          # P(X + Y > Z), Z lognormal time to Q-Day
    print(f"{name:20s} X+Y = {x + y:5.1f}y  slack vs median {med - (x + y):+5.1f}y  P(exposed) = {p:.1%}")
`,

    qagile: (v) => HDR('Crypto-agility register: fund the migrations that cut expected loss most') + `import numpy as np
from scipy.stats import norm

med, sig, k, cut = ${n(v.med, 14)}, ${n(v.sig, 0.4)}, ${n(v.k, 3)}, ${n(v.cut, 0.5)}
S = [("payments hub", 8, 3, 900), ("customer PII", 15, 4, 400), ("HSM keys", 10, 5, 250), ("backups", 7, 2, 120),
     ("treasury API", 5, 2, 300), ("archives", 20, 3, 80), ("VPN", 3, 1, 60), ("code signing", 12, 3, 150)]   # (name, shelf life X, migration Y, value m)
p = lambda x, y: norm.cdf((np.log(x + y) - np.log(med)) / sig)
rows = sorted([(nm, val * p(x, y), x, y, val) for nm, x, y, val in S], key=lambda r: -r[1])
print("ranking by expected loss:")
for nm, el, *_ in rows: print(f"  {nm:14s} {el:8.1f}")
funded = {r[0] for r in rows[: int(k)]}
after = sum(val * p(x, y * (1 - cut)) if nm in funded else val * p(x, y) for nm, x, y, val in S)
print(f"expected loss {sum(r[1] for r in rows):.1f} -> {after:.1f} after funding the top {int(k)} (migration {cut:.0%} faster)")
`,

    proxy: (v) => HDR('Removing a sensitive variable does not remove its effect (proxy discrimination)') + `import numpy as np

rho, bx, bz, noise = ${n(v.rho, 0.6)}, ${n(v.bx, 0.5)}, ${n(v.bz, 0.4)}, ${n(v.noise, 1)}
N = 5000; rng = np.random.default_rng(9)
z = (rng.random(N) < 0.5).astype(float)                                       # protected group
zs = (z - z.mean()) / z.std()
x = rho * zs + np.sqrt(1 - rho**2) * rng.standard_normal(N)                    # proxy correlated with the group
y = bx * x + bz * z + noise * rng.standard_normal(N)
ols = lambda *cols: np.linalg.lstsq(np.c_[np.ones(N), *cols], y, rcond=None)[0]
full, noz = ols(x, z), ols(x)
print(f"with the group   : proxy coefficient {full[1]:.3f} (true {bx})  group {full[2]:.3f} (true {bz})")
print(f"without the group: proxy coefficient {noz[1]:.3f}   <- inflated by omitted-variable bias")
pred = noz[0] + noz[1] * x
print(f"gap in predictions between groups despite removing z: {pred[z == 1].mean() - pred[z == 0].mean():+.3f}  (gap in outcomes {y[z == 1].mean() - y[z == 0].mean():+.3f})")
`,

    xai: (v) => HDR('Explaining a scoring model: permutation importance and exact Shapley values') + `# pip install scikit-learn
import numpy as np
from itertools import combinations
from math import factorial
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

rho, who = ${n(v.rho, 0.8)}, "${v.who || 'hi'}"
names = ["debt ratio", "utilisation", "income", "age", "late payments"]
rng = np.random.default_rng(0); N = 3000
base = rng.standard_normal((N, 5)); X = base.copy(); X[:, 1] = rho * X[:, 0] + np.sqrt(1 - rho**2) * X[:, 1]
y = rng.random(N) < 1 / (1 + np.exp(-(-1.5 + 0.8 * X[:, 0] + 0.4 * X[:, 1] - 0.6 * X[:, 2] - 0.1 * X[:, 3] + 0.7 * X[:, 4])))
m = LogisticRegression().fit(X, y)
auc = roc_auc_score(y, m.predict_proba(X)[:, 1])
imp = []
for j in range(5):                                                             # permutation importance = drop in AUC
    Xp = X.copy(); Xp[:, j] = rng.permutation(Xp[:, j]); imp.append(auc - roc_auc_score(y, m.predict_proba(Xp)[:, 1]))
print("permutation importance:", dict(zip(names, np.round(imp, 4))))

score = m.decision_function(X)
x0 = X[np.argsort(score)[{"hi": int(.95 * N), "mid": N // 2, "lo": int(.05 * N)}[who]]]
mu = X.mean(axis=0)
def value(S):                                                                  # model output with features outside S set to the mean
    z = mu.copy(); z[list(S)] = x0[list(S)]; return float(m.decision_function(z[None])[0])
phi = np.zeros(5)
for j in range(5):                                                             # exact Shapley by enumerating the 2^4 coalitions
    others = [i for i in range(5) if i != j]
    for r in range(5):
        for S in combinations(others, r):
            wgt = factorial(r) * factorial(4 - r) / factorial(5)
            phi[j] += wgt * (value(S + (j,)) - value(S))
print("Shapley (log-odds):", dict(zip(names, np.round(phi, 3))), "  sum", phi.sum().round(3), "= f(x) - f(mean) =", round(value(range(5)) - value([]), 3))
`,

    mrank: (v) => HDR('Model risk reserve and ranking') + `import numpy as np

s0, rho, q, rv = ${n(v.s0, 2)} / 100, ${n(v.rho, 0.3)}, ${n(v.q, 0.99)}, ${n(v.rv, 1)}
M = [("Exotic option pricing", 400, 5, 2), ("Retail PD scorecard", 2500, 2, 1), ("IFRS 9 staging", 1800, 3, 2),
     ("VaR / ES engine", 900, 3, 0.5), ("Crypto haircut", 150, 2, 3)]                      # (name, value driven, complexity, years since validation)
rng = np.random.default_rng(0); N = 200_000
C = np.full((len(M), len(M)), rho); np.fill_diagonal(C, 1.0)
Z = rng.standard_normal((N, len(M))) @ np.linalg.cholesky(C).T
tot = np.zeros(N); rows = []
for j, (nm, val, cx, yrs) in enumerate(M):
    s = s0 * cx * (1 + 0.15 * yrs * rv)                                                   # relative error grows with complexity and age
    loss = val * np.maximum(0, s * Z[:, j])                                               # only adverse errors cost
    var = np.quantile(loss, q); es = loss[loss >= var].mean(); tot += loss; rows.append((nm, var, es))
for nm, var, es in sorted(rows, key=lambda r: -r[2]): print(f"{nm:22s} VaR {var:8.1f}  ES {es:8.1f}")
agg = np.quantile(tot, q)
print(f"sum of stand-alone VaR {sum(r[1] for r in rows):.1f}   aggregate reserve {agg:.1f}   diversification {1 - agg / sum(r[1] for r in rows):.1%}")
`,

    fairreal: (v) => HDR('Fairness metrics on a credit scoring model') + `# The page uses the German Credit file (UCI, CC BY 4.0). To use it: fetch_openml("credit-g") and build the features/group below from it.
# pip install scikit-learn
import numpy as np
from sklearn.linear_model import LogisticRegression

rng = np.random.default_rng(0); N = 1000
group = rng.random(N) < 0.3                                                      # 1 = group compared ("${v.grp || 'female'}")
X = rng.standard_normal((N, 5)); X[:, 0] += 0.4 * group                          # a proxy variable correlated with the group
y = (rng.random(N) < 1 / (1 + np.exp(-(0.8 + 0.7 * X[:, 0] - 0.5 * X[:, 1] + 0.3 * X[:, 2] - 0.2 * group)))).astype(int)   # 1 = repaid
use_attr = ${v.use === 'no' ? 'False' : 'True'}
F = np.c_[X, group] if use_attr else X
m = LogisticRegression().fit(F, y)
pred = m.predict_proba(F)[:, 1] > ${n(v.t, 0.5)}                                 # approve above the threshold
def rate(mask, a): return a[mask].mean()
dp = rate(group, pred) - rate(~group, pred)                                       # demographic parity gap
tpr = lambda g: pred[g & (y == 1)].mean(); eo = tpr(group) - tpr(~group)          # equal opportunity gap
prec = lambda g: y[g & pred].mean(); pp = prec(group) - prec(~group)              # predictive parity gap
di = rate(group, pred) / rate(~group, pred)                                       # disparate impact ratio (four-fifths rule: >= 0.80)
print(f"approval rate gap {dp:+.3f}   equal-opportunity gap {eo:+.3f}   predictive-parity gap {pp:+.3f}   disparate impact {di:.2f}")
`,

    kmvcrypto: (v) => HDR('KMV / Merton on a crypto-backed loan: distance to default and liquidation') + `import numpy as np
from scipy.stats import norm

${RETS}
ltv, liq, h, T = ${n(v.ltv, 0.6)}, ${n(v.liq, 0.85)}, ${n(v.h, 30)}, ${n(v.h, 30)} / 365
pen, dr = ${n(v.pen, 0.05)}, ${n(v.dr, 0)}
vol = r[-int(365 * ${n(v.yrs, 3)}):].std() * np.sqrt(365)                       # annualised (crypto trades every day)
mu = dr
dd = (-np.log(ltv / liq) + (mu - 0.5 * vol**2) * T) / (vol * np.sqrt(T))         # distance to default of the Merton firm
pd_end = norm.cdf(-dd)                                                           # collateral below the threshold at the horizon
# probability of touching the barrier at any time before T (reflection principle, zero-drift approximation)
b = np.log(ltv / liq); pd_touch = 2 * norm.cdf(-abs(b) / (vol * np.sqrt(T)))
print(f"vol {vol:.1%}  distance to default {dd:.2f}  P(below threshold at T) {pd_end:.2%}  P(touch before T) {pd_touch:.2%}")
print(f"expected liquidation loss (penalty {pen:.0%} of the loan) ~ {pd_touch * pen:.3%} of the loan")
`,

    ltvmig: (v) => HDR('Loan-to-value migration matrix from price history (CreditMetrics style)') + `import numpy as np

${RETS}
liq, h, pen = ${n(v.liq, 0.85)}, int(${n(v.h, 30)}), ${n(v.pen, 0.05)}
edges = np.array([0, .2, .4, .6, .8, liq]); k = len(edges) - 1
mid = (edges[:-1] + edges[1:]) / 2
logp = np.cumsum(r[-int(365 * ${n(v.yrs, 3)}):])
ratio = np.exp(logp[h:] - logp[:-h])                                              # overlapping h-day price ratios
M = np.zeros((k, k + 1))
for i, l0 in enumerate(mid):
    l1 = l0 / ratio                                                               # LTV at the horizon
    for j in range(k): M[i, j] = np.mean((l1 >= edges[j]) & (l1 < edges[j + 1]))
    M[i, k] = np.mean(l1 >= liq)                                                  # liquidation (absorbing)
print("rows: starting band, columns: bands 0-20..80-liq, liquidation")
print(np.round(M, 3))
print(f"expected loss for the last band (penalty {pen:.0%}):", M[-1, -1] * pen)
`,

    wwrcrypto: (v) => HDR('Wrong-way risk on CVA: counterparty default linked to a price fall') + `import numpy as np
from scipy.stats import norm

${RETS}
rho, sp, lgd, T, mny = ${n(v.rho, 0.5)}, ${n(v.sp, 0.03)}, ${n(v.lgd, 0.6)}, ${n(v.T, 1)}, ${n(v.mny, 1)}
vol = r.std() * np.sqrt(365); S0 = 100.0; K = mny * S0
N = 400_000; rng = np.random.default_rng(0)
Zs = rng.standard_normal(N)                                                       # price shock
Zd = rho * -Zs + np.sqrt(1 - rho**2) * rng.standard_normal(N)                     # their credit shock, linked to a price FALL
ST = S0 * np.exp(-0.5 * vol**2 * T + vol * np.sqrt(T) * Zs)
pos = "${v.pos || 'put'}"
expo = {"put": np.maximum(K - ST, 0), "fwdShort": np.maximum(S0 - ST, 0), "fwdLong": np.maximum(ST - S0, 0)}[pos]
pd_ = 1 - np.exp(-sp / lgd * T)
default = Zd < norm.ppf(pd_)                                                      # default indicator under the copula
cva_wrong = lgd * (expo * default).mean()
cva_indep = lgd * expo.mean() * pd_
print(f"CVA independent {cva_indep:.4f}   CVA with wrong-way link {cva_wrong:.4f}   uplift x{cva_wrong / cva_indep:.2f}")
`,

    modelbench: (v) => HDR('Model risk: the same calibration, three pricing models (Black-Scholes, Merton jumps, Heston)') + `import numpy as np
from scipy.stats import norm

S0, vol, T = 100.0, ${n(v.vol, 0.22)}, ${n(v.T, 1)}
lam, mj, sj = ${n(v.lam, 0.5)}, ${n(v.mj, -0.1)}, 0.15
xi, rho, ka = ${n(v.xi, 0.5)}, ${n(v.rho, -0.7)}, ${n(v.ka, 2)}
N = 400_000; rng = np.random.default_rng(0)
def bs_terminal(): return S0 * np.exp(-0.5 * vol**2 * T + vol * np.sqrt(T) * rng.standard_normal(N))
def merton_terminal():
    k = np.exp(mj + 0.5 * sj**2) - 1; s = np.sqrt(max(vol**2 - lam * (mj**2 + sj**2), 1e-4))   # keep the ATM variance comparable
    J = rng.poisson(lam * T, N); jump = mj * J + sj * np.sqrt(J) * rng.standard_normal(N)
    return S0 * np.exp((-0.5 * s**2 - lam * k) * T + s * np.sqrt(T) * rng.standard_normal(N) + jump)
def heston_terminal(steps=100):
    dt = T / steps; v = np.full(N, vol**2); lnS = np.full(N, np.log(S0)); th = vol**2
    for _ in range(steps):
        z1 = rng.standard_normal(N); z2 = rho * z1 + np.sqrt(1 - rho**2) * rng.standard_normal(N); vp = np.maximum(v, 0)
        lnS += -0.5 * vp * dt + np.sqrt(vp * dt) * z1; v += ka * (th - vp) * dt + xi * np.sqrt(vp * dt) * z2
    return np.exp(lnS)
models = {"Black-Scholes": bs_terminal(), "Merton jump": merton_terminal(), "Heston": heston_terminal()}
for name, ST in models.items():
    call = lambda K: np.maximum(ST - K, 0).mean(); put = lambda K: np.maximum(K - ST, 0).mean()
    print(f"{name:14s} ATM call {call(100):6.3f}  digital 110: {(ST > 110).mean():.4f}  risk reversal (25 delta proxy) {call(110) - put(90):+.3f}  90% put {put(90):.3f}")
`,

    cusum: (v) => HDR('Parameter stability: CUSUM of residuals and Chow break scan') + `import numpy as np
from scipy import stats

${MULTI}
yrs = ${n(v.yrs, 6)}
m = R[-int(252 * yrs):, 0]; a = R[-int(252 * yrs):, 2]                             # benchmark ("${v.bm || 'btc'}") and the asset
X = np.c_[np.ones(len(m)), m]
b = np.linalg.lstsq(X, a, rcond=None)[0]; e = a - X @ b
cusum = np.cumsum(e) / (e.std(ddof=2) * np.sqrt(len(e)))
print(f"beta {b[1]:.3f}  max |CUSUM| {np.abs(cusum).max():.3f}  (95% bound 1.358 -> {'BREAK' if np.abs(cusum).max() > 1.358 else 'stable'})")
def chow(k):
    f = lambda Xs, ys: (lambda bb: ((ys - Xs @ bb) ** 2).sum())(np.linalg.lstsq(Xs, ys, rcond=None)[0])
    s_all = f(X, a); s1 = f(X[:k], a[:k]); s2 = f(X[k:], a[k:]); p = 2
    return ((s_all - s1 - s2) / p) / ((s1 + s2) / (len(a) - 2 * p))
trim = int(0.15 * len(a)); F = np.array([chow(k) for k in range(trim, len(a) - trim)])
print(f"largest Chow F {F.max():.2f} at observation {trim + F.argmax()} of {len(a)}  (compare with sup-F critical value ~ 8.85 at 5% for 2 parameters)")
`,

    sr117: (v) => HDR('Model validation sheet (SR 11-7): tier, findings and review frequency') + `import numpy as np

scores = {"materiality": ${n(v.materiality, 4)}, "complexity": ${n(v.complexity, 3)}, "uncertainty": ${n(v.uncertainty, 3)}, "reliance": ${n(v.reliance, 4)}}   # 1 to 5
weights = {"materiality": 0.4, "complexity": 0.2, "uncertainty": 0.2, "reliance": 0.2}
score = sum(scores[k] * weights[k] for k in scores)
tier, months = (1, 12) if score >= 3.6 else (2, 24) if score >= 2.6 else (3, 36)
findings = {"high": 0, "medium": 2, "low": 3}                                      # open findings from the review
sev = {"high": 5, "medium": 2, "low": 1}
penalty = sum(sev[k] * c for k, c in findings.items())
rating = "unsatisfactory" if findings["high"] >= 2 or penalty >= 10 else "needs improvement" if penalty >= 4 else "satisfactory"
if rating == "unsatisfactory": months /= 2
print(f"weighted score {score:.2f} -> tier {tier}; findings penalty {penalty} -> {rating}; next full validation in {months:g} months")
`,

    jumps: (v) => HDR('Merton jump-diffusion: simulation and the option smile it creates') + `import numpy as np
from math import factorial
from scipy.stats import norm
from scipy.optimize import brentq

S0, vol, T = 100.0, ${n(v.s, 0.2)}, 1.0
lam, mj, dj = ${n(v.lam, 0.5)}, ${n(v.mj, -0.1)}, ${n(v.dj, 0.15)}
def bs(S, K, T, s, call=True):
    d1 = (np.log(S / K) + 0.5 * s**2 * T) / (s * np.sqrt(T)); d2 = d1 - s * np.sqrt(T)
    return S * norm.cdf(d1) - K * norm.cdf(d2) if call else K * norm.cdf(-d2) - S * norm.cdf(-d1)
k = np.exp(mj + 0.5 * dj**2) - 1
def merton(K, call=True, terms=60):                                              # exact series of Black-Scholes prices
    p = 0.0; lp = lam * (1 + k) * T
    for j in range(terms):
        sj = np.sqrt(vol**2 + j * dj**2 / T); rj = -lam * k + j * (mj + 0.5 * dj**2) / T
        S = S0 * np.exp(rj * T); w = np.exp(-lp) * lp**j / factorial(j)
        p += w * bs(S, K, T, sj, call)
    return p
for K in (80, 90, 100, 110, 120):
    price = merton(K); iv = brentq(lambda s: bs(S0, K, T, s) - price, 0.01, 2)
    print(f"strike {K:>3d}: price {price:7.3f}  implied vol {iv:.1%}")
`,

    heston: (v) => HDR('Heston stochastic volatility: simulation, smile and Feller condition') + `import numpy as np
from scipy.stats import norm
from scipy.optimize import brentq

v0, th, ka, xi, rho, T = ${n(v.v0, 0.04)}, ${n(v.th, 0.04)}, ${n(v.ka, 2)}, ${n(v.xi, 0.5)}, ${n(v.rho, -0.7)}, ${n(v.T, 1)}
print("Feller condition 2*kappa*theta > xi^2:", 2 * ka * th > xi**2)
N, steps, S0 = 200_000, 200, 100.0; dt = T / steps
rng = np.random.default_rng(0)
v = np.full(N, v0); lnS = np.full(N, np.log(S0))
for _ in range(steps):                                                             # full-truncation Euler scheme
    z1 = rng.standard_normal(N); z2 = rho * z1 + np.sqrt(1 - rho**2) * rng.standard_normal(N); vp = np.maximum(v, 0)
    lnS += -0.5 * vp * dt + np.sqrt(vp * dt) * z1; v += ka * (th - vp) * dt + xi * np.sqrt(vp * dt) * z2
ST = np.exp(lnS)
def bs(K, s):
    d1 = (np.log(S0 / K) + 0.5 * s**2 * T) / (s * np.sqrt(T)); return S0 * norm.cdf(d1) - K * norm.cdf(d1 - s * np.sqrt(T))
for K in (80, 90, 100, 110, 120):
    price = np.maximum(ST - K, 0).mean()
    iv = brentq(lambda s: bs(K, s) - price, 0.01, 2)
    print(f"strike {K:>3d}: call {price:7.3f}  implied vol {iv:.1%}")
`,

    ou: (v) => HDR('Ornstein-Uhlenbeck: simulation, half-life and parameter estimation') + `import numpy as np

ka, mu, sg = ${n(v.ka, 5)}, ${n(v.mu, 0)}, ${n(v.sg, 0.5)}
dt, N = 1 / 252, 2520
rng = np.random.default_rng(0)
x = np.empty(N); x[0] = mu
for t in range(1, N):
    x[t] = x[t - 1] + ka * (mu - x[t - 1]) * dt + sg * np.sqrt(dt) * rng.standard_normal()
# estimate by regressing x[t+1] on x[t]: x[t+1] = a + b x[t] + e
b, a = np.polyfit(x[:-1], x[1:], 1)
ka_hat = -np.log(b) / dt; mu_hat = a / (1 - b)
resid = x[1:] - (a + b * x[:-1]); sg_hat = resid.std() * np.sqrt(2 * ka_hat / (1 - b**2))
print(f"true kappa {ka}, estimated {ka_hat:.2f};  mu {mu_hat:.3f};  sigma {sg_hat:.3f}")
print(f"half-life of a deviation: {np.log(2) / ka_hat * 252:.1f} trading days;  stationary std {sg_hat / np.sqrt(2 * ka_hat):.3f}")
`,
  });
  P.add({ smile: P.PYCODE.options, curve: P.PYCODE.ns });
})(typeof window !== 'undefined' ? window : globalThis);
