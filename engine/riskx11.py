"""Risk, twelfth to fifteenth waves (riskx11.js to riskx14.js): KMV structural credit risk and LTV migration, FRTB P&L attribution and curvature,
wrong-way risk CVA, expectile / spectral measure / concentration. A line-for-line port tested by tests/test_riskx11.py."""
import math

from risk import norm_cdf as normCdf, norm_inv as Ninv, std
from quant import Rng, _exp, _div
from riskx2 import bs
from riskx3 import spearman
from riskx5 import ks2

nan, inf = math.nan, math.inf


def _sum(a):
    s = 0.0
    for x in a:
        s += x
    return s


def _mean(a):
    return _sum(a) / len(a)


# ---------- structural credit risk of a collateralised loan ----------
def kmv(o):
    m = o["mu"] - 0.5 * o["sigma"] * o["sigma"]
    s = o["sigma"] * math.sqrt(o["T"])
    b = -math.log(o["ratio"])
    dd = (math.log(o["ratio"]) + m * o["T"]) / s
    if abs(m) < 1e-12:
        touch = 2 * normCdf(b / s)
    else:
        touch = normCdf((b - m * o["T"]) / s) + _exp(2 * m * b / (o["sigma"] * o["sigma"])) * normCdf((b + m * o["T"]) / s)
    return {"dd": dd, "pdEnd": normCdf(-dd), "pdTouch": min(1, touch)}


def empirical(lr, h, ratio, pen=0):
    b = -math.log(ratio)
    n = len(lr) - h + 1
    loss = []
    end = touch = 0
    for i in range(n):
        c = 0.0
        hit = -1
        atHit = 0.0
        for j in range(h):
            c += lr[i + j]
            if hit < 0 and c < b:
                hit = j
                atHit = c
        if c < b:
            end += 1
        if hit >= 0:
            touch += 1
            loss.append(max(0, 1 - (1 - pen) * ratio * _exp(atHit)))
        else:
            loss.append(0)
    return {"n": n, "pdEnd": end / n, "pdTouch": touch / n, "el": _mean(loss), "loss": sorted(loss)}


def migration(lr, h, edges, liq, pen=0):
    lo = [0, *edges]
    hi = [*edges, liq]
    K = len(lo)
    mid = [(a + hi[i]) / 2 for i, a in enumerate(lo)]
    n = len(lr) - h + 1

    def band(x):
        for i in range(K):
            if x < hi[i]:
                return i
        return K
    P = []
    for l0 in mid:
        row = [0] * (K + 1)
        L = 0.0
        for i in range(n):
            c = 0.0
            hit = False
            for j in range(h):
                c += lr[i + j]
                l = l0 * _exp(-c)
                if l >= liq:
                    hit = True
                    L += max(0, 1 - (1 - pen) / l)
                    break
            row[K if hit else band(l0 * _exp(-c))] += 1
        P.append({"row": [x / n for x in row], "loss": L / n})
    return {"P": [r["row"] for r in P], "loss": [r["loss"] for r in P], "mid": mid, "bands": [[a, hi[i]] for i, a in enumerate(lo)], "n": n}


# ---------- FRTB P&L attribution and curvature ----------
def pla_zone(rho, ks):
    return "red" if rho < 0.7 or ks > 0.12 else "green" if rho > 0.8 and ks < 0.09 else "amber"


def roll_vol(lr, w):
    out = [nan] * len(lr)
    for i in range(w - 1, len(lr)):
        out[i] = std(lr[i - w + 1:i + 1]) * math.sqrt(365)
    for i in range(w - 1):
        out[i] = out[w - 1]
    return out


def option_pla(close, vol, mny=1, T=30 / 365, call=True, terms=("delta",), r=0):
    dt = 1 / 365
    hpl, rtpl = [], []
    for t in range(1, len(close)):
        S0, S1, s0, s1 = close[t - 1], close[t], vol[t - 1], vol[t]
        K = mny * S0

        def v(S, T_, s):
            return bs(S, K, T_, r, s, call)
        v0 = v(S0, T, s0)
        dS = S1 - S0
        h = S0 * 1e-4
        hv = 1e-4
        delta = (v(S0 + h, T, s0) - v(S0 - h, T, s0)) / (2 * h)
        gamma = (v(S0 + h, T, s0) - 2 * v0 + v(S0 - h, T, s0)) / (h * h)
        vega = (v(S0, T, s0 + hv) - v(S0, T, s0 - hv)) / (2 * hv)
        theta = (v(S0, T - dt, s0) - v0) / dt
        hpl.append(v(S1, T - dt, s1) - v0)
        rtpl.append((delta * dS if "delta" in terms else 0) + (0.5 * gamma * dS * dS if "gamma" in terms else 0)
                    + (vega * (s1 - s0) if "vega" in terms else 0) + (theta * dt if "theta" in terms else 0))
    return {"hpl": hpl, "rtpl": rtpl}


def pla(hpl, rtpl):
    rho = spearman(hpl, rtpl)
    ks = ks2(hpl, rtpl)["d"]
    return {"rho": rho, "ks": ks, "zone": pla_zone(rho, ks)}


def curvature(f, S0, w, delta):
    f0 = f(S0)
    up = -(f(S0 * (1 + w)) - f0 - delta * S0 * w)
    dn = -(f(S0 * (1 - w)) - f0 + delta * S0 * w)
    return {"up": up, "dn": dn, "charge": max(0, up, dn)}


# ---------- wrong-way risk ----------
def wwr_cva(S0=100, K=100, T=1, sigma=0.8, lam=0.05, lgd=0.6, rho=0, pos="put", steps=12, paths=8000, seed=3):
    R = Rng(seed)
    dt = T / steps
    a = sigma * math.sqrt(dt)

    def val(S, tau):
        if tau <= 1e-12:
            return max(K - S, 0) if pos == "put" else K - S if pos == "fwdShort" else S - K
        return bs(S, K, tau, 0, sigma, False) if pos == "put" else K - S if pos == "fwdShort" else S - K
    q = [_exp(-lam * i * dt) - _exp(-lam * (i + 1) * dt) for i in range(steps)]
    z = [Ninv(x) for x in q]
    ee = [0.0] * steps
    eeW = [0.0] * steps
    cp = [0.0] * paths
    ci = [0.0] * paths
    for p in range(paths):
        S = S0
        for i in range(steps):
            e = R.n()
            S *= _exp(a * e - 0.5 * a * a)
            E = max(val(S, T - (i + 1) * dt), 0)
            pd = normCdf((z[i] - math.sqrt(rho) * e) / math.sqrt(1 - rho)) if rho > 0 else q[i]
            ee[i] += E / paths
            eeW[i] += (E * pd) / paths
            cp[p] += lgd * E * pd
            ci[p] += lgd * E * q[i]
    cva = _sum(cp) / paths
    cvaInd = _sum(ci) / paths
    d = [x - ci[p] for p, x in enumerate(cp)]
    md = _sum(d) / paths
    se = math.sqrt(_sum([(x - md) * (x - md) for x in d]) / (paths - 1) / paths)
    return {"cva": cva, "cvaInd": cvaInd, "ratio": cva / cvaInd if cvaInd > 0 else nan, "se": se, "ee": ee, "q": q, "t": [(i + 1) * dt for i in range(len(q))], "eeW": eeW}


# ---------- risk measures other than VaR / ES, concentration ----------
def expectile(x, tau):
    lo, hi = min(x), max(x)

    def g(e):
        a = b = 0.0
        for v in x:
            if v > e:
                a += v - e
            else:
                b += e - v
        return tau * a - (1 - tau) * b
    for _ in range(200):
        m = (lo + hi) / 2
        if g(m) > 0:
            lo = m
        else:
            hi = m
    return (lo + hi) / 2


def match_level(losses, e):
    return len([v for v in losses if v <= e]) / len(losses)


def spectral(losses, k):
    s = sorted(losses)
    n = len(s)
    z = 1 - _exp(-k)
    r = w0 = 0.0
    for i in range(n):
        u1, u2 = i / n, (i + 1) / n
        w = (_exp(-k * (1 - u2)) - _exp(-k * (1 - u1))) / z
        r += w * s[i]
        w0 += w
    return r / w0


def concentration(a):
    v = [abs(x) for x in a]
    t = _sum(v)
    n = len(v)
    p = [x / t for x in v]
    hhi = _sum([x * x for x in p])
    srt = sorted(p)
    gini = _sum([(2 * (i + 1) - n - 1) * x for i, x in enumerate(srt)]) / n
    return {"hhi": hhi, "eff": 1 / hhi, "gini": gini, "share": p}
