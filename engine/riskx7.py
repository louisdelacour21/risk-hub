"""Risk, eighth to eleventh waves (riskx7.js to riskx10.js): PD backtest, cross-currency basis, CDS-bond basis, operational scenarios with a Gaussian copula,
IFRS 9 ECL, liquidity estimators (Roll, Amihud, Corwin-Schultz, Parkinson), FRTB sensitivities-based method. A line-for-line port.
The JavaScript negBasis() returns a widen(d) closure; here neg_basis_widen(o, d) does the same. Tested by tests/test_riskx7.py."""
import math

from risk import norm_cdf as normCdf, norm_inv as normInv, mean
from quant import Rng, _exp, _div, _log

nan, inf = math.nan, math.inf


def _sum(a):
    s = 0.0
    for x in a:
        s += x
    return s


def _or(v, d):                                        # JS  v || d
    return d if (v is None or v == 0 or v != v) else v


def _get(o, k, d):                                    # JS  o.k ?? d
    return o[k] if o.get(k) is not None else d


# ---------- chi-square survival, any degrees of freedom ----------
def lgam(z):
    c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
    y = z
    t = z + 5.5
    t -= (z + 0.5) * math.log(t)
    s = 1.000000000190015
    for k in c:
        y += 1
        s += k / y
    return -t + math.log(2.5066282746310005 * s / z)


def chi2sf(x, k):
    if x <= 0:
        return 1
    a, xx = k / 2, x / 2
    if xx < a + 1:
        sm = 1 / a
        dl = sm
        ap = a
        for _ in range(500):
            ap += 1
            dl *= xx / ap
            sm += dl
            if abs(dl) < abs(sm) * 1e-14:
                break
        return 1 - sm * _exp(-xx + a * math.log(xx) - lgam(a))
    b = xx + 1 - a
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
        dl = d * c
        h *= dl
        if abs(dl - 1) < 1e-14:
            break
    return _exp(-xx + a * math.log(xx) - lgam(a)) * h


# ---------- PD backtest ----------
def binom_upper(k, n, p):
    if k <= 0:
        return 1
    term = (1 - p) ** n
    cdf = term
    for i in range(math.ceil(k - 1)):
        term *= _div((n - i) / (i + 1) * p, 1 - p)
        cdf += term
    return max(0, 1 - cdf)


def pd_backtest(pd, y, G0=10):
    idx = sorted(range(len(pd)), key=lambda i: pd[i])
    rows = []
    hl = brier = 0.0
    for g in range(G0):
        part = idx[math.floor(g * len(idx) / G0):math.floor((g + 1) * len(idx) / G0)]
        n = len(part)
        E = _sum([pd[i] for i in part])
        O = _sum([y[i] for i in part])
        rows.append({"n": n, "E": E, "O": O, "pdMean": _div(E, n), "rate": _div(O, n), "p": binom_upper(O, n, _div(E, n))})
        hl += (O - E) ** 2 / _or(E * (1 - _div(E, n)), 1e-12)
    for i in range(len(pd)):
        brier += (pd[i] - y[i]) ** 2
    O, E = _sum(y), _sum(pd)
    return {"rows": rows, "hl": hl, "hlP": chi2sf(hl, G0 - 2), "brier": brier / len(pd), "O": O, "E": E, "pTotal": binom_upper(O, len(pd), E / len(pd))}


# ---------- cross-currency basis ----------
def ccy_basis(o):
    fcip = o["S"] * (1 + o["rU"] * o["T"]) / (1 + o["rE"] * o["T"])
    implied = _div((o["F"] / o["S"]) * (1 + o["rE"] * o["T"]) - 1, o["T"])
    basis = implied - o["rU"]
    return {"fcip": fcip, "implied": implied, "basis": basis, "hedgedYield": o["yU"] - (implied - o["rE"]), "cipYield": o["yU"] - (o["rU"] - o["rE"])}


def fwd_from_basis(o):
    return o["S"] * (1 + (o["rU"] + o["basis"]) * o["T"]) / (1 + o["rE"] * o["T"])


# ---------- CDS-bond basis ----------
def neg_basis(o):
    carry = o["z"] - o["cds"] - o["f"] * (1 - o["haircut"])
    basis = o["cds"] - o["z"]
    ann = o["T"]
    conv = -basis * ann
    return {"basis": basis, "carry": carry, "convergence": conv, "total": carry * o["T"] + conv, "onCapital": _div(carry, o["haircut"]), "breakevenFund": _div(o["z"] - o["cds"], 1 - o["haircut"])}


def neg_basis_widen(o, d):
    carry = o["z"] - o["cds"] - o["f"] * (1 - o["haircut"])
    conv = -(o["cds"] - o["z"]) * o["T"]
    return (carry - d * (1 - o["haircut"])) * o["T"] + conv


# ---------- operational scenarios ----------
def ln_fit(m, q99):
    return {"mu": _log(m), "sigma": max(1e-6, _div(_log(q99 / m), normInv(0.99)))}


def pois_inv(u, lam):
    k = 0
    p = _exp(-lam)
    c = p
    while c < u and k < 500:
        k += 1
        p *= lam / k
        c += p
    return k


def op_scenarios(sc, o):
    R = Rng(o.get("seed") or 9)
    S = o.get("sims") or 20000
    rho = o["rho"]
    fits = [ln_fit(s["m"], s["q99"]) for s in sc]
    tot = []
    alone = [[] for _ in sc]
    for _ in range(S):
        z = R.n()
        t = 0.0
        for i, c in enumerate(sc):
            u = normCdf(math.sqrt(rho) * z + math.sqrt(1 - rho) * R.n())
            n = pois_inv(u, c["lam"])
            l = 0.0
            for _j in range(n):
                l += _exp(fits[i]["mu"] + fits[i]["sigma"] * R.n())
            alone[i].append(l)
            t += l
        tot.append(t)
    p = _or(o.get("q"), 0.999)

    def q(a, pp):
        b = sorted(a)
        return b[min(len(b) - 1, math.floor(pp * len(b)))]

    def es(a):
        b = sorted(a)
        return mean(b[math.floor(p * len(b)):])
    sa = [q(a, p) for a in alone]
    return {"var": q(tot, p), "es": es(tot), "mean": mean(tot), "standalone": sa, "sumStandalone": _sum(sa), "fits": fits}


# ---------- IFRS 9 ECL ----------
def ecl(o):
    h = min(0.999, o["pd"] * _get(o, "mult", 1))
    T = o["T"]
    n = min(T, _get(o, "years", T))
    s = 1.0
    tot = pdCum = 0.0
    for t in range(1, n + 1):
        ead = o["ead"] * (1 - (t - 1) / T)
        df = (1 + o["eir"]) ** (-(t - 0.5))
        tot += s * h * o["lgd"] * ead * df
        pdCum += s * h
        s *= 1 - h
    return {"ecl": tot, "pdCum": pdCum}


def ecl_weighted(o):
    e12 = el = 0.0
    for s in o["scenarios"]:
        b = {**o, "mult": s["mult"], "lgd": min(1, o["lgd"] * _get(s, "lgdMult", 1))}
        a = ecl({**b, "years": 1})["ecl"]
        l = ecl({**b, "years": o["T"]})["ecl"]
        e12 += s["w"] * a
        el += s["w"] * l
    e = e12 if o["stage"] == 1 else el if o["stage"] == 2 else o["ead"] * min(1, o["lgd"] * _get(o["scenarios"][0], "lgdMult", 1))
    return {"ecl": e, "ecl12": e12, "ecllife": el, "coverage": _div(e, o["ead"])}


# ---------- liquidity estimators ----------
def roll(close):
    d = [p - close[i] for i, p in enumerate(close[1:])]
    a, b = d[1:], d[:-1]
    ma, mb = mean(a), mean(b)
    cov = mean([(x - ma) * (b[i] - mb) for i, x in enumerate(a)])
    return 2 * math.sqrt(-cov) / mean(close) if cov < 0 else 0


def amihud(ret, volUsd):
    return mean([abs(r) / (volUsd[i] / 1e6) if volUsd[i] > 0 else 0 for i, r in enumerate(ret)])


K = 3 - 2 * math.sqrt(2)


def cs_day(h0, l0, h1, l1):
    beta = math.log(h0 / l0) ** 2 + math.log(h1 / l1) ** 2
    gam = math.log(max(h0, h1) / min(l0, l1)) ** 2
    al = (math.sqrt(2) - 1) * math.sqrt(beta) / K - math.sqrt(gam / K)
    e = _exp(al)
    return max(0, 2 * (e - 1) / (1 + e))


def corwin_schultz(high, low):
    return [cs_day(high[i], low[i], high[i + 1], low[i + 1]) for i in range(len(high) - 1)]


def parkinson(high, low):
    return math.sqrt(mean([math.log(h / low[i]) ** 2 for i, h in enumerate(high)]) / (4 * math.log(2)))


# ---------- FRTB sensitivities-based method ----------
def sc(c, m):
    return min(1, 1.25 * c) if m == "high" else max(2 * c - 1, 0.75 * c) if m == "low" else c


def sba(buckets, gamma, mode="medium"):
    B = []
    for b in buckets:
        ws = [x * b["rw"] for x in b["s"]]
        r = sc(b["rho"], mode)
        q = 0.0
        for i, a in enumerate(ws):
            for j, c in enumerate(ws):
                q += a * a if i == j else r * a * c
        K_ = math.sqrt(max(0, q))
        S = _sum(ws)
        B.append({"K": K_, "S": max(-K_, min(K_, S)), "raw": S})
    g = sc(gamma, mode)
    t = _sum([b["K"] * b["K"] for b in B])
    for i, a in enumerate(B):
        for j, b in enumerate(B):
            if i != j:
                t += g * a["S"] * b["S"]
    return {"K": math.sqrt(max(0, t)), "buckets": B}


def sba_max(buckets, gamma):
    r = [{"mode": m, **sba(buckets, gamma, m)} for m in ("low", "medium", "high")]
    best = r[0]
    for b in r[1:]:
        if b["K"] > best["K"]:
            best = b
    return {"scenarios": r, "capital": best["K"], "mode": best["mode"]}
