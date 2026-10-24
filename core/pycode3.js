'use strict';
/* Python snippets, family 2: credit, counterparty/XVA, liquidity, rates and operational risk. Registered into PyCode.PYCODE. */
((G) => {
  const P = G.PyCode || require('./pycode.js');
  const { n, HDR, RETS, MULTI } = P;

  P.add({
    scorecard: (v) => HDR('Credit scorecard: logistic regression, AUC, KS, score points') + `# pip install scikit-learn
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, roc_curve

rng = np.random.default_rng(0)
N, base, lam = ${n(v.n, 5000)}, ${n(v.base, 0.05)}, ${n(v.lam, 1)}
X = rng.standard_normal((N, 4))
logit = np.log(base / (1 - base)) + X @ np.array([0.9, 0.6, -0.4, 0.2])
y = rng.random(N) < 1 / (1 + np.exp(-logit))
cut = int(0.7 * N)
m = LogisticRegression(C=1 / lam).fit(X[:cut], y[:cut])
p = m.predict_proba(X[cut:])[:, 1]
fpr, tpr, _ = roc_curve(y[cut:], p)
auc = roc_auc_score(y[cut:], p)
print(f"out-of-sample AUC {auc:.3f}  Gini {2 * auc - 1:.3f}  KS {np.max(tpr - fpr):.3f}")
pdo, score0, odds0 = 20, 600, 50                                  # 20 points double the odds, 600 pts = odds 50:1
factor = pdo / np.log(2); offset = score0 - factor * np.log(odds0)
score = offset - factor * (m.decision_function(X[cut:]))          # higher score = safer
print("score range:", score.min(), score.max())
`,

    creditul: (v) => HDR('Credit portfolio loss: single-factor Gaussian copula, unexpected loss and credit VaR') + `import numpy as np
from scipy.stats import norm

# two segments: (exposure, PD, LGD)
seg = [(${n(v.e1, 100)}, ${n(v.p1, 0.02)}, ${n(v.l1, 0.45)}), (${n(v.e2, 100)}, ${n(v.p2, 0.05)}, ${n(v.l2, 0.45)})]
rho, N, conf = ${n(v.rho, 0.15)}, 400_000, 0.999
rng = np.random.default_rng(0)
Z = rng.standard_normal(N)                                         # systematic factor
loss = np.zeros(N)
for e, pd_, lgd in seg:
    thr = norm.ppf(pd_)
    cond_pd = norm.cdf((thr - np.sqrt(rho) * Z) / np.sqrt(1 - rho))   # PD given the factor (Vasicek)
    loss += e * lgd * cond_pd                                         # large-pool limit
el = sum(e * p * l for e, p, l in seg)
var = np.quantile(loss, conf)
print(f"expected loss {el:.2f}   credit VaR {conf:.1%} {var:.2f}   unexpected loss (economic capital) {var - el:.2f}")
`,

    irb: (v) => HDR('Basel IRB risk-weight formula (corporate)') + `import numpy as np
from scipy.stats import norm

pd_, lgd, M, ead = ${n(v.pd, 0.02)}, ${n(v.lgd, 0.45)}, ${n(v.m, 2.5)}, ${n(v.ead, 100)}
pd_ = max(pd_, 0.0003)                                              # regulatory floor
w = (1 - np.exp(-50 * pd_)) / (1 - np.exp(-50))
R = 0.12 * w + 0.24 * (1 - w)                                        # asset correlation
b = (0.11852 - 0.05478 * np.log(pd_)) ** 2                           # maturity adjustment
K = (lgd * norm.cdf((norm.ppf(pd_) + np.sqrt(R) * norm.ppf(0.999)) / np.sqrt(1 - R)) - pd_ * lgd) * (1 + (M - 2.5) * b) / (1 - 1.5 * b)
rw = K * 12.5
print(f"asset correlation {R:.3f}  capital K {K:.4f}  risk weight {rw:.1%}  RWA {rw * ead:.2f}  capital (8%) {0.08 * rw * ead:.2f}")
`,

    migration: (v) => HDR('Rating migration: multi-year transition matrix and cumulative PD') + `import numpy as np

# One-year transition matrix (AAA..CCC, D). Replace by your own estimates.
P = np.array([[.9081, .0833, .0068, .0006, .0012, 0, 0, 0],
              [.0070, .9065, .0779, .0064, .0006, .0013, .0002, 0.0001],
              [.0009, .0227, .9105, .0552, .0074, .0026, .0001, .0006],
              [.0002, .0033, .0595, .8693, .0530, .0117, .0112, .0518 * 0 + .0018],
              [.0003, .0014, .0067, .0773, .8053, .0884, .0100, .0106],
              [0, .0011, .0024, .0043, .0648, .8346, .0407, .0521],
              [.0022, 0, .0022, .0130, .0238, .1124, .6486, .1978],
              [0, 0, 0, 0, 0, 0, 0, 1.0]])
P = P / P.sum(axis=1, keepdims=True)                                # make rows sum to one
H, st = ${n(v.H, 5)}, ${n(v.st, 3)}                                 # horizon, starting rating index
PH = np.linalg.matrix_power(P, int(H))
print("cumulative default probability by rating after", H, "years:", np.round(PH[:, -1], 4))
print("distribution for rating", st, ":", np.round(PH[int(st)], 4))
`,

    crplus: (v) => HDR('CreditRisk+: Poisson mixture with a gamma factor (analytic loss distribution)') + `import numpy as np
from scipy import stats

n, p, conc, sig, lgd = ${n(v.n, 500)}, ${n(v.p, 0.02)}, ${n(v.conc, 1)}, ${n(v.sig, 0.8)}, ${n(v.lgd, 0.45)}
cf = ${n(v.cf, 0.999)}
mu = n * p                                                          # expected number of defaults
# gamma-mixed Poisson = negative binomial with mean mu and relative sd sig on the default rate
shape = 1 / sig**2; prob = shape / (shape + mu)
k = np.arange(0, int(6 * mu) + 50)
pmf = stats.nbinom.pmf(k, shape, prob)
cdf = np.cumsum(pmf)
q = int(np.searchsorted(cdf, cf))
unit = lgd * conc                                                    # loss per default (exposure x LGD)
print(f"expected loss {mu * unit:.2f}   VaR {cf:.1%} {q * unit:.2f}   unexpected loss {(q - mu) * unit:.2f}")
`,

    saccr: (v) => HDR('SA-CCR exposure at default (simplified, one netting set)') + `import numpy as np

# trades: (notional, effective maturity in years, supervisory factor, delta). Interest-rate style add-on.
trades = [(${n(v.n1, 100)}, ${n(v.e1, 5)}, 0.005, 1), (${n(v.n2, 80)}, ${n(v.e2, 3)}, 0.005, -1), (${n(v.n3, 60)}, ${n(v.e3, 10)}, 0.005, 1)]
mtm, collateral = ${n(v.mtm, 5)}, ${n(v.col, 3)}
sd = lambda e: (np.exp(-0.05 * 0) - np.exp(-0.05 * e)) / 0.05          # supervisory duration
addon = {}
for N, e, sf, d in trades:
    addon[e] = addon.get(e, 0) + d * N * sd(e)
eff = np.sqrt(sum(a**2 for a in addon.values()) + 1.4 * sum(a * b for a in addon.values() for b in addon.values() if a is not b))
mult = min(1, 0.05 + 0.95 * np.exp((mtm - collateral) / (2 * 0.95 * max(eff * 0.005, 1e-9))))
pfe = mult * 0.005 * abs(eff)
rc = max(mtm - collateral, 0)
ead = 1.4 * (rc + pfe)
print(f"replacement cost {rc:.2f}  PFE add-on {pfe:.3f}  multiplier {mult:.3f}  EAD = 1.4 x (RC + PFE) = {ead:.3f}")
`,

    kvamva: (v) => HDR('KVA: cost of the capital held against a derivative over its life') + `import numpy as np

T, cs, rw, hurdle, fs = ${n(v.T, 5)}, ${n(v.cs, 0.01)}, ${n(v.rw, 1)}, ${n(v.hu, 0.1)}, ${n(v.fs, 0.01)}
sig = ${n(v.sig, 0.01)}
t = np.linspace(0.0, T, 61)[:-1] + T / 120                           # mid-points
dt = T / 60
ee = 100 * sig * np.sqrt(t * np.maximum(T - t, 1e-6)) * 2            # hump-shaped expected exposure profile
disc = np.exp(-0.03 * t)
ead = 1.4 * ee; cap = 0.08 * rw * ead                                 # regulatory capital through time
kva = hurdle * np.sum(cap * disc) * dt * (1 - 0.0)                    # KVA = hurdle x integral of discounted capital
print(f"peak EE {ee.max():.2f}   KVA {kva:.4f}   per unit of notional {kva / 100:.4%}")
`,

    xva: (v) => HDR('CVA, DVA and FVA of an interest-rate swap by Monte-Carlo') + `import numpy as np

T, sg, rho, n_ = ${n(v.T, 5)}, ${n(v.sg, 0.01)}, ${n(v.rho, 0)}, ${n(v.n, 10000)}
cs, os_, R, fs, r = ${n(v.cs, 0.02)}, ${n(v.os, 0.01)}, ${n(v.R, 0.4)}, ${n(v.fs, 0.01)}, ${n(v.r, 0.03)}
steps = int(T * 12); dt = T / steps; t = np.arange(1, steps + 1) * dt
rng = np.random.default_rng(0)
# rate paths: Gaussian (Hull-White without drift), swap value ~ annuity x (rate - strike)
dW = rng.standard_normal((n_, steps)) * np.sqrt(dt)
x = np.cumsum(sg * dW, axis=1)
annuity = np.maximum(T - t, 0) + 1e-9
mtm = 100 * annuity * x                                                # notional 100, receive-fixed at the money
disc = np.exp(-r * t)
lam_c, lam_o = cs / (1 - R), os_ / (1 - R)
dpd_c = np.exp(-lam_c * (t - dt)) - np.exp(-lam_c * t)                 # default probabilities per period
dpd_o = np.exp(-lam_o * (t - dt)) - np.exp(-lam_o * t)
epe = np.maximum(mtm, 0).mean(axis=0); ene = np.maximum(-mtm, 0).mean(axis=0)
cva = (1 - R) * np.sum(disc * epe * dpd_c)
dva = (1 - R) * np.sum(disc * ene * dpd_o)
fva = fs * np.sum(disc * (epe - ene) * dt)
print(f"CVA {cva:.4f}  DVA {dva:.4f}  FVA {fva:.4f}  total XVA {cva - dva + fva:.4f}")
`,

    xvasuite: (v) => HDR('XVA suite: CVA, DVA, FVA, MVA and KVA together') + `import numpy as np

T, cs, os_, fs, om = ${n(v.T, 5)}, ${n(v.cs, 0.02)}, ${n(v.os, 0.01)}, ${n(v.fs, 0.01)}, ${n(v.om, 0.01)}
R, r, sg = 0.4, 0.03, 0.01
steps = int(T * 12); dt = T / steps; t = np.arange(1, steps + 1) * dt
rng = np.random.default_rng(0)
x = np.cumsum(sg * rng.standard_normal((20000, steps)) * np.sqrt(dt), axis=1)
mtm = 100 * np.maximum(T - t, 1e-9) * x * ${v.dir === 'pay' ? -1 : 1}
epe = np.maximum(mtm, 0).mean(0); ene = np.maximum(-mtm, 0).mean(0); disc = np.exp(-r * t)
dp = lambda s: np.exp(-s / (1 - R) * (t - dt)) - np.exp(-s / (1 - R) * t)
cva = (1 - R) * np.sum(disc * epe * dp(cs)); dva = (1 - R) * np.sum(disc * ene * dp(os_))
fva = fs * np.sum(disc * (epe - ene) * dt)
im = 2.33 * np.std(np.diff(mtm, axis=1), axis=0) * np.sqrt(10 / 21 * 1)  # crude 10-day 99% initial margin profile
im = np.r_[im, 0][: len(t)]
mva = fs * np.sum(disc * im * dt)
kva = 0.10 * np.sum(disc * 0.08 * 1.4 * epe * dt)
print(dict(CVA=cva, DVA=dva, FVA=fva, MVA=mva, KVA=kva), " total:", cva - dva + fva + mva + kva)
`,

    netting: (v) => HDR('Netting benefit and potential future exposure of a portfolio of trades') + `import numpy as np

n_, rho, sg, T, q = ${n(v.n, 5)}, ${n(v.rho, 0.3)}, ${n(v.sg, 0.2)}, ${n(v.T, 1)}, ${n(v.q, 0.95)}
rng = np.random.default_rng(0)
C = np.full((n_, n_), rho); np.fill_diagonal(C, 1.0)
Z = rng.standard_normal((100_000, n_)) @ np.linalg.cholesky(C).T
mtm = sg * np.sqrt(T) * Z * 100                                         # each trade's value at horizon T
gross = np.maximum(mtm, 0).sum(axis=1)                                  # no netting agreement
net = np.maximum(mtm.sum(axis=1), 0)                                    # with a netting agreement
print(f"expected exposure  no netting {gross.mean():.2f}   netted {net.mean():.2f}   benefit {1 - net.mean() / gross.mean():.1%}")
print(f"PFE {q:.0%}        no netting {np.quantile(gross, q):.2f}   netted {np.quantile(net, q):.2f}")
`,

    swapexp: (v) => HDR('Expected exposure profile of an interest-rate swap') + `import numpy as np

T, sig, a, direction = ${n(v.T, 5)}, ${n(v.sig, 0.01)}, ${n(v.a, 0.1)}, ${v.dir === 'pay' ? -1 : 1}
steps = int(T * 12); dt = T / steps; t = np.arange(1, steps + 1) * dt
rng = np.random.default_rng(0)
x = np.zeros((20000, steps)); cur = np.zeros(20000)
for i in range(steps):                                                 # Vasicek / Hull-White deviation from the forward curve
    cur = cur - a * cur * dt + sig * np.sqrt(dt) * rng.standard_normal(20000); x[:, i] = cur
annuity = np.maximum(T - t, 0)
mtm = direction * 100 * annuity * x
ee, ene = np.maximum(mtm, 0).mean(0), np.maximum(-mtm, 0).mean(0)
pfe = np.quantile(np.maximum(mtm, 0), 0.95, axis=0)
i = int(np.argmax(ee))
print(f"peak expected exposure {ee.max():.3f} at {t[i]:.2f}y;  peak PFE 95% {pfe.max():.3f};  expected negative exposure peak {ene.max():.3f}")
`,

    cds: (v) => HDR('CDS curve bootstrap: hazard rates, survival probabilities, par spreads') + `import numpy as np

tenors = np.array([1, 3, 5, 7, 10.0])
spreads = np.array([${n(v.s1, 80)}, ${n(v.s3, 110)}, ${n(v.s5, 140)}, ${n(v.s7, 155)}, ${n(v.s10, 170)}]) / 1e4
R, r = ${n(v.R, 0.4)}, ${n(v.r, 0.03)}
hz, prev_t, S = [], 0.0, [1.0]
def surv(t, hz):
    edges = np.r_[0, tenors[: len(hz)]]; out, acc = 1.0, 0.0
    for h, a, b in zip(hz, edges[:-1], edges[1:]):
        acc += h * (min(t, b) - a) if t > a else 0
    last = tenors[len(hz) - 1]
    return np.exp(-(acc + (hz[-1] * (t - last) if t > last else 0)))
def par_spread(k, hz, step=0.25):                                     # quarterly premium, continuous protection
    grid = np.arange(step, tenors[k] + 1e-9, step); sv = np.array([surv(t, hz) for t in grid]); df = np.exp(-r * grid)
    prem = np.sum(df * sv * step); prot = (1 - R) * np.sum(df * (np.r_[1, sv[:-1]] - sv))
    return prot / prem
for k in range(len(tenors)):
    f = lambda h: par_spread(k, hz + [h]) - spreads[k]
    lo, hi = 1e-6, 2.0
    for _ in range(80):
        mid = 0.5 * (lo + hi); (lo, hi) = (mid, hi) if f(mid) < 0 else (lo, mid)
    hz.append(0.5 * (lo + hi))
print("hazard rates:", np.round(hz, 5))
print("survival at tenors:", [round(surv(t, hz), 4) for t in tenors])
cp = ${n(v.cp, 5)}; N = ${n(v.N, 10)}
print(f"mark-to-market of {N}m protection bought at {spreads[2] * 1e4:.0f}bp vs market 5y: {N * 1e6 * (par_spread(2, hz) - spreads[2]) * 4.5:,.0f}")
`,

    cdsbond: (v) => HDR('CDS-bond basis') + `import numpy as np

z, cds, f, hc, T, wd = ${n(v.z, 150)}, ${n(v.cds, 120)}, ${n(v.f, 30)}, ${n(v.hc, 5)}, ${n(v.T, 5)}, ${n(v.wd, 100)}   # bp, bp, funding bp, haircut %, years, widening bp
basis = cds - z
print(f"basis = CDS - bond spread = {basis:+.0f} bp  ({'negative basis: buy bond + buy protection' if basis < 0 else 'positive basis'})")
carry = (z - cds - f * (1 - hc / 100)) / 1e4                         # annual carry of the negative-basis package, funding included
print(f"carry per year {carry * 1e4:.1f} bp of notional;  over {T}y {carry * T * 1e4:.0f} bp")
dv01 = T * 0.9 / 1e4
print(f"mark-to-market if spreads widen {wd} bp together: {-0 * wd:.0f}; if only the bond widens {wd} bp: {-dv01 * wd:.4f} of notional")
`,

    pd: (v) => HDR('Probability of default, expected loss and hazard rate') + `import numpy as np

pd_, lgd, ead, T = ${n(v.pd, 0.02)}, ${n(v.lgd, 0.45)}, ${n(v.ead, 100)}, ${n(v.T, 5)}
hazard = -np.log(1 - pd_)                                              # constant intensity from the 1-year PD
cum = 1 - np.exp(-hazard * T)
print(f"one-year expected loss {pd_ * lgd * ead:.3f};  hazard {hazard:.4f};  cumulative PD over {T}y {cum:.2%};  {T}y expected loss {cum * lgd * ead:.3f}")
print("implied credit spread ~ PD x LGD:", pd_ * lgd * 1e4, "bp")
`,

    vasicek: (v) => HDR('Vasicek: default rate distribution of a large loan pool') + `import numpy as np
from scipy.stats import norm

pd_, rho, lgd, conf = ${n(v.pd, 0.02)}, ${n(v.rho, 0.15)}, ${n(v.lgd, 0.45)}, ${n(v.conf, 0.999)}
worst = norm.cdf((norm.ppf(pd_) + np.sqrt(rho) * norm.ppf(conf)) / np.sqrt(1 - rho))   # PD in the 99.9% worst year
print(f"through-the-cycle PD {pd_:.2%};  {conf:.1%} worst-case default rate {worst:.2%};  capital K = LGD x (worst - PD) = {lgd * (worst - pd_):.2%}")
x = np.linspace(0.0005, 0.3, 6)                                          # density of the pool default rate
pdf = np.sqrt((1 - rho) / rho) * np.exp(-0.5 * (np.sqrt(1 - rho) * norm.ppf(x) - norm.ppf(pd_)) ** 2 / rho + 0.5 * norm.ppf(x) ** 2)
print("default-rate density at", x.round(4), "->", pdf.round(3))
`,

    pdback: (v) => HDR('PD back-testing: binomial and traffic-light tests') + `import numpy as np
from scipy import stats

tr, sh, g = ${n(v.tr, 500)}, ${n(v.sh, 1)}, ${n(v.g, 0.02)}          # obligors, stress shift, forecast PD
rng = np.random.default_rng(0)
pd_forecast, true_pd = g, g * (1 + sh * 0.5)
defaults = rng.binomial(tr, true_pd)
p_value = 1 - stats.binom.cdf(defaults - 1, tr, pd_forecast)           # P(at least this many defaults | forecast correct)
z = (defaults - tr * pd_forecast) / np.sqrt(tr * pd_forecast * (1 - pd_forecast))
print(f"observed defaults {defaults}, expected {tr * pd_forecast:.1f}; binomial p-value {p_value:.4f}; z {z:.2f}")
print("zone:", "red" if p_value < 0.01 else "amber" if p_value < 0.05 else "green")
`,

    lda: (v) => HDR('Operational risk: loss distribution approach (frequency x severity)') + `import numpy as np

lam, med, sg, xi = ${n(v.lam, 25)}, ${n(v.med, 20)}, ${n(v.sg, 1.4)}, ${n(v.xi, 0.5)}
cf = ${n(v.cf, 0.999)}
rng = np.random.default_rng(0)
N = 100_000
counts = rng.poisson(lam, N)
sev = lambda k: med * np.exp(sg * rng.standard_normal(k))              # lognormal body (thousands)
annual = np.array([sev(k).sum() for k in counts])
var = np.quantile(annual, cf); es = annual[annual >= var].mean()
print(f"expected annual loss {annual.mean():.1f}   VaR {cf:.1%} {var:.1f}   ES {es:.1f}   capital (VaR - EL) {var - annual.mean():.1f}")
`,

    sma: (v) => HDR('Basel III standardised measurement approach (operational risk capital)') + `import numpy as np

bi, al, ev = ${n(v.bi, 5000)}, ${n(v.al, 100)}, ${n(v.ev, 300)}        # business indicator (m), average annual loss (m), event count
if bi <= 1000: bic = 0.12 * bi
elif bi <= 30000: bic = 0.12 * 1000 + 0.15 * (bi - 1000)
else: bic = 0.12 * 1000 + 0.15 * 29000 + 0.18 * (bi - 30000)
lc = 15 * al                                                              # loss component: 15 x average annual loss over 10 years
ilm = np.log(np.exp(1) - 1 + (lc / bic) ** 0.8) if bi > 1000 else 1.0
print(f"business indicator component {bic:.1f}  loss component {lc:.1f}  internal loss multiplier {ilm:.3f}  capital {bic * ilm:.1f}")
`,

    rcsa: (v) => HDR('Risk and control self-assessment: severity x frequency and aggregation with correlation') + `import numpy as np
from scipy.stats import norm

fm, sm, rho, q = ${n(v.fm, 1)}, ${n(v.sm, 1)}, ${n(v.rho, 0.3)}, ${n(v.q, 0.99)}
risks = [("fraud", 2, 0.5), ("system outage", 6, 0.2), ("process error", 20, 0.05), ("legal", 0.5, 2.0)]   # (events per year, mean loss in m)
rng = np.random.default_rng(0)
N = 100_000
C = np.full((4, 4), rho); np.fill_diagonal(C, 1.0)
Z = rng.standard_normal((N, 4)) @ np.linalg.cholesky(C).T
tot = np.zeros(N); stand = []
for j, (_, f, s) in enumerate(risks):
    u = norm.cdf(Z[:, j])     # correlated uniform
    k = np.random.default_rng(j).poisson(f * fm, N)
    loss = k * s * sm * np.exp(rng.normal(0, 0.5, N)) * (0.5 + u)
    tot += loss; stand.append(np.quantile(loss, q))
print(f"stand-alone VaR {q:.0%}: {np.round(stand, 2)}  sum {sum(stand):.2f}   aggregate VaR with dependence {np.quantile(tot, q):.2f}")
`,

    irrbb: (v) => HDR('Interest-rate risk in the banking book: delta EVE and delta NII') + `import numpy as np

# Simplified balance sheet: assets and liabilities with durations; shocks in bp (Basel six scenarios)
A, Lb, E = ${n(v.da, 4)}, ${n(v.dl, 2)}, ${n(v.e, 8)}                 # asset duration, liability duration, equity (% of assets)
assets = 100.0; liabs = assets - E
reprice_a, reprice_l = ${n(v.ra, 3)}, ${n(v.rl, 0.5)}                   # years to repricing
shocks = {"parallel up": 200, "parallel down": -200, "steepener": 0, "flattener": 0, "short up": 250, "short down": -250}
for name, bp in shocks.items():
    d = bp / 1e4
    d_eve = -(assets * A - liabs * Lb) * d                               # change in economic value of equity
    d_nii = (assets / reprice_a - liabs / reprice_l) * d * 1.0           # one-year change in net interest income (crude)
    print(f"{name:14s} delta EVE {d_eve:+7.2f} ({d_eve / E:+.0%} of equity)   delta NII {d_nii:+7.2f}")
print("outlier test: delta EVE > 15% of Tier 1 capital")
`,

    runoff: (v) => HDR('Deposit run-off, liquidity buffer survival and stable funding') + `import numpy as np

rcap, ccap, tau, rr, hq, hc, keep = ${n(v.rcap, 5)}, ${n(v.ccap, 5)}, ${n(v.tau, 30)}, ${n(v.rr, 10)}, ${n(v.hq, 15)}, ${n(v.hc, 10)}, ${n(v.keep, 50)}
days = np.arange(0, 91)
retail = 100 * np.exp(-rr / 100 * days / tau * 0.3)                     # retail deposits, slow decay
corp = 100 * np.exp(-days / tau)                                         # corporate deposits, faster
outflow = (100 - retail) * rcap / 100 + (100 - corp) * ccap / 100
buffer = hq * (1 - hc / 100) + 0 * days
net = buffer - np.cumsum(np.gradient(outflow))
print("cumulative outflow at 30 / 60 / 90 days:", np.round(outflow[[30, 60, 90]], 2))
survival = days[np.argmax(buffer < outflow)] if (buffer < outflow).any() else None
print("buffer exhausted on day:", survival if survival is not None else "not within 90 days")
`,

    fundgap: (v) => HDR('Funding gap ladder: inflows, outflows and rollover') + `import numpy as np

buckets = ["1d", "1w", "1m", "3m", "6m", "1y"]
inflow = np.array([10, 15, 30, 40, 60, 90.0])
outflow = np.array([12, 25, 55, 70, 80, 100.0])
roll, delay, lim = ${n(v.roll, 70)} / 100, ${n(v.delay, 10)} / 100, ${n(v.lim, 20)}
net = inflow * (1 - delay) - outflow * (1 - roll)
cum = np.cumsum(net)
for b, g, c in zip(buckets, net, cum):
    print(f"{b:>3s}  gap {g:+7.1f}  cumulative {c:+7.1f}  {'BREACH' if c < -lim else ''}")
`,

    ftp: (v) => HDR('Funds transfer pricing: matched-maturity transfer rate and liquidity premium') + `import numpy as np

T, base, liq, theta, pool, N = ${n(v.T, 5)}, ${n(v.base, 0.03)}, ${n(v.liq, 0.01)}, ${n(v.theta, 0.2)}, ${n(v.pool, 0)}, ${n(v.N, 100)}
curve = lambda t: base + 0.004 * np.log1p(t)                              # swap curve placeholder
matched = curve(T) + liq * (1 - np.exp(-T / 3))                           # swap rate + liquidity premium growing with the term
pooled = curve(1) + liq                                                   # single pool rate (what the bank charges without matching)
print(f"matched-maturity FTP {matched:.3%}   pool FTP {pooled:.3%}   difference per {N}m: {(matched - pooled) * N * 1e6:,.0f} / year")
`,

    fxvar: (v) => HDR('FX VaR for a currency position') + `import numpy as np
from scipy import stats

${RETS}
h, yrs, cf = ${n(v.h, 1)}, ${n(v.yrs, 5)}, ${n(v.cf, 0.99)}
fx = r[-int(252 * yrs):]
pos = 1_000_000                                                           # position in foreign currency units (converted to base)
roll = np.convolve(fx, np.ones(int(h)), "valid")                           # h-day returns
print(f"historical VaR {cf:.0%} {int(h)}d: {-np.quantile(roll, 1 - cf) * pos:,.0f}   normal VaR {-(roll.mean() + stats.norm.ppf(1 - cf) * roll.std()) * pos:,.0f}")
`,

    fxhedge: (v) => HDR('FX hedge: forward cost (covered interest parity) and hedge ratio') + `import numpy as np

S, re, rd, bs, h, yrs = 1.10, ${n(v.re, 0.02)}, ${n(v.rd, 0.04)}, ${n(v.bs, 0.002)}, ${n(v.h, 1)}, ${n(v.yrs, 5)}
fwd = S * (1 + rd * h) / (1 + re * h)                                      # forward = spot x (1+r_dom)/(1+r_foreign)
print(f"forward {fwd:.4f}  forward points {(fwd - S) * 1e4:.1f}  annualised carry of hedging {np.log(fwd / S) / h:.2%} + basis {bs:.2%}")
rng = np.random.default_rng(0); fx = rng.standard_t(5, int(252 * yrs)) * 0.005
hedge_pnl = lambda ratio: ratio * (-fx)
for ratio in (0, 0.5, 1.0):
    print(f"hedge ratio {ratio:.0%}: annual vol of the position {np.std(fx + hedge_pnl(ratio)) * np.sqrt(252):.2%}")
`,

    basisccy: (v) => HDR('Cross-currency basis: cost of synthetic dollar funding') + `import numpy as np

S, rE, rU, T, bs, yU = ${n(v.S, 1.1)}, ${n(v.rE, 0.03)}, ${n(v.rU, 0.05)}, ${n(v.T, 1)}, ${n(v.bs, -0.0035)}, ${n(v.yU, 1)}
fwd_cip = S * (1 + rE * T) / (1 + rU * T)                                   # EURUSD forward with no basis
fwd_mkt = S * (1 + rE * T) / (1 + (rU + bs * -1) * T)                       # a negative basis raises the implicit USD rate
implicit_usd = (S * (1 + rE * T) / fwd_mkt - 1) / T
print(f"CIP forward {fwd_cip:.5f}   market forward {fwd_mkt:.5f}   implicit USD rate {implicit_usd:.3%} vs {rU:.3%} (extra {(implicit_usd - rU) * 1e4:.1f} bp)")
print(f"cost of {yU:g}bn of synthetic USD funding: {abs(bs) * yU * 1e9:,.0f} per year")
`,

    vas: (v) => HDR('Vasicek short-rate model: simulation and bond price') + `import numpy as np

r0, th, ka, sg = ${n(v.r0, 0.03)}, ${n(v.th, 0.04)}, ${n(v.ka, 0.5)}, ${n(v.sg, 0.01)}
T = 10; steps = 2520; dt = T / steps
rng = np.random.default_rng(0)
r = np.full(5000, r0); path = [r.copy()]
for _ in range(steps):
    r = r + ka * (th - r) * dt + sg * np.sqrt(dt) * rng.standard_normal(5000); path.append(r.copy())
path = np.array(path)
print("mean rate at 1y / 5y / 10y:", path[[252, 1260, 2520]].mean(axis=1), " theory 10y:", th + (r0 - th) * np.exp(-ka * T))
B = lambda t: (1 - np.exp(-ka * t)) / ka
A = lambda t: np.exp((th - sg**2 / (2 * ka**2)) * (B(t) - t) - sg**2 * B(t)**2 / (4 * ka))
print("zero-coupon bond price 5y (closed form):", A(5) * np.exp(-B(5) * r0))
`,

    ns: (v) => HDR('Nelson-Siegel yield curve fit') + `import numpy as np
from scipy.optimize import least_squares

tau = np.array([0.25, 0.5, 1, 2, 3, 5, 7, 10, 20, 30])
y = np.array([.040, .041, .042, .042, .0425, .043, .0435, .044, .0455, .046])     # observed zero yields (replace by data)
def ns(p, t):
    b0, b1, b2, lam = p; x = t / lam
    return b0 + b1 * (1 - np.exp(-x)) / x + b2 * ((1 - np.exp(-x)) / x - np.exp(-x))
fit = least_squares(lambda p: ns(p, tau) - y, [0.045, -0.01, 0.01, 2.0], bounds=([0, -0.2, -0.2, 0.1], [0.2, 0.2, 0.2, 10]))
b0, b1, b2, lam = fit.x
print(f"level {b0:.4f}  slope {b1:.4f}  curvature {b2:.4f}  lambda {lam:.2f}   rmse {np.sqrt(np.mean(fit.fun**2)) * 1e4:.2f} bp")
pos = ${v.pos === 'short' ? -1 : 1}
print("P&L of a ", "short" if pos < 0 else "long", "10y position for +100bp level shift (duration ~8):", -pos * 8 * 0.01)
`,

    pca: (v) => HDR('PCA of yield-curve changes: level, slope, curvature') + `import numpy as np

rng = np.random.default_rng(0)
tenors = np.array([1, 2, 3, 5, 7, 10, 20, 30.0])
n = int(252 * ${n(v.yrs, 10)})
lvl, slp, crv = rng.standard_normal((3, n)) * np.array([[0.05], [0.03], [0.015]])
load = np.vstack([np.ones(8), np.linspace(-1, 1, 8), (np.linspace(-1, 1, 8)) ** 2 - 0.4])
dy = (lvl[:, None] * load[0] + slp[:, None] * load[1] + crv[:, None] * load[2]) + rng.normal(0, 0.005, (n, 8))   # daily yield changes in %
C = np.cov(dy.T); ev, V = np.linalg.eigh(C); ev, V = ev[::-1], V[:, ::-1]
print("variance explained by the first 3 components:", np.round(ev[:3] / ev.sum(), 3), " total", (ev[:3] / ev.sum()).sum().round(3))
print("PC1 loadings (level):", np.round(V[:, 0], 2))
print("PC2 loadings (slope):", np.round(V[:, 1], 2))
`,

    slope: () => HDR('Yield-curve slope as a recession signal (probit)') + `# pip install statsmodels
import numpy as np
import statsmodels.api as sm

rng = np.random.default_rng(0)
n = 600
slope = rng.normal(1.0, 1.0, n)                                            # 10y - 3m spread, in %  (replace by FRED data: T10Y3M)
p = 1 / (1 + np.exp(-(-1.2 - 1.1 * slope)))
recession_in_12m = rng.random(n) < p
fit = sm.Probit(recession_in_12m.astype(int), sm.add_constant(slope)).fit(disp=False)
print(fit.params)
for s in (-1.0, 0.0, 1.0, 2.0):
    print(f"slope {s:+.1f}% -> P(recession in 12 months) = {fit.predict([[1, s]])[0]:.1%}")
`,

    hedge: (v) => HDR('Minimum-variance hedge ratio and hedging effectiveness') + `import numpy as np

val, fut, tb = ${n(v.val, 10)}, ${n(v.fut, 1)}, ${n(v.tb, 1)}                 # position value, futures contract value, tracking basis noise
rng = np.random.default_rng(0)
f = rng.standard_t(5, 2000) * 0.01
s = 0.9 * f + rng.normal(0, 0.004 * tb, 2000)                               # spot position returns, imperfectly correlated with the future
h = np.cov(s, f)[0, 1] / f.var(ddof=1)                                       # minimum-variance hedge ratio
effect = 1 - np.var(s - h * f) / np.var(s)                                   # = rho^2
contracts = h * val / fut
print(f"hedge ratio {h:.3f}  contracts to short {contracts:.2f}  variance removed {effect:.1%}  correlation {np.corrcoef(s, f)[0, 1]:.3f}")
`,

    lvar: (v) => HDR('Liquidity-adjusted VaR: exit cost from the bid-ask spread and market depth') + `import numpy as np
from scipy.stats import norm

${RETS}
pos, adv, par, sp, spm, cf = ${n(v.pos, 1e6)}, ${n(v.adv, 5e6)}, ${n(v.par, 0.2)}, ${n(v.sp, 0.001)}, ${n(v.spm, 3)}, ${n(v.cf, 0.99)}
days = max(1, int(np.ceil(pos / (par * adv))))                              # days needed to unwind at par of the daily volume
sig = r.std()
var = norm.ppf(cf) * sig * np.sqrt(days) * pos                              # market VaR over the unwind period
cost_normal = 0.5 * sp * pos                                                # half-spread, normal conditions
cost_stress = 0.5 * sp * spm * pos                                          # spread widened in stress
print(f"unwind {days} day(s);  VaR {var:,.0f};  exit cost {cost_normal:,.0f} (normal) / {cost_stress:,.0f} (stress);  LVaR {var + cost_stress:,.0f}")
`,

    almgren: (v) => HDR('Almgren-Chriss optimal liquidation schedule') + `import numpy as np

X, T, sig, adv, lam = ${n(v.X, 1e6)}, ${n(v.T, 10)}, ${n(v.sig, 0.02)}, ${n(v.adv, 5e6)}, ${n(v.lam, 1e-6)}
eta, gamma = 0.1 * sig / adv, 0.05 * sig / adv                               # temporary and permanent impact coefficients
kappa = np.sqrt(lam * sig**2 / (eta - 0.5 * gamma * 1.0))
t = np.linspace(0, T, T + 1)
holdings = X * np.sinh(kappa * (T - t)) / np.sinh(kappa * T)                  # optimal remaining position
trades = -np.diff(holdings)
print("kappa", kappa, " (0 = straight-line / TWAP; larger = trade faster, accept more impact)")
print("shares sold per day:", np.round(trades))
cost = gamma * 0.5 * X**2 + eta * np.sum(trades**2)
risk = sig * np.sqrt(np.sum(holdings[1:] ** 2))
print(f"expected impact cost {cost:,.0f}   risk of the unsold remainder {risk:,.0f}")
`,

    liqcrypto: (v) => HDR('Crypto liquidity: unwinding a position against market depth and spread') + `import numpy as np

${RETS}
pos, pr = ${n(v.pos, 1e6)}, ${n(v.pr, 0.1)}
adv = 2e8                                                                    # average daily volume in USD (replace by exchange data)
days = max(1.0, pos / (pr * adv))
sig = r.std()
impact = 0.1 * sig * np.sqrt(pos / adv)                                      # square-root impact model
print(f"unwind in {days:.2f} days at {pr:.0%} participation; market impact {impact:.3%} (= {impact * pos:,.0f});  VaR 99% over the unwind {2.326 * sig * np.sqrt(days) * pos:,.0f}")
`,

    fundwall: (v) => HDR('Funding wall: maturing debt against the liquidity buffer') + `import numpy as np

buf, cf = ${n(v.buf, 100)}, ${n(v.cf, 0.5)}                                   # buffer, share of maturing funding that can be rolled
mat = np.array([${n(v.o1, 40)}, ${n(v.o2, 60)}, ${n(v.o3, 50)}, ${n(v.o4, 30)}, ${n(v.o5, 20)}])
months = ["M1", "M2", "M3", "M4", "M5"]
b = buf
for m, o in zip(months, mat):
    b = b - o * (1 - cf)                                                      # only the non-rolled part drains the buffer
    print(f"{m}: maturing {o:6.1f}  buffer left {b:7.1f}  {'SHORTFALL' if b < 0 else ''}")
`,

    margincall: (v) => HDR('Margin calls on a leveraged position: liquidation probability') + `import numpy as np

${RETS}
lev, mt, h, yrs = ${n(v.lev, 3)}, ${n(v.mt, 0.25)}, ${n(v.h, 30)}, ${n(v.yrs, 5)}
x = r[-int(252 * yrs):]
hits = 0; trials = len(x) - int(h)
for i in range(trials):
    path = np.cumprod(1 + x[i:i + int(h)])
    equity = lev * path - (lev - 1)                                   # equity of the account, per unit of initial equity
    if (equity / (lev * path) <= mt).any(): hits += 1                    # margin ratio = equity / position value (lev x path)
print(f"probability of a margin call within {int(h)} days at {lev}x leverage and {mt:.0%} maintenance: {hits / trials:.1%}")
print("price drop that triggers it:", 1 - (lev - 1) / lev / (1 - mt))
`,
  });
})(typeof window !== 'undefined' ? window : globalThis);
