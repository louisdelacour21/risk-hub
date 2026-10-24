'use strict';
/* "Python" button: for the module on screen, shows runnable Python for the same calculation, with the current slider values filled in.
   PYCODE[key](v) -> source text; key = module id, or 'run/<x>' / 'options' for the pages that are not lab modules. Add a module by adding an entry. */
((G) => {
  const n = (x, d) => (x === undefined || x === null || Number.isNaN(Number(x)) ? d : Number(x));
  const HDR = (t) => `# ${t}\n# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas\n`;
  const RETS = `# Daily returns: replace the synthetic series by your own (e.g. pd.read_csv("btc.csv")["close"].pct_change().dropna().values)
rng = np.random.default_rng(0)
r = rng.standard_t(4, 2500) * 0.02 / np.sqrt(2)
`;

  const PYCODE = {
    'run/var': () => HDR('VaR and Expected Shortfall: historical, parametric (normal), Monte-Carlo') + `import numpy as np
from scipy.stats import norm

${RETS}
cf = 0.99                      # confidence level
loss = -r                      # losses are positive numbers

# 1. Historical simulation
var_h = np.quantile(loss, cf)
es_h = loss[loss >= var_h].mean()

# 2. Parametric normal
mu, sd = r.mean(), r.std(ddof=1)
var_n = -(mu + sd * norm.ppf(1 - cf))
es_n = -mu + sd * norm.pdf(norm.ppf(1 - cf)) / (1 - cf)

# 3. Monte-Carlo (normal draws; swap in a fat-tailed law to be more realistic)
sim = rng.normal(mu, sd, 200_000)
var_m = np.quantile(-sim, cf)
es_m = (-sim)[-sim >= var_m].mean()

for name, v, e in [("historical", var_h, es_h), ("normal", var_n, es_n), ("monte-carlo", var_m, es_m)]:
    print(f"{name:12s} VaR {cf:.0%} = {v:.4%}   ES = {e:.4%}")

# Kupiec backtest (unconditional coverage) on the same series
from scipy.stats import chi2
x = int((loss > var_h).sum()); N = len(loss); p = 1 - cf
lr = -2 * (np.log((1 - p) ** (N - x) * p ** x) - np.log((1 - x / N) ** (N - x) * (x / N) ** x)) if 0 < x < N else np.nan
print(f"exceptions {x}/{N}, Kupiec LR = {lr:.3f}, p-value = {1 - chi2.cdf(lr, 1):.3f}")
`,

    options: () => HDR('Black-Scholes price, Greeks and implied volatility') + `import numpy as np
from scipy.stats import norm
from scipy.optimize import brentq

S, K, T, r, sigma = 100.0, 100.0, 1.0, 0.03, 0.50   # spot, strike, years, rate, volatility

def bs(S, K, T, r, sigma, call=True):
    d1 = (np.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * np.sqrt(T))
    d2 = d1 - sigma * np.sqrt(T)
    if call:
        price = S * norm.cdf(d1) - K * np.exp(-r * T) * norm.cdf(d2)
        delta, theta_adj = norm.cdf(d1), -r * K * np.exp(-r * T) * norm.cdf(d2)
    else:
        price = K * np.exp(-r * T) * norm.cdf(-d2) - S * norm.cdf(-d1)
        delta, theta_adj = norm.cdf(d1) - 1, r * K * np.exp(-r * T) * norm.cdf(-d2)
    gamma = norm.pdf(d1) / (S * sigma * np.sqrt(T))
    vega = S * norm.pdf(d1) * np.sqrt(T)                       # per 1.00 of volatility
    theta = -S * norm.pdf(d1) * sigma / (2 * np.sqrt(T)) + theta_adj   # per year
    vanna = -norm.pdf(d1) * d2 / sigma
    volga = vega * d1 * d2 / sigma
    return dict(price=price, delta=delta, gamma=gamma, vega=vega, theta=theta, vanna=vanna, volga=volga)

print("call", bs(S, K, T, r, sigma, True))
print("put ", bs(S, K, T, r, sigma, False))

def implied_vol(market_price, S, K, T, r, call=True):
    return brentq(lambda s: bs(S, K, T, r, s, call)["price"] - market_price, 1e-4, 5.0)

p = bs(S, K, T, r, sigma)["price"]
print("implied vol recovered:", implied_vol(p, S, K, T, r))
`,

    mc: (v) => HDR('Monte-Carlo paths under geometric Brownian motion') + `import numpy as np

S0, sigma, mu, T = 100.0, ${n(v.s, 0.25)}, ${n(v.mu, 0.06)}, ${n(v.T, 1)}
steps, paths = 252, 10_000
rng = np.random.default_rng(42)
dt = T / steps
z = rng.standard_normal((paths, steps))
logret = (mu - 0.5 * sigma**2) * dt + sigma * np.sqrt(dt) * z
S = S0 * np.exp(np.cumsum(logret, axis=1))

ST = S[:, -1]
pnl = ST / S0 - 1
cf = 0.99
print("mean terminal price", ST.mean(), " (theory", S0 * np.exp(mu * T), ")")
print(f"VaR {cf:.0%} over {T}y:", -np.quantile(pnl, 1 - cf))
print(f"ES  {cf:.0%} over {T}y:", -pnl[pnl <= np.quantile(pnl, 1 - cf)].mean())
`,

    bond: (v) => HDR('Bond price, duration and convexity') + `import numpy as np

cpn, y, T, f, face = ${n(v.cpn, 0.05)}, ${n(v.y, 0.045)}, ${n(v.T, 10)}, ${n(v.f, 2)}, 100.0

t = np.arange(1, int(T * f) + 1) / f          # payment dates in years
cf = np.full(t.shape, face * cpn / f); cf[-1] += face
df = (1 + y / f) ** (-t * f)
price = (cf * df).sum()
mac = (t * cf * df).sum() / price               # Macaulay duration
mod = mac / (1 + y / f)                         # modified duration
conv = (t * (t + 1 / f) * cf * df).sum() / (price * (1 + y / f) ** 2)
dv01 = mod * price * 1e-4
print(f"price {price:.4f}  mac.dur {mac:.3f}  mod.dur {mod:.3f}  convexity {conv:.2f}  DV01 {dv01:.4f}")

dy = 0.01   # +100 bp: duration-convexity approximation vs full repricing
approx = price * (-mod * dy + 0.5 * conv * dy**2)
full = (cf * (1 + (y + dy) / f) ** (-t * f)).sum() - price
print("price change for +100bp: approx", approx, " full", full)
`,

    merton: (v) => HDR('Merton structural model: asset value, asset volatility, distance to default, PD') + `import numpy as np
from scipy.stats import norm
from scipy.optimize import fsolve

E, sE, D, r, T, mu = ${n(v.E, 40)}, ${n(v.sE, 0.5)}, ${n(v.D, 100)}, ${n(v.r, 0.03)}, ${n(v.T, 1)}, ${n(v.mu, 0.07)}

def equations(x):
    V, sV = x
    d1 = (np.log(V / D) + (r + 0.5 * sV**2) * T) / (sV * np.sqrt(T))
    d2 = d1 - sV * np.sqrt(T)
    return [V * norm.cdf(d1) - D * np.exp(-r * T) * norm.cdf(d2) - E,     # equity is a call on the assets
            norm.cdf(d1) * V * sV - E * sE]                                # equity volatility link

V, sV = fsolve(equations, [E + D, sE * E / (E + D)])
d2 = (np.log(V / D) + (r - 0.5 * sV**2) * T) / (sV * np.sqrt(T))
print(f"asset value {V:.2f}, asset vol {sV:.3f}")
print(f"risk-neutral PD {norm.cdf(-((np.log(V / D) + (r - 0.5 * sV**2) * T) / (sV * np.sqrt(T)))):.4%}")
dd = (np.log(V / D) + (mu - 0.5 * sV**2) * T) / (sV * np.sqrt(T))
print(f"distance to default {dd:.3f}, real-world PD {norm.cdf(-dd):.4%}")
`,

    ecl: (v) => HDR('IFRS 9 expected credit loss, probability-weighted scenarios') + `import numpy as np

pd_, lgd, T, eir, ead = ${n(v.pd, 0.02)}, ${n(v.lgd, 0.45)}, ${n(v.T, 5)}, ${n(v.eir, 0.05)}, 100.0
stage = ${n(v.st, 1)}
scenarios = [  # (weight, PD multiplier)
    (${(1 - n(v.wd, 0.2)).toFixed(2)}, 1.0),
    (${n(v.wd, 0.2).toFixed(2)}, ${n(v.dn, 2)}),
]

def ecl(mult, years):
    """Level-principal loan of T years, annual hazard h, default mid-year, discounted at the effective rate."""
    h = min(0.999, pd_ * mult); surv = 1.0; tot = 0.0
    for t in range(1, int(min(T, years)) + 1):
        balance = ead * (1 - (t - 1) / T)
        tot += surv * h * lgd * balance * (1 + eir) ** (-(t - 0.5))
        surv *= 1 - h
    return tot

e12 = sum(w * ecl(m, 1) for w, m in scenarios)
life = sum(w * ecl(m, T) for w, m in scenarios)
out = {1: e12, 2: life, 3: lgd * ead}[stage]       # stage 3: credit-impaired, PD = 1 on the current balance
print(f"12-month ECL {e12:.3f}   lifetime ECL {life:.3f}   stage {stage} provision {out:.3f} ({out / ead:.2%} of exposure)")
`,

    qshor: (v) => HDR('Shor on elliptic curves: what the quantum machine needs (Roetteler et al. 2017 + surface code)') + `import numpy as np

n = ${n(v.bits, 256)}                    # curve size in bits
p = 10 ** ${n(v.lp, -3)}                 # physical error rate
p_th = 1e-2                              # surface-code threshold
cycle = ${n(v.cyc, 1)} * 1e-6            # error-correction cycle, seconds
gain = ${n(v.gain, 1)}                   # assumed algorithmic improvement on the gate count
budget = 0.1                             # allowed overall failure probability

lg = np.log2(n)
logical = int(np.ceil(9 * n + 2 * lg + 10))
toffoli = (448 * n**3 * lg + 4090 * n**3) / gain

d = 3
while d < 301 and 0.1 * (p / p_th) ** ((d + 1) / 2) * logical * toffoli > budget:
    d += 2                                # smallest odd code distance meeting the budget
per_logical = 2 * d * d
physical = logical * per_logical
seconds = toffoli * d * cycle
print(f"logical qubits {logical:,}   Toffoli gates {toffoli:.3e}   code distance {d}")
print(f"physical qubits {physical:,.0f}   run time {seconds / 3600:.1f} h")
`,

    drift: () => HDR('Population Stability Index and two-sample Kolmogorov-Smirnov drift test') + `import numpy as np
from scipy.stats import ks_2samp

def psi(ref, new, bins=10):
    edges = np.quantile(ref, np.linspace(0, 1, bins + 1)); edges[0], edges[-1] = -np.inf, np.inf
    a = np.histogram(ref, edges)[0] / len(ref); b = np.histogram(new, edges)[0] / len(new)
    a, b = np.clip(a, 1e-6, None), np.clip(b, 1e-6, None)
    return float(np.sum((b - a) * np.log(b / a)))

rng = np.random.default_rng(1)
ref = rng.normal(0, 1, 500)                 # reference period
new = rng.normal(0.3, 1.3, 90)              # recent window: replace by your data
print("PSI:", psi(ref, new), "(< 0.10 stable, 0.10-0.25 watch, > 0.25 act)")
print("KS :", ks_2samp(ref, new))
`,

    fair: () => HDR('Fairness metrics for a binary decision') + `import numpy as np

def fairness(y_true, y_pred, group):
    """Return approval rates, demographic-parity gap, equal-opportunity gap, disparate-impact ratio (group 1 vs group 0)."""
    y_true, y_pred, group = map(np.asarray, (y_true, y_pred, group))
    out = {}
    for g in (0, 1):
        m = group == g
        out[g] = dict(approval=y_pred[m].mean(), tpr=y_pred[m & (y_true == 1)].mean(), fpr=y_pred[m & (y_true == 0)].mean())
    return dict(rates=out,
                demographic_parity_gap=out[1]["approval"] - out[0]["approval"],
                equal_opportunity_gap=out[1]["tpr"] - out[0]["tpr"],
                disparate_impact=out[1]["approval"] / out[0]["approval"])

rng = np.random.default_rng(0)
group = rng.integers(0, 2, 5000)
y_true = (rng.random(5000) < np.where(group == 0, 0.7, 0.4)).astype(int)
score = y_true * 1.5 + rng.normal(size=5000) - 0.0 * group
y_pred = (score > 0.75).astype(int)
print(fairness(y_true, y_pred, group))     # four-fifths rule: disparate impact below 0.8 is a red flag
`,

    lcr: (v) => HDR('Liquidity Coverage Ratio (Basel III, simplified run-off rates)') + `# Stock of HQLA over net cash outflows in 30 days. Run-off / inflow rates below are the Basel III standard ones used by the lab.
l1, l2a, l2b = ${n(v.l1, 100)}, ${n(v.l2a, 40)}, ${n(v.l2b, 10)}

stock = l1 + min(0.85 * l2a + 0.75 * l2b, l1 * 2 / 3)         # level 2 capped at 40% of the stock (= 2/3 of level 1)

outflows = {   # (amount, run-off rate)
    "retail stable":      (${n(v.rs, 400)}, 0.05),
    "retail less stable": (${n(v.rl, 150)}, 0.10),
    "corporate operational":     (${n(v.co, 150)}, 0.25),
    "corporate non-operational": (${n(v.cn, 100)}, 0.40),
    "financial institutions":    (${n(v.fi, 50)}, 1.00),
    "undrawn credit lines":      (${n(v.ln, 150)}, 0.10),
}
out = sum(a * r for a, r in outflows.values())
inflow = min(${n(v.ci, 50)} * 0.50, 0.75 * out)                # inflows capped at 75% of outflows
net = out - inflow
print(f"HQLA {stock:.1f}  outflows {out:.1f}  inflows {inflow:.1f}  LCR {stock / net:.1%}  (minimum 100%)")
`,

    evt: (v) => HDR('Extreme Value Theory: peaks-over-threshold with a Generalised Pareto tail') + `import numpy as np
from scipy.stats import genpareto

${RETS}
loss = -r
u_q, cf = ${n(v.u, 0.95)}, ${n(v.c, 0.99)}        # threshold quantile, VaR confidence
u = np.quantile(loss, u_q)
exc = loss[loss > u] - u
xi, _, beta = genpareto.fit(exc, floc=0)           # shape xi, scale beta
Nu, N = len(exc), len(loss)

var = u + beta / xi * (((N / Nu) * (1 - cf)) ** (-xi) - 1)
es = var / (1 - xi) + (beta - xi * u) / (1 - xi)
print(f"threshold {u:.4%}  xi {xi:.3f}  beta {beta:.4f}  ({Nu} exceedances)")
print(f"EVT VaR {cf:.1%} = {var:.4%}   ES = {es:.4%}")
`,

    garchfit: (v) => HDR('GARCH(1,1) / GJR-GARCH volatility fit and forecast') + `# pip install arch
import numpy as np
from arch import arch_model

${RETS}
am = arch_model(r * 100, vol="GARCH", p=1, o=${v.md === 'g' ? 0 : 1}, q=1, dist="normal", mean="Constant")   # o=1 -> GJR asymmetry
res = am.fit(disp="off")
print(res.summary())
f = res.forecast(horizon=${n(v.h, 120)})
vol = np.sqrt(f.variance.values[-1]) / 100            # daily vol forecast path
print("annualised vol, first and last forecast day:", vol[0] * np.sqrt(252), vol[-1] * np.sqrt(252))
`,
  };

  // ---- UI ----
  const key = () => { const h = location.hash; let m = h.match(/^#\/m\/([a-z0-9_]+)/); if (m) return m[1]; m = h.match(/^#\/run\/([a-z0-9_]+)/); if (m) return 'run/' + m[1]; return /^#\/options/.test(h) ? 'options' : null; };
  const vals = (k) => (G.Lab && G.Lab.vals && G.Lab.vals[k]) || {};
  const get = (k) => { try { return PYCODE[k](vals(k)); } catch (e) { return '# could not build the code: ' + e.message; } };

  function init() {
    if (typeof document === 'undefined') return;
    const btn = document.createElement('button');
    btn.id = 'pybtn'; btn.type = 'button'; btn.textContent = 'Python'; btn.title = 'Show this calculation as Python code'; btn.hidden = true;
    const dlg = document.createElement('dialog'); dlg.id = 'pydlg';
    dlg.innerHTML = '<div class="pyhead"><b id="pytitle"></b><span><button type="button" id="pycopy">Copy</button><button type="button" id="pydl">Download .py</button><button type="button" id="pyx" aria-label="Close">✕</button></span></div><pre id="pycode"></pre><small>Uses the slider values currently set. Educational code: check it against your own data before relying on it.</small>';
    document.body.append(btn, dlg);
    const show = () => { const k = key(); $('#pytitle').textContent = 'Python · ' + k; $('#pycode').textContent = get(k); dlg.showModal(); };
    const $ = (s) => dlg.querySelector(s);
    btn.addEventListener('click', show);
    $('#pyx').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    $('#pycopy').addEventListener('click', async (e) => { const b = e.target, t = $('#pycode').textContent; try { await navigator.clipboard.writeText(t); } catch (_) { const r = document.createRange(); r.selectNodeContents($('#pycode')); getSelection().removeAllRanges(); getSelection().addRange(r); document.execCommand('copy'); } b.textContent = 'Copied'; setTimeout(() => (b.textContent = 'Copy'), 1400); });
    $('#pydl').addEventListener('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([$('#pycode').textContent], { type: 'text/x-python' })); a.download = (key() || 'risk').replace('/', '_') + '.py'; a.click(); URL.revokeObjectURL(a.href); });
    const sync = () => { btn.hidden = !PYCODE[key()]; };
    addEventListener('hashchange', sync); sync();
  }
  const MULTI = `# Four correlated fat-tailed daily return series (replace by your own DataFrame of returns) and portfolio weights
rng = np.random.default_rng(0)
C = np.array([[1, .6, .4, .2], [.6, 1, .5, .3], [.4, .5, 1, .4], [.2, .3, .4, 1]])
R = rng.standard_t(5, (2500, 4)) @ np.linalg.cholesky(C).T * (np.array([.02, .015, .03, .01]) / np.sqrt(5 / 3))
w = np.array([.4, .3, .2, .1])
`;
  G.PyCode = { PYCODE, add: (o) => Object.assign(PYCODE, o), n, HDR, RETS, MULTI, get, key };
  if (typeof module !== 'undefined') module.exports = G.PyCode;
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : globalThis);
