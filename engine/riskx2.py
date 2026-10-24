"""Risk, third wave: Black-Scholes and implied vol, Merton jumps, Heston by Lewis integration, CDS bootstrap, CreditRisk+, SA-CCR, KVA / MVA: a line-for-line port of riskx2.js.
Tested by tests/test_riskx2.py."""
import math

from risk import norm_cdf as N, norm_inv as Ninv
from quant import _exp, _div, _log

nan, inf = math.nan, math.inf


def _round(x):
    return math.floor(x + 0.5)


def bs(S, K, T, r, s, call=True):
    d1 = _div(_log(_div(S, K)) + (r + 0.5 * s * s) * T, s * math.sqrt(T))
    d2 = d1 - s * math.sqrt(T)
    c = S * N(d1) - K * _exp(-r * T) * N(d2)
    return c if call else c - S + K * _exp(-r * T)


def imp_vol(price, S, K, T, r):
    lo, hi = 1e-4, 4.0
    for _ in range(80):
        m = (lo + hi) / 2
        if bs(S, K, T, r, m) > price:
            hi = m
        else:
            lo = m
    return (lo + hi) / 2


def merton_jump(S, K, T, r, s, lam, muJ, sJ):
    k = _exp(muJ + 0.5 * sJ * sJ) - 1
    lp = lam * (1 + k)
    p, w = 0.0, _exp(-lp * T)
    for n in range(60):
        if n:
            w *= (lp * T) / n
        p += w * bs(S, K, T, r - lam * k + (n * _log(1 + k)) / T, math.sqrt(s * s + (n * sJ * sJ) / T))
    return p


# ---------- Heston (complex numbers as [re, im], as in the JavaScript) ----------
def cm(a, b):
    return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]


def cd(a, b):
    q = b[0] * b[0] + b[1] * b[1]
    return [_div(a[0] * b[0] + a[1] * b[1], q), _div(a[1] * b[0] - a[0] * b[1], q)]


def cexp(a):
    e = _exp(a[0])
    return [e * math.cos(a[1]), e * math.sin(a[1])]


def clog(a):
    return [_log(math.hypot(a[0], a[1])), math.atan2(a[1], a[0])]


def csqrt(a):
    m = math.sqrt(math.hypot(a[0], a[1]))
    t = math.atan2(a[1], a[0]) / 2
    return [m * math.cos(t), m * math.sin(t)]


def heston_cf(z, T, r, p):
    v0, kappa, theta, xi, rho = p["v0"], p["kappa"], p["theta"], p["xi"], p["rho"]
    w = [-z[1], z[0]]
    bb = [kappa - rho * xi * w[0], -rho * xi * w[1]]
    zz, bb2 = cm(z, z), cm(bb, bb)
    d = csqrt([bb2[0] + xi * xi * (w[0] + zz[0]), bb2[1] + xi * xi * (w[1] + zz[1])])
    bm = [bb[0] - d[0], bb[1] - d[1]]
    g = cd(bm, [bb[0] + d[0], bb[1] + d[1]])
    edT = cexp([-d[0] * T, -d[1] * T])
    num = [1 - g[0] * edT[0] + g[1] * edT[1], -(g[0] * edT[1] + g[1] * edT[0])]
    den = [1 - g[0], -g[1]]
    lg = clog(cd(num, den))
    A = cm([(kappa * theta) / (xi * xi), 0], [bm[0] * T - 2 * lg[0], bm[1] * T - 2 * lg[1]])
    B = cm(cd(bm, [xi * xi, 0]), cd([1 - edT[0], -edT[1]], num))
    return cexp([A[0] + v0 * B[0] + w[0] * r * T, A[1] + v0 * B[1] + w[1] * r * T])


def heston_call(S, K, T, r, p):
    k = _log(S / K) + r * T
    n, U = 3000, 300
    h = U / n
    s = 0.0
    for i in range(n + 1):
        u = i * h
        c = heston_cf([u, -0.5], T, r, p)
        adj = cexp([-0.5 * r * T, -u * r * T])
        f = cm(cm(cexp([0, u * k]), c), adj)[0] / (u * u + 0.25)
        s += (0.5 if i == 0 or i == n else 1) * f
    return S - (math.sqrt(S * K) * _exp(-r * T / 2) / math.pi) * s * h


# ---------- CDS ----------
def cds_legs(T, h, r, R):
    def hz(t):
        acc, prev = 0.0, 0.0
        for seg in h:
            a = min(t, seg["t"])
            if a > prev:
                acc += seg["h"] * (a - prev)
            prev = max(prev, seg["t"])
            if t <= seg["t"]:
                return acc
        return acc + h[-1]["h"] * (t - prev)
    dt = 0.25
    n = _round(T / dt)
    prem = prot = 0.0
    qPrev = 1.0
    for i in range(1, n + 1):
        t = i * dt
        q = _exp(-hz(t))
        df = _exp(-r * t)
        dfm = _exp(-r * (t - dt / 2))
        prem += dt * df * q
        prot += (1 - R) * dfm * (qPrev - q)
        qPrev = q
    return {"prem": prem, "prot": prot, "surv": _exp(-hz(T))}


def cds_bootstrap(tenors, spreads, r, R):
    h = []
    for j in range(len(tenors)):
        lo, hi = 1e-6, 5.0
        s = spreads[j]
        for _ in range(80):
            m = (lo + hi) / 2
            L = cds_legs(tenors[j], h + [{"t": tenors[j], "h": m}], r, R)
            if L["prot"] - s * L["prem"] > 0:
                hi = m
            else:
                lo = m
        h.append({"t": tenors[j], "h": (lo + hi) / 2})
    return h


def cds_pv(T, coupon, h, r, R):
    L = cds_legs(T, h, r, R)
    return {"pv": L["prot"] - coupon * L["prem"], "par": _div(L["prot"], L["prem"]), "rpv01": L["prem"], "surv": L["surv"]}


# ---------- CreditRisk+ ----------
def credit_risk_plus(loans, sig2, nMax):
    mu = sum(l["p"] for l in loans)
    maxNu = max(l["nu"] for l in loans)
    f = [0.0] * (maxNu + 1)
    for l in loans:
        f[l["nu"]] += l["p"] / mu
    if sig2 < 1e-9:
        a, b, g0 = 0, mu, _exp(-mu)
    else:
        r = 1 / sig2
        pn = 1 / (1 + sig2 * mu)
        a, b, g0 = 1 - pn, (r - 1) * (1 - pn), pn ** r
    g = [0.0] * (nMax + 1)
    g[0] = g0
    for n in range(1, nMax + 1):
        s = 0.0
        for j in range(1, min(n, maxNu) + 1):
            if f[j]:
                s += (a + (b * j) / n) * f[j] * g[n - j]
        g[n] = s
    cdf = []
    c = 0.0
    for n in range(nMax + 1):
        c += g[n]
        cdf.append(c)
    mean = 0.0
    for n, x in enumerate(g):
        mean += x * n
    return {"pmf": g, "cdf": cdf, "mean": mean, "mass": c, "el": sum(l["p"] * l["nu"] for l in loans)}


def crp_q(res, p):
    cdf = res["cdf"]
    for n in range(len(cdf)):
        if cdf[n] >= p:
            return n
    return len(cdf) - 1


def crp_es(res, p):
    g, cdf = res["pmf"], res["cdf"]
    v = crp_q(res, p)
    t = w = 0.0
    for n in range(v + 1, len(g)):
        t += g[n] * n
        w += g[n]
    lft = cdf[v] - p
    return (t + lft * v) / ((w + lft) or 1)


# ---------- SA-CCR ----------
def saccr(trades, o=None):
    o = o or {}
    margined = o.get("margined")
    mpor = o["mpor"] if o.get("mpor") is not None else 10

    def sd(S, E):
        return (_exp(-0.05 * S) - _exp(-0.05 * E)) / 0.05
    buckets = [0.0, 0.0, 0.0]
    V = 0.0
    for t in trades:
        V += t["mtm"]
        M = max(t["E"], 10 / 250)
        mf = 1.5 * math.sqrt(max(mpor, 10) / 250) if margined else math.sqrt(min(M, 1))
        d = t["N"] * sd(max(0, t["S"]), t["E"])
        k = 0 if t["E"] <= 1 else 1 if t["E"] <= 5 else 2
        buckets[k] += t["dir"] * d * mf
    D1, D2, D3 = buckets
    eff = math.sqrt(D1 * D1 + D2 * D2 + D3 * D3 + 1.4 * D1 * D2 + 1.4 * D2 * D3 + 0.6 * D1 * D3)
    addon = 0.005 * eff
    C = o.get("collateral") or 0
    mult = min(1, 0.05 + 0.95 * _exp((V - C) / (2 * 0.95 * (addon or 1e-12))))
    pfe = mult * addon
    rc = max(V - C, (o.get("th") or 0) + (o.get("mta") or 0), 0) if margined else max(V - C, 0)
    return {"V": V, "buckets": buckets, "eff": eff, "addon": addon, "mult": mult, "pfe": pfe, "rc": rc, "ead": 1.4 * (rc + pfe)}


# ---------- KVA / MVA ----------
def kva_mva(x, o):
    dt = x["t"][1] - x["t"][0]
    T = x["t"][-1]
    kva = mva = 0.0
    im, cap = [], []
    for k in range(1, len(x["t"])):
        t = x["t"][k]
        D = _exp(-o["r0"] * t)
        ann = (1 - _exp(-o["r0"] * (T - t))) / o["r0"]
        IM = Ninv(0.99) * ann * o["sig"] * math.sqrt(10 / 252)
        K = 0.08 * o["rw"] * 1.4 * x["ee"][k]
        im.append(IM)
        cap.append(K)
        kva += o["hurdle"] * D * K * dt
        mva += o["fund"] * D * IM * dt
    return {"kva": kva, "mva": mva, "im": im, "cap": cap}
