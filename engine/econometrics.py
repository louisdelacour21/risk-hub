"""Econometrics of the lab (OLS with diagnostics, unit-root and cointegration tests, AR / ARMA, GARCH / GJR by maximum likelihood, Granger): a line-for-line port of econometrics.js.
Options objects of the JavaScript become dicts; the closures of garchMle (forecast, nic) become garch_forecast and garch_nic of the fitted dict. Tested by tests/test_eco.py."""
import math

from risk import mean
from quant import nelder_mead, solve, _exp, _div, _log, _sqrt

nan, inf, PI = math.nan, math.inf, math.pi


# ---------- special functions: Student t, chi-square and F tails ----------
def lgamma(x):                                        # Lanczos
    c = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]
    if x < 0.5:
        return _log(_div(PI, math.sin(PI * x))) - lgamma(1 - x)
    x -= 1
    a = 0.99999999999980993
    t = x + 7.5
    for i in range(8):
        a += c[i] / (x + i + 1)
    return 0.5 * math.log(2 * PI) + (x + 0.5) * math.log(t) - t + math.log(a)


def betacf(a, b, x):                                  # continued fraction of the incomplete beta (Lentz)
    tiny = 1e-300
    c = 1.0
    d = 1 - (a + b) * x / (a + 1)
    if abs(d) < tiny:
        d = tiny
    d = 1 / d
    h = d
    for m in range(1, 301):
        m2 = 2 * m
        aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2))
        d = 1 + aa * d
        if abs(d) < tiny:
            d = tiny
        c = 1 + aa / c
        if abs(c) < tiny:
            c = tiny
        d = 1 / d
        h *= d * c
        aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1))
        d = 1 + aa * d
        if abs(d) < tiny:
            d = tiny
        c = 1 + aa / c
        if abs(c) < tiny:
            c = tiny
        d = 1 / d
        de = d * c
        h *= de
        if abs(de - 1) < 1e-14:
            break
    return h


def ibeta(x, a, b):                                   # regularised incomplete beta I_x(a, b)
    if x <= 0:
        return 0
    if x >= 1:
        return 1
    bt = _exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * math.log(x) + b * math.log(1 - x))
    return bt * betacf(a, b, x) / a if x < (a + 1) / (a + b + 2) else 1 - bt * betacf(b, a, 1 - x) / b


def t_two_sided(t, df):                               # P(|T| > |t|)
    return ibeta(_div(df, df + t * t), df / 2, 0.5)


def f_sf(f, d1, d2):
    return 1 if f <= 0 else ibeta(d2 / (d2 + d1 * f), d2 / 2, d1 / 2)


def gamma_q(a, x):                                    # upper regularised gamma Q(a, x)
    if x <= 0:
        return 1
    if x < a + 1:
        s = 1 / a
        t = s
        for n in range(1, 500):
            t *= x / (a + n)
            s += t
            if t < s * 1e-15:
                break
        return 1 - s * _exp(-x + a * math.log(x) - lgamma(a))
    b = x + 1 - a
    c = 1e300
    d = 1 / b
    h = d
    for i in range(1, 500):
        an = -i * (i - a)
        b += 2
        d = an * d + b
        if abs(d) < 1e-300:
            d = 1e-300
        c = b + an / c
        if abs(c) < 1e-300:
            c = 1e-300
        d = 1 / d
        de = d * c
        h *= de
        if abs(de - 1) < 1e-14:
            break
    return _exp(-x + a * math.log(x) - lgamma(a)) * h


def chi2_sf(x, k):
    return gamma_q(k / 2, x / 2)


# ---------- OLS ----------
def inv(A):
    n = len(A)
    cols = [solve(A, [1.0 if i == j else 0.0 for i in range(n)]) for j in range(n)]
    return [[c[i] for c in cols] for i in range(n)]


def matmul(A, B):
    return [[sum(x * B[k][j] for k, x in enumerate(r)) for j in range(len(B[0]))] for r in A]


def ols(y, cols, o=None):                             # cols = regressor columns; an intercept is added first unless o["intercept"] is False
    o = o or {}
    n = len(y)
    ic = o.get("intercept") is not False
    X = [([1] if ic else []) + [c[t] for c in cols] for t in range(n)]
    k = len(X[0])
    XtX = [[sum(X[t][i] * X[t][j] for t in range(n)) for j in range(k)] for i in range(k)]
    Xty = [sum(X[t][i] * y[t] for t in range(n)) for i in range(k)]
    A = inv(XtX)
    beta = [sum(a * Xty[j] for j, a in enumerate(r)) for r in A]
    e = [v - sum(x * beta[j] for j, x in enumerate(X[t])) for t, v in enumerate(y)]
    sse = sum(x * x for x in e)
    my = mean(y)
    sst = sum((v - my) ** 2 for v in y) if ic else sum(v * v for v in y)
    df = n - k
    s2 = _div(sse, df)
    seC = [_sqrt(s2 * r[i]) for i, r in enumerate(A)]

    def sandwich(S):
        M = matmul(matmul(A, S), A)
        return [math.sqrt(max(r[i], 0)) for i, r in enumerate(M)]

    def meat(L):                                      # sum of x_t x_s' e_t e_s with Bartlett weights (L = 0: White)
        S = [[0.0] * k for _ in range(k)]
        for l in range(L + 1):
            w = 1 if l == 0 else 1 - l / (L + 1)
            for t in range(l, n):
                f = e[t] * e[t - l] * w
                for i in range(k):
                    for j in range(k):
                        v = f * X[t][i] * X[t - l][j]
                        S[i][j] += v
                        if l > 0:
                            S[j][i] += v
        return S
    L = o["nw"] if o.get("nw") is not None else math.floor(4 * (n / 100) ** (2 / 9))
    want = o.get("robust") in ("hc1", "hac") or o.get("allSe")      # robust errors are O(n k^2 L): skipped unless asked (ADF runs dozens of fits)
    seW = sandwich([[x * n / df for x in r] for r in meat(0)]) if want else seC
    seH = sandwich(meat(L)) if want else seC
    se = seW if o.get("robust") == "hc1" else seH if o.get("robust") == "hac" else seC
    r2 = 1 - _div(sse, sst)
    F = _div(r2 / (k - 1), (1 - r2) / df) if ic and k > 1 else nan
    dw = 0.0
    for t in range(1, n):
        dw += (e[t] - e[t - 1]) ** 2
    dw = _div(dw, sse)
    ll = -0.5 * n * (math.log(2 * PI) + _log(sse / n) + 1)
    return {"n": n, "k": k, "beta": beta, "se": se, "seClassic": seC, "seHC1": seW, "seHAC": seH, "nwLags": L, "t": [_div(b, se[i]) for i, b in enumerate(beta)],
            "p": [t_two_sided(_div(b, se[i]), df) for i, b in enumerate(beta)], "r2": r2, "adjR2": 1 - _div((1 - r2) * (n - (1 if ic else 0)), df), "F": F,
            "pF": f_sf(F, k - 1, df) if math.isfinite(F) else nan, "dw": dw, "e": e, "sse": sse, "s2": s2, "df": df, "aic": -2 * ll + 2 * k, "bic": -2 * ll + k * math.log(n), "ll": ll}


def breusch_pagan(res, cols):                         # Koenker form: n * R2 of e^2 on the regressors, chi-square with k - 1 degrees of freedom
    a = ols([x * x for x in res["e"]], cols)
    lm = res["n"] * a["r2"]
    return {"lm": lm, "p": chi2_sf(lm, len(cols)), "df": len(cols)}


# ---------- unit root and cointegration ----------
CV = {"c": [-3.43, -2.86, -2.57], "ct": [-3.96, -3.41, -3.13], "n": [-2.57, -1.94, -1.62]}   # MacKinnon asymptotic 1 / 5 / 10 %
CV_EG = {2: [-3.90, -3.34, -3.04], 3: [-4.29, -3.74, -3.45], 4: [-4.64, -4.10, -3.81]}


def adf_reg(y, p, trend, start):                      # dy_t = a (+ b t) + g y_{t-1} + sum phi_i dy_{t-i} + e_t, observations t >= start
    dy = [v - y[i] for i, v in enumerate(y[1:])]
    Y = []
    cols = [[] for _ in range(1 + p + (1 if trend == "ct" else 0))]
    for t in range(start, len(dy)):
        Y.append(dy[t])
        cols[0].append(y[t])
        for i in range(1, p + 1):
            cols[i].append(dy[t - i])
        if trend == "ct":
            cols[p + 1].append(t)
    return ols(Y, cols, {"intercept": trend != "n"})


def adf(y, o=None):                                   # o["lags"]: a number, or "aic" (default) up to o["maxLag"]
    o = o or {}
    trend, n = o.get("trend") or "c", len(y)
    maxLag = o["maxLag"] if o.get("maxLag") is not None else math.ceil(12 * (n / 100) ** 0.25)
    fixed = isinstance(o.get("lags"), (int, float)) and not isinstance(o.get("lags"), bool)
    p, table = (o["lags"] if fixed else 0), None
    if not fixed:
        table = [{"p": q, "aic": adf_reg(y, q, trend, maxLag)["aic"]} for q in range(maxLag + 1)]
        best = table[0]
        for b in table[1:]:
            if b["aic"] < best["aic"]:
                best = b
        p = best["p"]
    r = adf_reg(y, p, trend, p)
    gi = 0 if trend == "n" else 1
    stat, cv = r["t"][gi], o.get("cv") or CV[trend]
    return {"stat": stat, "p": p, "gamma": r["beta"][gi], "rho": 1 + r["beta"][gi], "cv": cv, "reject5": stat < cv[1], "n": r["n"], "table": table}


def engle_granger(y, xs):                             # y on the xs with a constant, then ADF (no constant) on the residual
    r = ols(y, xs)
    a = adf(r["e"], {"trend": "n", "lags": "aic", "cv": CV_EG[min(len(xs) + 1, 4)]})
    ar = ols(r["e"][1:], [r["e"][:-1]], {"intercept": False})
    phi = ar["beta"][0]
    return {"beta": r["beta"], "spread": r["e"], "adf": a, "phi": phi, "halfLife": -math.log(2) / math.log(phi) if 0 < phi < 1 else inf, "r2": r["r2"]}


# ---------- AR and ARMA ----------
def acf(x, K):
    m = mean(x)
    d = [v - m for v in x]
    g0 = sum(v * v for v in d)
    out = []
    for k in range(K):
        s = 0.0
        for i in range(k + 1, len(x)):
            s += d[i] * d[i - k - 1]
        out.append(_div(s, g0))
    return out


def pacf(x, K):                                       # Durbin-Levinson
    r = [1] + acf(x, K)
    out, phi = [], []
    for k in range(1, K + 1):
        num = r[k] - sum(p * r[k - 1 - j] for j, p in enumerate(phi))
        den = 1 - sum(p * r[j + 1] for j, p in enumerate(phi))
        a = _div(num, den)
        phi = [p - a * phi[k - 2 - j] for j, p in enumerate(phi)] + [a]
        out.append(a)
    return out


def ar_fit(y, p):                                     # OLS with an intercept
    cols = [y[p - 1 - i:len(y) - 1 - i] for i in range(p)]
    r = ols(y[p:], cols)
    return {"p": p, "c": r["beta"][0], "phi": r["beta"][1:], "se": r["se"], "e": r["e"], "aic": r["aic"], "bic": r["bic"], "s2": r["s2"]}


def ar_select(y, pmax):                               # same estimation sample for every order, so the criteria are comparable
    out = []
    for p in range(pmax + 1):
        r = ols(y[pmax:], [y[pmax - 1 - i:len(y) - 1 - i] for i in range(p)])
        out.append({"p": p, "aic": r["aic"], "bic": r["bic"], "phi": r["beta"][1:]})
    return out


def arma_css(y, p, q):                                # conditional sum of squares: e_t = y_t - c - sum phi y_{t-i} - sum theta e_{t-j}
    m = mean(y)
    z = [v - m for v in y]
    n = len(z)

    def css(b):
        phi, th, e, s = b[:p], b[p:p + q], [0.0] * n, 0.0
        for t in range(p, n):
            f = z[t]
            for i in range(p):
                f -= phi[i] * z[t - 1 - i]
            for j in range(q):
                if t - 1 - j >= p:
                    f -= th[j] * e[t - 1 - j]
            e[t] = f
            s += f * f
        return 1e12 if any(abs(v) > 0.999 for v in b) else s
    k = p + q
    b = [0.05] * k
    if k:
        for _ in range(3):
            b = nelder_mead(css, b, 0.15, 800)["x"]
    sse, nn = css(b), n - p
    return {"p": p, "q": q, "mu": m, "phi": b[:p], "theta": b[p:], "sigma2": sse / nn, "aic": nn * _log(sse / nn) + 2 * (k + 1), "bic": nn * _log(sse / nn) + (k + 1) * math.log(nn)}


def ar_forecast(y, fit, h):
    x = list(y[-max(fit["p"], 1):])
    out = []
    for _ in range(h):
        v = fit["c"] + sum(ph * x[len(x) - 1 - i] for i, ph in enumerate(fit["phi"]))
        out.append(v)
        x.append(v)
    return out


# ---------- GARCH(1,1) / GJR-GARCH(1,1), Gaussian maximum likelihood ----------
def garch_path(e, om, a, g, b):                       # conditional variances s2[0..n] (s2[n] = next day); backcast as in the arch package
    n = len(e)
    tau = min(75, n)
    ws = back = 0.0
    for i in range(tau):
        w = 0.94 ** i
        ws += w
        back += w * e[i] * e[i]
    back /= ws
    s2 = [back]
    for t in range(n):
        s2.append(om + (a + (g if e[t] < 0 else 0)) * e[t] * e[t] + b * s2[t])
    return s2


def _sig(x):
    return 1 / (1 + _exp(-x))


def garch_mle(r, o=None):                             # r in percent works best; fits mu, omega, alpha, (gamma), beta
    o = o or {}
    gjr, n = bool(o.get("gjr")), len(r)
    mr = mean(r)
    v0 = sum((x - mr) ** 2 for x in r) / n

    def unpack(x):
        a, gm, b = _sig(x[2]), (_sig(x[4]) if gjr else 0), _sig(x[3])
        return {"mu": x[0], "om": _exp(x[1]), "a": a * 0.5, "g": gm * 0.8, "b": b}

    def nll(x):
        q = unpack(x)
        if q["a"] + q["g"] / 2 + q["b"] >= 0.99999:
            return 1e12
        e = [v - q["mu"] for v in r]
        s2 = garch_path(e, q["om"], q["a"], q["g"], q["b"])
        ll = 0.0
        for t in range(n):
            if not s2[t] > 0:
                return 1e12
            ll += 0.5 * (math.log(2 * PI) + math.log(s2[t]) + e[t] * e[t] / s2[t])
        return ll
    best = None
    for a0, b0 in ((0.08, 0.88), (0.05, 0.93), (0.15, 0.7)):
        x = [mr, math.log(v0 * (1 - a0 - b0)), math.log(a0 * 2 / (1 - a0 * 2)), math.log(b0 / (1 - b0))]
        if gjr:
            x.append(math.log(0.1 / 0.7))
        for k in range(4):
            x = nelder_mead(nll, x, 0.3 / (k + 1), 1500)["x"]
        f = nll(x)
        if best is None or f < best["f"]:
            best = {"x": x, "f": f}
    q = unpack(best["x"])
    e = [v - q["mu"] for v in r]
    s2 = garch_path(e, q["om"], q["a"], q["g"], q["b"])
    pers = q["a"] + q["g"] / 2 + q["b"]
    V = _div(q["om"], 1 - pers)
    k = 5 if gjr else 4
    return {**q, "persistence": pers, "longRunVar": V, "halfLife": _div(math.log(0.5), _log(pers)) if pers < 1 else inf, "ll": -best["f"], "aic": 2 * best["f"] + 2 * k,
            "bic": 2 * best["f"] + k * math.log(n), "s2": s2, "z": [_div(v, math.sqrt(s2[t])) for t, v in enumerate(e)], "next": s2[n]}


def garch_forecast(fit, h):
    V, pers, nxt = fit["longRunVar"], fit["persistence"], fit["next"]
    return [V + pers ** i * (nxt - V) for i in range(h)]


def garch_nic(fit, eps):
    return fit["om"] + (fit["a"] + (fit["g"] if eps < 0 else 0)) * eps * eps + fit["b"] * fit["longRunVar"]


# ---------- Granger causality ----------
def granger(y, x, p):                                 # does x help predict y beyond y's own p lags?  F test, restricted vs unrestricted
    n = len(y)
    Y = y[p:]

    def lag(s):
        return [s[p - 1 - i:n - 1 - i] for i in range(p)]
    r0, r1 = ols(Y, lag(y)), ols(Y, lag(y) + lag(x))
    F = _div((r0["sse"] - r1["sse"]) / p, r1["sse"] / r1["df"])
    return {"F": F, "p": f_sf(F, p, r1["df"]), "sign": sum(r1["beta"][1 + p:])}
