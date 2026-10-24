"""Risk, seventh wave (riskx6.js): funding survival under stress, maturity ladder, funds transfer pricing, FX hedged return, parameter stability (Chow sup-F, CUSUM).
A line-for-line port. The JavaScript ftp() returns a curve closure; here ftp_curve(o, t) does the same. Tested by tests/test_riskx6.py."""
import math

from risk import mean
from quant import Rng, _exp, _div

nan, inf = math.nan, math.inf


def _or(v, d):                                        # JS  v || d
    return d if (v is None or v == 0 or v != v) else v


# ---------- funding ----------
def survival(o):
    H = _or(o.get("horizon"), 180)
    dep = o["deposits"]
    days = list(range(H + 1))
    out, inn, net = [], [], []
    for t in days:
        o1 = 0.0
        for d in dep:
            o1 += d["amount"] * d["cap"] * (1 - _exp(_div(-t, d["tau"])))
        o1 += o["wholesale"] * (1 - o["rollover"]) * min(1, _div(t, o["wholesaleLife"])) + o["commit"] * o["draw"] * (1 - _exp(-t / 30))
        i1 = o["loans"] * o["inflow"] * o["inflowKeep"] * t
        out.append(o1)
        inn.append(i1)
        net.append(o1 - i1)
    buffer = o["cash"] + o["hqla"] * (1 - o["haircut"])
    hit = -1
    for i, x in enumerate(net):
        if x > buffer:
            hit = i
            break
    return {"days": days, "out": out, "inn": inn, "net": net, "buffer": buffer, "survival": inf if hit < 0 else hit}


def ladder(inflow, outflow, rollover):
    gap = [x - outflow[i] * (1 - _or(rollover[i] if i < len(rollover) else None, 0)) for i, x in enumerate(inflow)]
    cum = []
    s = 0.0
    for g in gap:
        s += g
        cum.append(s)
    return {"gap": gap, "cum": cum, "worst": min(cum)}


def ftp_curve(o, t):
    return o["base"] + o["liq"] * (1 - _exp(_div(-t, o["theta"])))


def ftp(o):
    N = _or(o.get("slices"), 120)
    c = w = 0.0
    for k in range(1, N + 1):
        t = o["T"] * k / N
        c += ftp_curve(o, t) * t
        w += t
    matched = _div(c, w)
    pooled = ftp_curve(o, o["pool"])
    return {"matched": matched, "pooled": pooled, "diff": pooled - matched, "annualCost": matched * o["notional"]}


def hedged(r, h, carry):
    return [-(1 - h) * x + h * carry for x in r]


# ---------- parameter stability ----------
def prefix(y, x):
    S = {"n": [0], "x": [0], "y": [0], "xx": [0], "xy": [0], "yy": [0]}
    for i in range(len(y)):
        S["n"].append(i + 1)
        S["x"].append(S["x"][i] + x[i])
        S["y"].append(S["y"][i] + y[i])
        S["xx"].append(S["xx"][i] + x[i] * x[i])
        S["xy"].append(S["xy"][i] + x[i] * y[i])
        S["yy"].append(S["yy"][i] + y[i] * y[i])
    return S


def fit_seg(S, a, b):
    n = b - a
    sx, sy = S["x"][b] - S["x"][a], S["y"][b] - S["y"][a]
    sxx, sxy, syy = S["xx"][b] - S["xx"][a], S["xy"][b] - S["xy"][a], S["yy"][b] - S["yy"][a]
    vx, cxy = sxx - sx * sx / n, sxy - sx * sy / n
    beta = cxy / vx if vx > 1e-18 else 0
    alpha = (sy - beta * sx) / n
    rss = max(0, syy - sy * sy / n - beta * cxy)
    return {"n": n, "alpha": alpha, "beta": beta, "rss": rss}


def ols2(y, x):
    f = fit_seg(prefix(y, x), 0, len(y))
    return {**f, "res": [v - f["alpha"] - f["beta"] * x[i] for i, v in enumerate(y)]}


def scan_f(y, x, trim):
    n = len(y)
    S = prefix(y, x)
    full = fit_seg(S, 0, n)
    lo, hi = math.floor(trim * n), math.ceil((1 - trim) * n)
    F, at = [], []
    for k in range(lo, hi + 1):
        a, b = fit_seg(S, 0, k), fit_seg(S, k, n)
        rss = a["rss"] + b["rss"]
        F.append(((full["rss"] - rss) / 2) / (rss / (n - 4)) if rss > 1e-18 else 0)
        at.append(k)
    return {"F": F, "at": at, "full": full}


def sup_f(y, x, o=None):
    o = o or {}
    trim = o["trim"] if o.get("trim") is not None else 0.15
    B = o["B"] if o.get("B") is not None else 199
    R = Rng(o.get("seed") or 11)
    sc = scan_f(y, x, trim)
    m = max(sc["F"])
    k = sc["F"].index(m)
    f = ols2(y, x)
    ge = 0
    for _ in range(B):
        yb = [f["alpha"] + f["beta"] * xi + f["res"][math.floor(R.u() * len(f["res"]))] for xi in x]
        if max(scan_f(yb, x, trim)["F"]) >= m:
            ge += 1
    return {**sc, "supF": m, "breakAt": sc["at"][k], "p": (ge + 1) / (B + 1), "before": fit_seg(prefix(y, x), 0, sc["at"][k]), "after": fit_seg(prefix(y, x), sc["at"][k], len(y))}


def cusum(res):
    n = len(res)
    sd = _or(math.sqrt(sum(e * e for e in res) / (n - 2)), 1)
    W = []
    s = 0.0
    for e in res:
        s += e
        W.append(s / (sd * math.sqrt(n)))
    return {"W": W, "sup": max(abs(w) for w in W), "crit": 1.358}
