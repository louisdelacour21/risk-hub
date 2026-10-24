"""Risk, sixteenth to twenty-second waves (riskx15.js to riskx21.js): copula fit by ML and correlation stability, historical episodes and Monte Carlo VaR
convergence, option book / margin calls / liquidity ladder, FRTB default risk charge, model tiering, filtered historical simulation, key-rate DV01 and
the BCBS IRRBB shocks. A line-for-line port tested by tests/test_riskx15.py."""
import math

from risk import norm_cdf as normCdf, norm_inv as normInv
from quant import Rng, _exp, _div, _log
from riskx2 import bs

nan, inf = math.nan, math.inf


def _sum(a):
    s = 0.0
    for x in a:
        s += x
    return s


def _mean(a):
    return _sum(a) / len(a)


def _round(x):                                        # JS Math.round: halves go up
    return math.floor(x + 0.5)


# ---------- copula fit ----------
def pseudo(x):
    idx = sorted(range(len(x)), key=lambda i: x[i])
    u = [0.0] * len(x)
    for r, i in enumerate(idx):
        u[i] = (r + 1) / (len(x) + 1)
    return u


def lgam(x):
    c = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]
    if x < 0.5:
        return math.log(math.pi / math.sin(math.pi * x)) - lgam(1 - x)
    x -= 1
    a = 0.99999999999980993
    t = x + 7.5
    for i in range(8):
        a += c[i] / (x + i + 1)
    return 0.5 * math.log(2 * math.pi) + (x + 0.5) * math.log(t) - t + math.log(a)


def betacf(a, b, x):
    qab, qap, qam = a + b, a + 1, a - 1
    c = 1.0
    d = 1 - qab * x / qap
    if abs(d) < 1e-300:
        d = 1e-300
    d = 1 / d
    h = d
    for m in range(1, 301):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1 + aa * d
        if abs(d) < 1e-300:
            d = 1e-300
        c = 1 + aa / c
        if abs(c) < 1e-300:
            c = 1e-300
        d = 1 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1 + aa * d
        if abs(d) < 1e-300:
            d = 1e-300
        c = 1 + aa / c
        if abs(c) < 1e-300:
            c = 1e-300
        d = 1 / d
        dl = d * c
        h *= dl
        if abs(dl - 1) < 1e-14:
            break
    return h


def ibeta(a, b, x):
    if x <= 0:
        return 0
    if x >= 1:
        return 1
    bt = _exp(lgam(a + b) - lgam(a) - lgam(b) + a * math.log(x) + b * math.log(1 - x))
    return bt * betacf(a, b, x) / a if x < (a + 1) / (a + b + 2) else 1 - bt * betacf(b, a, 1 - x) / b


def t_cdf(x, nu):
    p = 0.5 * ibeta(nu / 2, 0.5, nu / (nu + x * x))
    return 1 - p if x > 0 else p


def t_inv(p, nu):
    lo, hi = -1e3, 1e3
    for _ in range(200):
        m = (lo + hi) / 2
        if t_cdf(m, nu) < p:
            lo = m
        else:
            hi = m
    return (lo + hi) / 2


def ll_gauss(u, v, r):
    s = 0.0
    k = 1 - r * r
    for i in range(len(u)):
        a, b = normInv(u[i]), normInv(v[i])
        s += -0.5 * math.log(k) - (r * r * (a * a + b * b) - 2 * r * a * b) / (2 * k)
    return s


def ll_clayton(u, v, th):
    s = 0.0
    for i in range(len(u)):
        s += math.log(1 + th) - (1 + th) * math.log(u[i] * v[i]) - (2 + 1 / th) * math.log(u[i] ** -th + v[i] ** -th - 1)
    return s


def ll_gumbel(u, v, th):
    s = 0.0
    for i in range(len(u)):
        a, b = -math.log(u[i]), -math.log(v[i])
        A = a ** th + b ** th
        C = A ** (1 / th)
        s += -C + (th - 1) * (math.log(a) + math.log(b)) - math.log(u[i]) - math.log(v[i]) + (1 / th - 2) * math.log(A) + math.log(C + th - 1)
    return s


def ll_t(ta, tb, r, nu):
    k = 1 - r * r
    c0 = lgam((nu + 2) / 2) + lgam(nu / 2) - 2 * lgam((nu + 1) / 2) - 0.5 * math.log(k)
    s = 0.0
    for i in range(len(ta)):
        a, b = ta[i], tb[i]
        q = (a * a + b * b - 2 * r * a * b) / (nu * k)
        s += c0 - (nu + 2) / 2 * math.log(1 + q) + (nu + 1) / 2 * (math.log(1 + a * a / nu) + math.log(1 + b * b / nu))
    return s


def golden(f, lo, hi, it=80):
    g = (math.sqrt(5) - 1) / 2
    a, b = lo, hi
    c = b - g * (b - a)
    d = a + g * (b - a)
    fc, fd = f(c), f(d)
    for _ in range(it):
        if fc > fd:
            b, d, fd = d, c, fc
            c = b - g * (b - a)
            fc = f(c)
        else:
            a, c, fc = c, d, fd
            d = a + g * (b - a)
            fd = f(d)
    x = (a + b) / 2
    return {"x": x, "f": f(x)}


def fit_copulas(x, y):
    u, v, n = pseudo(x), pseudo(y), len(x)
    out = []
    g = golden(lambda r: ll_gauss(u, v, r), -0.99, 0.99)
    out.append({"name": "Gaussian", "par": {"rho": g["x"]}, "ll": g["f"], "k": 1, "lower": 0, "upper": 0})
    bt = None
    for nu in (2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 50):
        ta, tb = [t_inv(p, nu) for p in u], [t_inv(p, nu) for p in v]
        r = golden(lambda rr: ll_t(ta, tb, rr, nu), -0.99, 0.99, 50)
        if bt is None or r["f"] > bt["f"]:
            bt = {"nu": nu, "rho": r["x"], "f": r["f"]}
    td = 2 * t_cdf(-math.sqrt((bt["nu"] + 1) * (1 - bt["rho"]) / (1 + bt["rho"])), bt["nu"] + 1)
    out.append({"name": "Student t", "par": {"rho": bt["rho"], "nu": bt["nu"]}, "ll": bt["f"], "k": 2, "lower": td, "upper": td})
    c = golden(lambda th: ll_clayton(u, v, th), 1e-3, 30)
    out.append({"name": "Clayton", "par": {"theta": c["x"]}, "ll": c["f"], "k": 1, "lower": 2 ** (-1 / c["x"]), "upper": 0})
    gb = golden(lambda th: ll_gumbel(u, v, th), 1, 30)
    out.append({"name": "Gumbel", "par": {"theta": gb["x"]}, "ll": gb["f"], "k": 1, "lower": 0, "upper": 2 - 2 ** (1 / gb["x"])})
    for o in out:
        o["aic"] = 2 * o["k"] - 2 * o["ll"]
        o["bic"] = math.log(n) * o["k"] - 2 * o["ll"]
    return sorted(out, key=lambda o: o["aic"])


def avg_corr(R, idx=None):
    k = len(R)
    rows = idx if idx is not None else list(range(len(R[0])))
    s = 0.0
    m = 0
    cols = [[r[t] for t in rows] for r in R]
    for i in range(k):
        for j in range(i + 1, k):
            mi, mj = _mean(cols[i]), _mean(cols[j])
            a = b = c = 0.0
            for t in range(len(rows)):
                p, q = cols[i][t] - mi, cols[j][t] - mj
                a += p * q
                b += p * p
                c += q * q
            s += a / math.sqrt(b * c)
            m += 1
    return s / m


def corr_stability(R, w, frac):
    n = len(R[0])
    roll, at = [], []
    for e in range(w, n + 1, 5):
        roll.append(avg_corr(R, [e - w + j for j in range(w)]))
        at.append(e)
    bk = []
    for t in range(n):
        s = 0.0
        for r in R:
            s += r[t]
        bk.append(s / len(R))
    order = sorted(range(n), key=lambda t: bk[t])
    m = max(5, _round(frac * n))
    return {"all": avg_corr(R), "worst": avg_corr(R, order[:m]), "rest": avg_corr(R, order[m:]), "roll": roll, "at": at, "m": m}


# ---------- episodes and Monte Carlo VaR convergence ----------
def episodes(r, h, k):
    cum = [1.0]
    for x in r:
        cum.append(cum[-1] * (1 + x))
    w = []
    for s in range(len(cum) - h):
        w.append({"start": s, "end": s + h - 1, "ret": cum[s + h] / cum[s] - 1})
    w.sort(key=lambda c: c["ret"])
    out = []
    for c in w:
        if len(out) >= k:
            break
        if all(c["start"] > o["end"] or c["end"] < o["start"] for o in out):
            out.append(c)
    return out


def mc_var_runs(mu, sd, p, N, reps, seed):
    g = Rng(seed)
    res = []
    for _ in range(reps):
        l = sorted([-(mu + sd * g.n()) for _i in range(N)])
        res.append(l[min(N - 1, math.ceil(N * p) - 1)])
    return res


# ---------- option book, margin calls, liquidity ladder ----------
def leg_value(l, S, sg, r):
    if l["T"] <= 1e-9:
        return max(S - l["K"] if l["call"] else l["K"] - S, 0)
    return bs(S, l["K"], l["T"], r, sg, l["call"])


def book_value(legs, S, sg, r=0):
    s = 0.0
    for l in legs:
        s += l["qty"] * leg_value(l, S, sg, r)
    return s


def book_greeks(legs, S, sg, r=0):
    h, hv = S * 1e-4, 1e-4
    v0, up, dn = book_value(legs, S, sg, r), book_value(legs, S + h, sg, r), book_value(legs, S - h, sg, r)
    dt = 1 / 365
    aged = [{**l, "T": max(l["T"] - dt, 0)} for l in legs]
    return {"value": v0, "delta": (up - dn) / (2 * h), "gamma": (up - 2 * v0 + dn) / (h * h),
            "vega": (book_value(legs, S, sg + hv, r) - book_value(legs, S, sg - hv, r)) / (2 * hv), "theta": (book_value(aged, S, sg, r) - v0) / dt}


def book_grid(legs, S, sg, dS, dV, r=0):
    v0 = book_value(legs, S, sg, r)
    return [[book_value(legs, S * (1 + a), max(sg + b, 0.01), r) - v0 for b in dV] for a in dS]


def margin_calls(lr, h, lev, maint):
    hit = calls = n = 0
    cash = worst = 0.0
    for s in range(len(lr) - h + 1):
        pos, loan, c, k = float(lev), lev - 1, 0.0, 0
        for t in range(h):
            pos *= _exp(lr[s + t])
            eq = pos - loan
            if eq / pos < maint:
                need = pos / lev - eq
                if need > 0:
                    loan -= need
                    c += need
                    k += 1
        n += 1
        if k > 0:
            hit += 1
        calls += k
        cash += c
        worst = max(worst, c)
    return {"pHit": hit / n, "avgCalls": calls / n, "avgCash": cash / n, "worstCash": worst, "n": n}


def buffer_ladder(outflows, buffer):
    c = 0.0
    gap = []
    for o in outflows:
        c += o
        gap.append(buffer - c)
    i = next((k for k, g in enumerate(gap) if g < 0), -1)
    return {"gap": gap, "breach": i}


# ---------- FRTB default risk charge ----------
DRC_RW = {"AAA": 0.005, "AA": 0.02, "A": 0.03, "BBB": 0.06, "BB": 0.15, "B": 0.30, "CCC": 0.50, "NR": 0.15, "DEF": 1}


def drc(pos):
    by = {}
    for p in pos:
        b = by.setdefault(p["bucket"], {})
        o = b.setdefault(p["id"], {"rating": p["rating"], "jtd": 0})
        o["jtd"] += p["jtd"]
    res = []
    for bucket, obl in by.items():
        L = S = wl = ws = 0.0
        for o in obl.values():
            w = DRC_RW[o["rating"]]
            if o["jtd"] > 0:
                L += o["jtd"]
                wl += o["jtd"] * w
            else:
                S -= o["jtd"]
                ws -= o["jtd"] * w
        hbr = L / (L + S) if L + S > 0 else 0
        res.append({"bucket": bucket, "netLong": L, "netShort": S, "hbr": hbr, "charge": max(wl - hbr * ws, 0)})
    return {"buckets": res, "total": _sum([b["charge"] for b in res])}


# ---------- model tiering ----------
MODEL_W = {"materiality": 0.4, "complexity": 0.2, "uncertainty": 0.2, "reliance": 0.2}


def model_tier(s):
    score = 0.0
    for k in MODEL_W:
        score += MODEL_W[k] * s[k]
    tier = 1 if score >= 3.6 - 1e-9 else 2 if score >= 2.6 - 1e-9 else 3
    return {"score": score, "tier": tier, "months": {1: 12, 2: 24, 3: 36}[tier]}


def findings_rating(f):
    pts = 5 * f["high"] + 2 * f["medium"] + 0.5 * f["low"]
    return {"pts": pts, "rating": "unsatisfactory" if f["high"] >= 2 or pts >= 12 else "needs improvement" if f["high"] >= 1 or pts >= 4 else "satisfactory"}


# ---------- filtered historical simulation ----------
def ewma_filter(r, lam=0.94):
    v = _sum([x * x for x in r[:30]]) / 30
    sig, z = [], []
    for t in range(len(r)):
        sig.append(math.sqrt(v))
        z.append(r[t] / math.sqrt(v))
        v = lam * v + (1 - lam) * r[t] * r[t]
    return {"sig": sig, "z": z, "next": math.sqrt(v)}


def fhs_paths(z, sig0, h, N, seed, lam=0.94):
    R = Rng(seed)
    n = len(z)
    out = [0.0] * N
    for i in range(N):
        v = sig0 * sig0
        c = 0.0
        for _ in range(h):
            e = z[math.floor(R.u() * n)] * math.sqrt(v)
            c += e
            v = lam * v + (1 - lam) * e * e
        out[i] = -c
    return sorted(out)


def qtile(s, p):
    return s[min(len(s) - 1, math.ceil(len(s) * p) - 1)]


def es_sorted(s, p):
    k = max(1, math.ceil(len(s) * (1 - p)))
    return _sum(s[-k:]) / k


# ---------- key-rate DV01 and BCBS IRRBB shocks ----------
def interp(ys, rs, t):
    n = len(ys) - 1
    if t <= ys[0]:
        return rs[0]
    if t >= ys[n]:
        return rs[n]
    i = 1
    while ys[i] < t:
        i += 1
    return rs[i - 1] + (rs[i] - rs[i - 1]) * (t - ys[i - 1]) / (ys[i] - ys[i - 1])


def bond_flows(c, T):
    n = _round(T * 2)
    return [{"t": (k + 1) / 2, "amount": c / 2 + (1 if k + 1 == n else 0)} for k in range(n)]


def book_pv(book, ys, zs):
    s = 0.0
    for b in book:
        a = 0.0
        for f in b["flows"]:
            a += f["amount"] * _exp(-interp(ys, zs, f["t"]) * f["t"])
        s += b["notional"] * a
    return s


def key_rate_dv01(book, ys, zs):
    p0 = book_pv(book, ys, zs)
    kr = [book_pv(book, ys, [z + 1e-4 if j == i else z for j, z in enumerate(zs)]) - p0 for i in range(len(ys))]
    return {"kr": kr, "total": _sum(kr), "parallel": book_pv(book, ys, [z + 1e-4 for z in zs]) - p0, "pv": p0}


def bcbs_shock(name, t, R):
    p, s, l = R["par"] / 1e4, R["short"] / 1e4, R["long"] / 1e4
    es = _exp(-t / 4)
    el = 1 - es
    if name == "parallel up":
        return p
    if name == "parallel down":
        return -p
    if name == "short up":
        return s * es
    if name == "short down":
        return -s * es
    if name == "steepener":
        return -0.65 * s * es + 0.9 * l * el
    if name == "flattener":
        return 0.8 * s * es - 0.6 * l * el
    raise ValueError("unknown scenario " + name)


SCEN = ["parallel up", "parallel down", "steepener", "flattener", "short up", "short down"]


def _floor(t):
    return min(-0.01 + 0.0005 * t, 0)


def bcbs_scenarios(book, ys, zs, R):
    p0 = book_pv(book, ys, zs)
    return [{"name": n, "pnl": book_pv(book, ys, [max(z + bcbs_shock(n, ys[i], R), _floor(ys[i])) for i, z in enumerate(zs)]) - p0} for n in SCEN]


BCBS = {"usd": {"par": 200, "short": 300, "long": 150}, "eur": {"par": 200, "short": 250, "long": 100}}
