"""Risk, second wave: operational-risk LDA, Merton structural credit, swap exposure and XVA (Vasicek), FRTB liquidity-horizon ES, LCR / NSFR, reverse stress test,
hierarchical risk parity, Basel IRB capital and IFRS 9 ECL, rating transitions: a line-for-line port of riskx.js. Closures of the JavaScript (var, es, sla, dd) become functions
of the result. Tested by tests/test_riskx.py."""
import math
import struct

from risk import norm_cdf as N, norm_inv as Ninv, mean, historical
from quant import Rng, solve, irb_rho, irb_k, _exp, _div, _log

nan, inf = math.nan, math.inf


def _f32(x):
    return struct.unpack("f", struct.pack("f", x))[0]


def _round(x):
    return math.floor(x + 0.5)


def quantile(s, p):
    return s[min(len(s) - 1, max(0, math.ceil(p * len(s)) - 1))]


# ---------- operational risk: loss distribution approach ----------
def poisson(R, lam):
    if lam > 30:
        return max(0, _round(lam + math.sqrt(lam) * R.n()))
    L = _exp(-lam)
    k, p = 0, 1.0
    while True:
        k += 1
        p *= R.u()
        if not p > L:
            break
    return k - 1


def gamma_draw(R, a):                                 # Marsaglia-Tsang
    if a < 1:
        return gamma_draw(R, a + 1) * R.u() ** (1 / a)
    d = a - 1 / 3
    c = 1 / math.sqrt(9 * d)
    while True:
        while True:
            x = R.n()
            v = 1 + c * x
            if not v <= 0:
                break
        v = v * v * v
        u = R.u()
        if _log(u) < 0.5 * x * x + d * (1 - v + _log(v)):
            return d * v


def lda(o):
    R = Rng(o.get("seed") or 7)
    n = o.get("n") or 50000
    u = _exp(o["mu"] + o["sigma"] * Ninv(o.get("q") or 0.9))
    beta = o.get("beta") or u * 0.5
    xi = o.get("xi")

    def sev():
        x = _exp(o["mu"] + o["sigma"] * R.n())
        if not xi or x <= u:
            return x
        return u + beta * ((1 - R.u()) ** -xi - 1) / xi
    years, counts = [0.0] * n, [0.0] * n
    for i in range(n):
        lam = gamma_draw(R, o["lam"] / o["disp"]) * o["disp"] if (o.get("disp") or 0) > 0 else o["lam"]
        k = poisson(R, lam)
        s = 0.0
        for _ in range(k):
            s += sev()
        years[i] = s
        counts[i] = k
    srt = sorted(years)
    meanSev = None if xi else _exp(o["mu"] + o["sigma"] ** 2 / 2)
    return {"years": years, "sorted": srt, "n": n, "mean": mean(srt), "meanSev": meanSev, "countMean": mean(counts), "mu": o["mu"], "sigma": o["sigma"], "lam": o["lam"]}


def lda_var(res, p):
    return quantile(res["sorted"], p)


def lda_es(res, p):
    n, srt = res["n"], res["sorted"]
    k = math.ceil(n * (1 - p))
    s = 0.0
    for i in range(n - k, n):
        s += srt[i]
    return s / k


def lda_sla(res, p):                                  # single-loss approximation (Bocker-Kluppelberg), Poisson-lognormal case
    if not res["meanSev"]:
        return None
    return _exp(res["mu"] + res["sigma"] * Ninv(1 - (1 - p) / res["lam"])) + (res["lam"] - 1) * res["meanSev"]


# ---------- Merton structural credit ----------
def merton_eq(V, D, r, T, s):
    d1 = _div(_log(_div(V, D)) + (r + s * s / 2) * T, s * math.sqrt(T))
    d2 = d1 - s * math.sqrt(T)
    return {"E": V * N(d1) - D * _exp(-r * T) * N(d2), "d1": d1, "d2": d2}


def merton(E, sigE, D, r, T):
    s = sigE * E / (E + D)
    V = E + D
    for _ in range(500):
        lo, hi = E, E + D * 3
        for _ in range(100):
            mid = (lo + hi) / 2
            if merton_eq(mid, D, r, T, s)["E"] > E:
                hi = mid
            else:
                lo = mid
        V = (lo + hi) / 2
        d1 = merton_eq(V, D, r, T, s)["d1"]
        sNew = sigE * E / (V * N(d1))
        if abs(sNew - s) < 1e-12:
            s = sNew
            break
        s = 0.5 * s + 0.5 * sNew
    q = merton_eq(V, D, r, T, s)
    debt = V - E
    y = _div(-_log(_div(debt, D)), T)
    return {"V": V, "sigV": s, "d1": q["d1"], "d2": q["d2"], "pdRN": N(-q["d2"]), "debt": debt, "yield": y, "spread": y - r, "lev": D / V, "T": T, "D": D}


def merton_dd(fit, mu):                               # distance to default under the real-world drift mu
    s, T = fit["sigV"], fit["T"]
    return (math.log(fit["V"] / fit["D"]) + (mu - s * s / 2) * T) / (s * math.sqrt(T))


# ---------- swap exposure and XVA under Vasicek ----------
def vas_bond(r, tau, a, b, s):
    if tau <= 1e-12:
        return 1
    B = (1 - _exp(-a * tau)) / a
    return _exp((b - s * s / (2 * a * a)) * (B - tau) - s * s * B * B / (4 * a) - B * r)


def swap_xva(o):
    r0, a, b, sig, T = o["r0"], o["a"], o["b"], o["sig"], o["T"]
    dt = 1 / 12
    N_ = _round(T * 12)
    P = o.get("paths") or 4000
    R = Rng(o.get("seed") or 11)
    pay = o.get("pay") or 1
    dates = [i + 1 for i in range(math.ceil(T))]
    ann = sum(vas_bond(r0, d, a, b, sig) for d in dates)
    K = o["K"] if o.get("K") is not None else (1 - vas_bond(r0, T, a, b, sig)) / ann

    def value(t, r, rr):
        i = math.floor(t + 1e-9) + 1
        if i > T:
            return 0
        fx = 0.0
        for d in dates:
            if d >= i:
                fx += vas_bond(r, d - t, a, b, sig)
        return pay * (vas_bond(r, i - t, a, b, sig) / vas_bond(rr, 1, a, b, sig) - vas_bond(r, T - t, a, b, sig) - K * fx)
    m = o.get("mpor") or 0
    csa = o.get("thr") is not None
    H = o.get("thr") or 0
    sdStat = sig / math.sqrt(2 * a)
    ee, ene, eeD, eneD = [0.0] * (N_ + 1), [0.0] * (N_ + 1), [0.0] * (N_ + 1), [0.0] * (N_ + 1)
    cvaP = []
    ex = [[0.0] * P for _ in range(N_ + 1)]
    ex0 = _exp(-a * dt)
    sd = sig * math.sqrt((1 - _exp(-2 * a * dt)) / (2 * a))
    cva = dva = fca = fba = 0.0
    zs = []
    omega = o.get("omega") or 0
    for p in range(P):
        sgn = -1 if p % 2 else 1
        if not p % 2:
            zs = [R.n() for _ in range(N_)]
        r = r0
        D = S = Sown = 1.0
        rPrev = rr = r0
        pc = 0.0
        V = [value(0, r0, r0)]
        for k in range(1, N_ + 1):
            r = r * ex0 + b * (1 - ex0) + sd * sgn * zs[k - 1]
            D *= _exp(-0.5 * (r + rPrev) * dt)
            rPrev = r
            if k % 12 == 0:
                rr = r
            V.append(value(k * dt, r, rr))
            if not csa or k - m < 0:
                C = 0
            else:
                v = V[k - m]
                C = v - H if v > H else v + H if v < -H else 0
            expo = V[k] - C
            pos, neg = max(expo, 0), max(-expo, 0)
            h = o["hCp"] * _exp(omega * (r - r0) / sdStat)
            dS = S * (1 - _exp(-h * dt))
            S -= dS
            dSo = Sown * (1 - _exp(-o["hOwn"] * dt))
            Sown -= dSo
            pc += o["lgdCp"] * D * pos * dS
            dva += o["lgdOwn"] * D * neg * dSo / P
            fca += o["fund"] * D * pos * dt / P
            fba += o["fund"] * D * neg * dt / P
            ee[k] += pos / P
            ene[k] += neg / P
            eeD[k] += D * pos / P
            eneD[k] += D * neg / P
            ex[k][p] = _f32(pos)
        cva += pc / P
        cvaP.append(pc)
    mC = mean(cvaP)
    se = math.sqrt(sum((x - mC) ** 2 for x in cvaP) / (P - 1) / P)
    pfe = [sorted(arr)[min(P - 1, math.floor(0.975 * P))] for arr in ex]
    return {"K": K, "t": [k * dt for k in range(N_ + 1)], "ee": ee, "ene": ene, "eeD": eeD, "eneD": eneD, "pfe": pfe, "cva": cva, "cvaSe": se, "dva": dva, "fca": fca, "fba": fba, "fva": fca - fba,
            "epe": mean(ee[1:]), "peak": max(ee)}


# ---------- FRTB expected shortfall with liquidity horizons ----------
LHS = [10, 20, 40, 60, 120]


def frtb_es(rets, w, lh, conf=0.975):
    n = min(len(r) for r in rets)
    es = []
    for h in LHS:
        pr = [sum((w[i] * r[len(r) - n + t] if lh[i] >= h else 0) for i, r in enumerate(rets)) for t in range(n)]
        es.append(historical(pr, conf)["es"] * math.sqrt(10))
    s = es[0] ** 2
    for j in range(1, len(LHS)):
        s += (es[j] * math.sqrt((LHS[j] - LHS[j - 1]) / 10)) ** 2
    return {"es": es, "total": math.sqrt(s), "base": es[0]}


# ---------- liquidity regulation ----------
LCR_OUT = [["retail_stable", "Retail deposits, stable", 0.05], ["retail_less", "Retail deposits, less stable", 0.10], ["corp_op", "Corporate deposits, operational", 0.25], ["corp_non", "Corporate deposits, non-operational", 0.40], ["fin", "Financial-institution deposits", 1.00], ["lines", "Undrawn committed credit lines", 0.10], ["secured", "Secured funding maturing in 30 days", 0.25]]
LCR_IN = [["loans", "Performing loans maturing in 30 days", 0.50], ["reverse", "Reverse repos, unencumbered", 1.00]]


def lcr(hqla, outs, ins, stress=1):
    l2a, l2b = hqla["l2a"] * 0.85, hqla["l2b"] * 0.75
    l2cap = hqla["l1"] * (2 / 3)
    stock = hqla["l1"] + min(l2a + l2b, l2cap)
    out = sum((outs.get(k) or 0) * min(1, rt * stress) for k, _, rt in LCR_OUT)
    inflow = sum((ins.get(k) or 0) * rt for k, _, rt in LCR_IN)
    net = out - min(inflow, 0.75 * out)
    return {"stock": stock, "out": out, "inflow": min(inflow, 0.75 * out), "net": net, "ratio": stock / net if net > 0 else inf, "l2capBinding": l2a + l2b > hqla["l1"] * (2 / 3), "l2cap": l2cap}


NSFR_ASF = [["cap", "Regulatory capital", 1.00], ["ret_stable", "Retail deposits, stable", 0.95], ["ret_less", "Retail deposits, less stable", 0.90], ["wh_op", "Operational and corporate deposits", 0.50], ["wh_st", "Wholesale funding under 6 months", 0.00], ["lt", "Funding over 1 year", 1.00]]
NSFR_RSF = [["hq1", "Level 1 assets", 0.05], ["hq2", "Level 2 assets", 0.15], ["mort", "Residential mortgages", 0.65], ["corp", "Corporate loans", 0.85], ["other", "Other assets, equities, fixed assets", 1.00], ["off", "Off-balance sheet commitments", 0.05]]


def nsfr(asf, rsf):
    A = sum((asf.get(k) or 0) * f for k, _, f in NSFR_ASF)
    Rr = sum((rsf.get(k) or 0) * f for k, _, f in NSFR_RSF)
    return {"asf": A, "rsf": Rr, "ratio": A / Rr if Rr > 0 else inf}


# ---------- reverse stress test ----------
def reverse_stress(cov, w, L):
    sw = [sum(c * w[j] for j, c in enumerate(row)) for row in cov]
    q = sum(x * sw[i] for i, x in enumerate(w))
    return {"shock": [-L * x / q for x in sw], "sigma": math.sqrt(q), "dist": L / math.sqrt(q), "prob": N(-L / math.sqrt(q))}


# ---------- hierarchical risk parity, min-variance, max-diversification ----------
def hrp(cov):
    n = len(cov)
    sd = [math.sqrt(r[i]) for i, r in enumerate(cov)]
    dist = [[math.sqrt(max(0, (1 - _div(c, sd[i] * sd[j])) / 2)) for j, c in enumerate(r)] for i, r in enumerate(cov)]
    cl = [[i] for i in range(n)]
    while len(cl) > 1:
        bi, bj, bd = 0, 1, inf
        for i in range(len(cl)):
            for j in range(i + 1, len(cl)):
                d = inf
                for a in cl[i]:
                    for b in cl[j]:
                        d = min(d, dist[a][b])
                if d < bd:
                    bd, bi, bj = d, i, j
        cl = [c for k, c in enumerate(cl) if k != bi and k != bj] + [cl[bi] + cl[bj]]
    order = cl[0]
    w = [1.0] * n

    def cv(c):
        iv = [1 / cov[i][i] for i in c]
        s = sum(iv)
        x = [v / s for v in iv]
        t = 0.0
        for a, xi in enumerate(x):
            u = 0.0
            for b, xj in enumerate(x):
                u += xj * cov[c[a]][c[b]]
            t += xi * u
        return t
    st = [order]
    while st:
        c = st.pop()
        if len(c) < 2:
            continue
        h = len(c) >> 1
        L, Rr = c[:h], c[h:]
        vL, vR = cv(L), cv(Rr)
        al = 1 - vL / (vL + vR)
        for i in L:
            w[i] *= al
        for i in Rr:
            w[i] *= 1 - al
        st.append(L)
        st.append(Rr)
    return {"w": w, "order": order}


def long_only(cov, target):
    act = list(range(len(cov)))
    while True:
        S = [[cov[i][j] for j in act] for i in act]
        x = solve(S, [target[i] for i in act])
        s = sum(x)
        w = [v / s for v in x]
        neg = next((k for k, v in enumerate(w) if v < -1e-12), -1)
        if neg < 0 or len(act) == 1:
            out = [0.0] * len(cov)
            for k, i in enumerate(act):
                out[i] = max(0, w[k])
            return out
        act = [i for k, i in enumerate(act) if k != neg]


# ---------- Basel IRB capital and IFRS 9 ----------
def irb_rw(pd, lgd, m, kind="corp"):
    pd = max(pd, 0.0003)
    adj = 1
    if kind == "mortgage":
        rho = 0.15
    elif kind == "qrre":
        rho = 0.04
    elif kind == "retail":
        f = (1 - _exp(-35 * pd)) / (1 - _exp(-35))
        rho = 0.03 * f + 0.16 * (1 - f)
    else:
        rho = irb_rho(pd)
    b = (0.11852 - 0.05478 * math.log(pd)) ** 2
    if kind == "corp":
        adj = (1 + (m - 2.5) * b) / (1 - 1.5 * b)
    k = irb_k(pd, lgd, rho) * adj
    return {"rho": rho, "k": k, "rw": k * 12.5 * 1.06}


RATINGS = ["AAA", "AA", "A", "BBB", "BB", "B", "CCC", "D"]
_T = [[90.81, 8.33, 0.68, 0.06, 0.12, 0, 0, 0], [0.70, 90.65, 7.79, 0.64, 0.06, 0.14, 0.02, 0], [0.09, 2.27, 91.05, 5.52, 0.74, 0.26, 0.01, 0.06], [0.02, 0.33, 5.95, 86.93, 5.30, 1.17, 0.12, 0.18], [0.03, 0.14, 0.67, 7.73, 80.53, 8.84, 1.00, 1.06], [0, 0.11, 0.24, 0.43, 6.48, 83.46, 4.07, 5.20], [0.22, 0, 0.22, 1.30, 2.38, 11.24, 64.86, 19.79], [0, 0, 0, 0, 0, 0, 0, 100]]
TRANS = [[x / sum(r) for x in r] for r in _T]


def mat_mul(A, B):
    return [[sum(x * B[k][j] for k, x in enumerate(r)) for j in range(len(B[0]))] for r in A]


def cum_pd(Pm, years):                                # out[y-1][i] = P(default within y years | start rating i)
    M = [[1 if i == j else 0 for j in range(len(r))] for i, r in enumerate(Pm)]
    out = []
    for _ in range(years):
        M = mat_mul(M, Pm)
        out.append([r[-1] for r in M])
    return out


def ecl_cum(pdCum, lgd, ead, r, stage):               # stage 1 = 12 months, 2/3 = lifetime (stage 3: PD = 1)
    if stage == 3:
        return lgd * ead
    yrs = 1 if stage == 1 else len(pdCum)
    s = 0.0
    for y in range(1, yrs + 1):
        s += ((pdCum[y - 1] - (pdCum[y - 2] if y > 1 else 0)) * lgd * ead) / (1 + r) ** (y - 0.5)
    return s
