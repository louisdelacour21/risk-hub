"""Quant maths of the lab (tails, simulation, jumps, Heston, SVI/SABR, trees, curves, portfolios, credit): a line-for-line port of quant.js.
Returns are simple, losses positive. Closures of the JavaScript (evt cdf, svi vol, sabr vol, ns curve) become plain functions of the fitted parameters.
Tested against the JavaScript by tests/test_quant.py."""
import cmath
import math

from risk import M32, norm_cdf, norm_inv, norm_pdf, mean, std, historical, binom_cdf
from options import bs

nan, inf = math.nan, math.inf


def _exp(x):
    try:
        return math.exp(x)
    except OverflowError:
        return inf


def _pow0(base, e):                                   # JS Math.pow for a base that may be 0
    return (inf if e < 0 else 0.0) if base == 0 else base ** e


# ---------- random numbers and optimiser ----------
class Rng:                                            # mulberry32 + Box-Muller (polar form), same stream as rng() in quant.js
    def __init__(self, seed=20261023):
        self.a = seed & M32
        self.spare = None

    def u(self):
        self.a = (self.a + 0x6D2B79F5) & M32
        t = self.a
        t = ((t ^ (t >> 15)) * (t | 1)) & M32
        t ^= (t + (((t ^ (t >> 7)) * (t | 61)) & M32)) & M32
        return ((t ^ (t >> 14)) & M32) / 4294967296

    def n(self):
        if self.spare is not None:
            s, self.spare = self.spare, None
            return s
        while True:
            x, y = 2 * self.u() - 1, 2 * self.u() - 1
            r = x * x + y * y
            if not (r >= 1 or r == 0):
                break
        m = math.sqrt(-2 * math.log(r) / r)
        self.spare = y * m
        return x * m


def nelder_mead(f, x0, step=0.2, iters=600):
    n = len(x0)
    sim = [list(x0)]
    for i in range(n):
        p = list(x0)
        p[i] += step * abs(p[i]) if abs(p[i]) > 1e-9 else step * 0.1
        sim.append(p)
    fv = [f(p) for p in sim]
    for _ in range(iters):
        idx = sorted(range(n + 1), key=lambda i: fv[i])
        sim, fv = [sim[i] for i in idx], [fv[i] for i in idx]
        if abs(fv[n] - fv[0]) < 1e-14 * (1 + abs(fv[0])):
            break
        c = [sum(p[j] for p in sim[:n]) / n for j in range(n)]

        def at(t):
            return [v + t * (sim[n][j] - v) for j, v in enumerate(c)]
        xr = at(-1)
        fr = f(xr)
        if fr < fv[0]:
            xe = at(-2)
            fe = f(xe)
            if fe < fr:
                sim[n], fv[n] = xe, fe
            else:
                sim[n], fv[n] = xr, fr
        elif fr < fv[n - 1]:
            sim[n], fv[n] = xr, fr
        else:
            xc = at(-0.5 if fr < fv[n] else 0.5)
            fc = f(xc)
            if fc < min(fr, fv[n]):
                sim[n], fv[n] = xc, fc
            else:
                for i in range(1, n + 1):
                    sim[i] = [sim[0][j] + 0.5 * (v - sim[0][j]) for j, v in enumerate(sim[i])]
                    fv[i] = f(sim[i])
    b = fv.index(min(fv))
    return {"x": sim[b], "f": fv[b]}


def quantile(a, p):
    s = sorted(a)
    i = (len(s) - 1) * p
    lo = math.floor(i)
    return s[lo] + (s[min(lo + 1, len(s) - 1)] - s[lo]) * (i - lo)


# ---------- tails: GPD / POT, Hill, mean excess ----------
def gpd_fit(excess):                                  # maximum likelihood on the exceedances over a threshold
    m = mean(excess)

    def nll(x):
        xi, lb = x
        b = _exp(lb)
        if not (b > 0) or xi < -0.5 or xi > 1.5:
            return 1e12
        s = 0.0
        for y in excess:
            z = 1 + xi * y / b
            if z <= 0:
                return 1e12
            s += y / b if abs(xi) < 1e-9 else (1 + 1 / xi) * math.log(z)
        return len(excess) * lb + s
    best = None
    for x0 in ([0.1, math.log(m)], [0.3, math.log(m * 0.7)], [-0.1, math.log(m * 1.2)]):
        r = nelder_mead(nll, x0, 0.3, 500)
        if best is None or r["f"] < best["f"]:
            best = r
    return {"xi": best["x"][0], "beta": math.exp(best["x"][1]), "nll": best["f"]}


def evt_tail(losses, uq, conf):                       # peaks over threshold: threshold = quantile uq of the losses
    n, u = len(losses), quantile(losses, uq)
    ex = [x - u for x in losses if x > u]
    nu = len(ex)
    if nu < 15:
        return None
    g = gpd_fit(ex)
    xi, beta = g["xi"], g["beta"]
    q = (n / nu) * (1 - conf)
    v = u - beta * math.log(q) if abs(xi) < 1e-9 else u + beta / xi * (q ** -xi - 1)
    es = v / (1 - xi) + (beta - xi * u) / (1 - xi) if xi < 1 else nan
    return {"u": u, "Nu": nu, "xi": xi, "beta": beta, "var": v, "es": es}


def evt_cdf(x, u, xi, beta, nu, n):                   # the cdf closure of evtTail
    return 1 - (nu / n) * _pow0(max(1 + xi * (x - u) / beta, 0), -1 / xi)


def hill(losses, kmax):                               # Hill estimator of the tail index alpha for k = 5..kmax
    s = sorted((x for x in losses if x > 0), reverse=True)
    out, acc, k = [], 0.0, 1
    while k <= kmax and k < len(s):
        acc += math.log(s[k - 1])
        if k >= 5:
            out.append({"k": k, "alpha": 1 / (acc / k - math.log(s[k]))})
        k += 1
    return out


def mean_excess(losses, n=40):
    s, out = sorted(losses), []
    for j in range(n):
        u = quantile(s, 0.8 + 0.18 * j / (n - 1))
        ex = [x for x in s if x > u]
        if len(ex) >= 10:
            out.append({"u": u, "e": mean(ex) - u})
    return out


def qq_points(r):
    s, m, sd = sorted(r), mean(r), std(r)
    n = len(s)
    return [{"t": norm_inv((i + 0.5) / n), "z": (x - m) / sd} for i, x in enumerate(s)]


def _lgamma_lanczos(z):
    c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
    y, t = z, z + 5.5
    t -= (z + 0.5) * math.log(t)
    s = 1.000000000190015
    for k in c:
        y += 1
        s += k / y
    return -t + math.log(2.5066282746310005 * s / z)


def t_pdf(x, v):
    return math.exp(_lgamma_lanczos((v + 1) / 2) - _lgamma_lanczos(v / 2)) / math.sqrt(v * math.pi) * (1 + x * x / v) ** (-(v + 1) / 2)


# ---------- confidence intervals ----------
def var_ci(r, conf, alpha=0.05):                      # order statistics (distribution-free) on losses
    L, n = sorted(-x for x in r), len(r)
    lo, hi = 1, n
    for l in range(1, n + 1):
        if binom_cdf(n, conf, l - 1) <= alpha / 2:
            lo = l
        else:
            break
    for u in range(1, n + 1):
        if binom_cdf(n, conf, u - 1) >= 1 - alpha / 2:
            hi = u
            break
    return {"lo": L[lo - 1], "hi": L[hi - 1], "ranks": [lo, hi]}


def bootstrap_var(r, conf, B=600, block=1, seed=7):   # block = 1: iid; block > 1: stationary bootstrap (Politis-Romano)
    R, n, v, e = Rng(seed), len(r), [], []
    for _ in range(B):
        s = [0.0] * n
        i = math.floor(R.u() * n)
        for t in range(n):
            s[t] = r[i]
            i = (i + 1) % n if block > 1 and R.u() >= 1 / block else math.floor(R.u() * n)
        h = historical(s, conf)
        v.append(h["var"]); e.append(h["es"])
    return {"v": v, "e": e, "vCI": [quantile(v, 0.025), quantile(v, 0.975)], "eCI": [quantile(e, 0.025), quantile(e, 0.975)], "eSE": std(e), "vSE": std(v)}


# ---------- correlation, vol cone, performance ----------
def ewma_corr(x, y, lam=0.94):
    sxx, syy, sxy = x[0] * x[0], y[0] * y[0], x[0] * y[0]
    out = []
    for i in range(1, len(x)):
        sxx = lam * sxx + (1 - lam) * x[i] * x[i]
        syy = lam * syy + (1 - lam) * y[i] * y[i]
        sxy = lam * sxy + (1 - lam) * x[i] * y[i]
        out.append(sxy / math.sqrt(sxx * syy))
    return out


def corr(x, y):
    mx, my = mean(x), mean(y)
    a = b = c = 0.0
    for i in range(len(x)):
        a += (x[i] - mx) * (y[i] - my); b += (x[i] - mx) ** 2; c += (y[i] - my) ** 2
    return a / math.sqrt(b * c)


def vol_cone(r, ppy=252, windows=(5, 10, 21, 42, 63, 126, 252)):
    out = []
    for w in windows:
        if not len(r) > w * 2:
            continue
        v = [std(r[i - w:i]) * math.sqrt(ppy) for i in range(w, len(r) + 1)]
        out.append({"w": w, "now": v[-1], "min": min(v), "p25": quantile(v, 0.25), "med": quantile(v, 0.5), "p75": quantile(v, 0.75), "max": max(v)})
    return out


def regress(y, x):
    mx, my = mean(x), mean(y)
    sxy = sxx = syy = 0.0
    for i in range(len(x)):
        sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2
    beta = sxy / sxx
    return {"beta": beta, "alpha": my - beta * mx, "r2": sxy * sxy / (sxx * syy)}


def _div(a, b):                                       # JS division: x/0 is +-Infinity or NaN, never an error
    return a / b if b else (nan if a == 0 or a != a else math.copysign(inf, a))


def ratios(r, bench=None, ppy=252, rf=0):
    n, rfd = len(r), rf / ppy
    ex = [x - rfd for x in r]
    mu, sd = mean(ex) * ppy, std(r) * math.sqrt(ppy)
    dd = math.sqrt(sum(min(x, 0) ** 2 for x in ex) / n) * math.sqrt(ppy)
    peak = v = 1.0
    mdd = 0.0
    for x in r:
        v *= 1 + x
        peak = max(peak, v)
        mdd = max(mdd, 1 - v / peak)
    cagr = v ** (ppy / n) - 1
    up = sum(x - rfd for x in r if x > rfd)
    dn = sum(rfd - x for x in r if x < rfd)
    o = {"ann": mean(r) * ppy, "cagr": cagr, "vol": sd, "sharpe": _div(mu, sd), "sortino": _div(mu, dd), "calmar": cagr / mdd if mdd > 0 else nan, "mdd": mdd, "omega": up / dn if dn > 0 else nan}
    if bench:
        reg = regress(r, bench)
        diff = [x - bench[i] for i, x in enumerate(r)]
        te = std(diff) * math.sqrt(ppy)
        o.update({"beta": reg["beta"], "alpha": reg["alpha"] * ppy, "r2": reg["r2"], "treynor": mu / reg["beta"] if reg["beta"] else nan, "te": te, "info": (mean(diff) * ppy) / te if te else nan})
    return o


def rolling_beta(y, x, w=126):
    return [regress(y[i - w:i], x[i - w:i])["beta"] for i in range(w, len(y) + 1)]


# ---------- Monte Carlo ----------
def halton(i, base):
    f = r = 0.0
    f = 1.0
    while i > 0:
        f /= base
        r += f * (i % base)
        i = math.floor(i / base)
    return r


def gbm_paths(S0, mu, sigma, T, steps, n, seed=3, antithetic=False):
    R, dt, out = Rng(seed), T / steps, []
    for _ in range(n):
        z = [R.n() for _ in range(steps)]
        for sgn in ((1, -1) if antithetic else (1,)):
            s = S0
            path = [s]
            for t in range(steps):
                s *= _exp((mu - sigma * sigma / 2) * dt + sigma * math.sqrt(dt) * sgn * z[t])
                path.append(s)
            out.append(path)
    return out


def mc_call(S, K, T, v, r, q, N, method, R, shift=0):  # one price estimate: plain | antithetic | halton | control; R is a Rng
    def f(z):
        return max(S * _exp((r - q - v * v / 2) * T + v * math.sqrt(T) * z) - K, 0)
    disc = math.exp(-r * T)
    if method == "plain":
        s = 0.0
        for _ in range(N):
            s += f(R.n())
        return disc * s / N
    if method == "antithetic":
        s = 0.0
        for _ in range(math.ceil(N / 2)):
            z = R.n()
            s += (f(z) + f(-z)) / 2
        return disc * s / (N / 2)
    if method == "halton":
        s = 0.0
        for i in range(1, N + 1):
            s += f(norm_inv(min(max((halton(i, 2) + shift) % 1, 1e-12), 1 - 1e-12)))
        return disc * s / N
    zs = [R.n() for _ in range(N)]
    ys = [f(z) for z in zs]
    xs = [S * _exp((r - q - v * v / 2) * T + v * math.sqrt(T) * z) for z in zs]
    ex = S * math.exp((r - q) * T)
    mx, my = mean(xs), mean(ys)
    c = d = 0.0
    for i in range(N):
        c += (xs[i] - mx) * (ys[i] - my); d += (xs[i] - mx) ** 2
    return disc * (my - (c / d) * (mx - ex))


# ---------- jumps: Merton ----------
def merton_price(S, K, T, v, r, q, lam, muJ, dJ, kind="C"):
    kap = math.exp(muJ + dJ * dJ / 2) - 1
    lp = lam * (1 + kap)
    p, w = 0.0, math.exp(-lp * T)
    for n in range(60):
        if n:
            w *= lp * T / n
        vn = math.sqrt(v * v + n * dJ * dJ / T)
        rn = r - lam * kap + n * math.log(1 + kap) / T
        p += w * bs(S, K, T, vn, rn, q, kind)["price"]
        if w < 1e-14 and n > lp * T:
            break
    return p


def merton_paths(S0, mu, v, lam, muJ, dJ, T, steps, n, seed=5):
    R, dt = Rng(seed), T / steps
    kap = math.exp(muJ + dJ * dJ / 2) - 1
    out, term = [], []

    def pois(m):
        L, k, p = math.exp(-m), 0, 1.0
        while True:
            k += 1
            p *= R.u()
            if not p > L:
                break
        return k - 1
    for i in range(n):
        s = S0
        path = [s]
        for _ in range(steps):
            x = (mu - lam * kap - v * v / 2) * dt + v * math.sqrt(dt) * R.n()
            for _ in range(pois(lam * dt)):
                x += muJ + dJ * R.n()
            s *= _exp(x)
            path.append(s)
        if i < 40:
            out.append(path)
        term.append(math.log(s / S0))
    return {"paths": out, "term": term}


# ---------- Heston ----------
def heston_cf(u, p, S, T, r, q):                       # E[exp(i u ln S_T)] under Heston (Albrecht "little trap" form), u complex
    v0, kappa, theta, xi, rho = p["v0"], p["kappa"], p["theta"], p["xi"], p["rho"]
    iu = 1j * u
    a = kappa - iu * (rho * xi)
    d = cmath.sqrt(a * a + (iu + u * u) * (xi * xi))
    g = (a - d) / (a + d)
    edt = cmath.exp(d * -T)
    den = 1 - g * edt
    lg = cmath.log(den / (1 - g))
    Cc = iu * ((r - q) * T) + ((a - d) * T - lg * 2) * (kappa * theta / (xi * xi))
    D = (a - d) * (1 / (xi * xi)) * ((1 - edt) / den)
    return cmath.exp(Cc + D * v0 + iu * math.log(S))


def heston_call(S, K, T, r, q, p):
    lk = math.log(K)
    phi1 = heston_cf(complex(0, -1), p, S, T, r, q)
    h, U = 0.08, 160
    i1 = i2 = 0.0
    u = h / 2
    while u < U:
        e = complex(math.cos(-u * lk), math.sin(-u * lk))
        f2 = e * heston_cf(complex(u, 0), p, S, T, r, q) / complex(0, u)
        f1 = e * (heston_cf(complex(u, -1), p, S, T, r, q) / phi1) / complex(0, u)
        i1 += f1.real; i2 += f2.real
        u += h
    P1, P2 = 0.5 + h * i1 / math.pi, 0.5 + h * i2 / math.pi
    return max(S * math.exp(-q * T) * P1 - K * math.exp(-r * T) * P2, 0)


def heston_paths(S0, r, q, p, T, steps, n, seed=11):   # Euler with full truncation
    R, dt, out = Rng(seed), T / steps, []
    for _ in range(n):
        s, v = S0, p["v0"]
        ps, vs = [s], [v]
        for _ in range(steps):
            z1 = R.n()
            z2 = p["rho"] * z1 + math.sqrt(1 - p["rho"] * p["rho"]) * R.n()
            vp = max(v, 0)
            s *= _exp((r - q - vp / 2) * dt + math.sqrt(vp * dt) * z1)
            v += p["kappa"] * (p["theta"] - vp) * dt + p["xi"] * math.sqrt(vp * dt) * z2
            ps.append(s); vs.append(max(v, 0))
        out.append({"s": ps, "v": vs})
    return out


# ---------- mean reversion ----------
def ou_sim(x0, kappa, mu, sigma, dt, n, seed=9):
    R, b = Rng(seed), math.exp(-kappa * dt)
    sd = sigma * math.sqrt((1 - b * b) / (2 * kappa))
    x = [x0]
    for i in range(1, n):
        x.append(mu + (x[i - 1] - mu) * b + sd * R.n())
    return x


def ou_fit(x, dt=1):                                   # exact maximum likelihood = AR(1) regression
    reg = regress(x[1:], x[:-1])
    b = reg["beta"]
    if not (0 < b < 1):
        return {"kappa": nan, "mu": nan, "sigma": nan, "half": inf, "b": b}
    kappa = -math.log(b) / dt
    mu = reg["alpha"] / (1 - b)
    res = [v - reg["alpha"] - b * x[i] for i, v in enumerate(x[1:])]
    return {"kappa": kappa, "mu": mu, "sigma": std(res) * math.sqrt(2 * kappa / (1 - b * b)), "half": math.log(2) / kappa, "b": b}


# ---------- options: trees, exotics ----------
def crr(S, K, T, v, r, q, kind, N, american):
    dt = T / N
    u = math.exp(v * math.sqrt(dt))
    d = 1 / u
    p = (math.exp((r - q) * dt) - d) / (u - d)
    disc, sg = math.exp(-r * dt), 1 if kind == "C" else -1
    val = [max(sg * (S * u ** (N - j) * d ** j - K), 0) for j in range(N + 1)]
    for i in range(N - 1, -1, -1):
        for j in range(i + 1):
            x = disc * (p * val[j] + (1 - p) * val[j + 1])
            if american:
                x = max(x, sg * (S * u ** (i - j) * d ** j - K))
            val[j] = x
    return val[0]


def geo_asian(S, K, T, v, r, q, n):                   # discrete geometric average, n equally spaced fixings
    m = math.log(S) + (r - q - v * v / 2) * T * (n + 1) / (2 * n)
    s2 = v * v * T * (n + 1) * (2 * n + 1) / (6 * n * n)
    s = math.sqrt(s2)
    d1 = (m - math.log(K) + s2) / s
    return math.exp(-r * T) * (math.exp(m + s2 / 2) * norm_cdf(d1) - K * norm_cdf(d1 - s))


def asian_mc(S, K, T, v, r, q, n, N, seed=4):         # arithmetic average call: plain vs geometric control variate
    R, dt, disc = Rng(seed), T / n, math.exp(-r * T)
    ar, ge = [], []
    for _ in range(N):
        s, a, l = S, 0.0, 0.0
        for _ in range(n):
            s *= _exp((r - q - v * v / 2) * dt + v * math.sqrt(dt) * R.n())
            a += s; l += math.log(s)
        ar.append(max(a / n - K, 0)); ge.append(max(_exp(l / n) - K, 0))
    mg, ma = mean(ge), mean(ar)
    c = d = 0.0
    for i in range(N):
        c += (ge[i] - mg) * (ar[i] - ma); d += (ge[i] - mg) ** 2
    b = c / d
    exact = geo_asian(S, K, T, v, r, q, n)
    cv = [x - b * (ge[i] - exact / disc) for i, x in enumerate(ar)]
    return {"plain": disc * ma, "plainSE": disc * std(ar) / math.sqrt(N), "cv": disc * mean(cv), "cvSE": disc * std(cv) / math.sqrt(N), "geo": exact}


def down_out_call(S, K, H, T, v, r, q):               # continuous barrier H <= K (Reiner-Rubinstein)
    if S <= H:
        return 0
    sq = v * math.sqrt(T)
    lam = (r - q + v * v / 2) / (v * v)
    y = math.log(H * H / (S * K)) / sq + lam * sq
    di = S * math.exp(-q * T) * (H / S) ** (2 * lam) * norm_cdf(y) - K * math.exp(-r * T) * (H / S) ** (2 * lam - 2) * norm_cdf(y - sq)
    return bs(S, K, T, v, r, q, "C")["price"] - di


def barrier_mc(S, K, H, T, v, r, q, steps, N, seed=6):
    R, dt, s0 = Rng(seed), T / steps, 0.0
    for _ in range(N):
        s, alive = S, True
        for _ in range(steps):
            s *= _exp((r - q - v * v / 2) * dt + v * math.sqrt(dt) * R.n())
            if s <= H:
                alive = False
                break
        if alive:
            s0 += max(s - K, 0)
    return math.exp(-r * T) * s0 / N


def greeks2(S, K, T, v, r, q):
    sq = math.sqrt(T)
    d1 = (math.log(S / K) + (r - q + v * v / 2) * T) / (v * sq)
    d2 = d1 - v * sq
    eq = math.exp(-q * T)
    vega = S * eq * norm_pdf(d1) * sq
    return {"vanna": -eq * norm_pdf(d1) * d2 / v, "volga": vega * d1 * d2 / v, "vega": vega}


# ---------- smile models: SVI and SABR ----------
def _sqrt(x):                                         # JS Math.sqrt: NaN for a negative number
    return math.sqrt(x) if x >= 0 else nan


def _log(x):                                          # JS Math.log: -Infinity at 0, NaN below
    return math.log(x) if x > 0 else (-inf if x == 0 else nan)


def svi_w(k, p):
    return p["a"] + p["b"] * (p["rho"] * (k - p["m"]) + _sqrt((k - p["m"]) ** 2 + p["s"] * p["s"]))


def svi_vol(k, p, T):
    return _sqrt(max(svi_w(k, p), 1e-10) / T)


def svi_fit(pts, T):                                  # pts: [{k: ln(K/F), iv}]
    w = [p["iv"] * p["iv"] * T for p in pts]

    def unpack(x):
        a, lb, tr, m, ls = x
        return {"a": a, "b": _exp(lb), "rho": math.tanh(tr), "m": m, "s": _exp(ls)}

    def loss(x):
        p = unpack(x)
        e = 0.0
        for i, pt in enumerate(pts):
            d = svi_w(pt["k"], p) - w[i]
            e += d * d
        mn = p["a"] + p["b"] * p["s"] * _sqrt(1 - p["rho"] * p["rho"])
        return e + (1e3 * mn * mn if mn < 0 else 0)
    mw, best = min(w), None
    for st in ([mw * 0.5, math.log(0.1), -0.3, 0, math.log(0.1)], [mw * 0.8, math.log(0.3), -0.6, 0.05, math.log(0.2)], [mw * 0.2, math.log(0.05), 0, -0.05, math.log(0.05)]):
        r = nelder_mead(loss, st, 0.3, 1500)
        if best is None or r["f"] < best["f"]:
            best = r
    p = unpack(best["x"])
    return {**p, "rmse": _sqrt(best["f"] / len(pts))}


def sabr_vol(F, K, T, al, be, rho, nu):
    lo, fk = _log(F / K), _pow0(F * K, (1 - be) / 2)
    c1 = (1 - be) ** 2 / 24 * al * al / _pow0(F * K, 1 - be) + rho * be * nu * al / (4 * fk) + (2 - 3 * rho * rho) * nu * nu / 24
    if abs(lo) < 1e-9:
        return al / _pow0(F, 1 - be) * (1 + c1 * T)
    z = nu / al * fk * lo
    x = _log(_div(_sqrt(1 - 2 * rho * z + z * z) + z - rho, 1 - rho))
    return al / (fk * (1 + (1 - be) ** 2 / 24 * lo * lo + (1 - be) ** 4 / 1920 * lo ** 4)) * (1 if abs(x) < 1e-12 else _div(z, x)) * (1 + c1 * T)


def sabr_fit(pts, F, T, be):
    atm = pts[0]
    for p in pts:
        if abs(p["k"]) < abs(atm["k"]):
            atm = p
    al0 = atm["iv"] * F ** (1 - be)

    def unpack(x):
        la, tr, ln = x
        return _exp(la), math.tanh(tr), _exp(ln)

    def loss(x):
        al, rho, nu = unpack(x)
        e = 0.0
        for p in pts:
            d = sabr_vol(F, F * math.exp(p["k"]), T, al, be, rho, nu) - p["iv"]
            e += d * d
        return e if math.isfinite(e) else 1e9
    best = None
    for st in ([math.log(al0), -0.3, math.log(0.8)], [math.log(al0), 0, math.log(0.4)], [math.log(al0), -0.6, math.log(1.5)]):
        r = nelder_mead(loss, st, 0.3, 800)
        if best is None or r["f"] < best["f"]:
            best = r
    al, rho, nu = unpack(best["x"])
    return {"al": al, "rho": rho, "nu": nu, "beta": be, "rmse": math.sqrt(best["f"] / len(pts))}


def density(vol_at, F, T, lo=0.55, hi=1.6, n=120):    # Breeden-Litzenberger: f(K) = d2C/dK2 (rate 0, forward as underlying); vol_at is a callable K -> vol
    h = F * (hi - lo) / n
    ks = [F * lo + i * h for i in range(n + 1)]
    c = [bs(F, K, T, vol_at(K), 0, 0, "C")["price"] for K in ks]
    return {"k": ks[1:n], "f": [(c[i - 1] - 2 * c[i] + c[i + 1]) / (h * h) for i in range(1, n)]}


def density_svi(p, F, T, lo=0.55, hi=1.6, n=120):     # density of a fitted SVI smile (volAt = K -> svi vol of ln(K/F))
    return density(lambda K: svi_vol(_log(K / F), p, T), F, T, lo, hi, n)


def density_sabr(p, F, T, lo=0.55, hi=1.6, n=120):    # density of a fitted SABR smile
    return density(lambda K: sabr_vol(F, K, T, p["al"], p["beta"], p["rho"], p["nu"]), F, T, lo, hi, n)


# ---------- rates: Nelson-Siegel, PCA, bonds ----------
def solve(A, b):                                      # Gaussian elimination with pivoting
    n = len(b)
    M = [list(r) + [b[i]] for i, r in enumerate(A)]
    for i in range(n):
        p = i
        for k in range(i + 1, n):
            if abs(M[k][i]) > abs(M[p][i]):
                p = k
        M[i], M[p] = M[p], M[i]
        for k in range(i + 1, n):
            f = _div(M[k][i], M[i][i])
            for j in range(i, n + 1):
                M[k][j] -= f * M[i][j]
    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        s = M[i][n]
        for j in range(i + 1, n):
            s -= M[i][j] * x[j]
        x[i] = _div(s, M[i][i])
    return x


def ns_basis(t, lam):
    e = _exp(-t / lam)
    a = _div(1 - e, t / lam)
    return [1, a, a - e]


def ns_at(t, fit):
    x = ns_basis(t, fit["lam"])
    return x[0] * fit["b0"] + x[1] * fit["b1"] + x[2] * fit["b2"]


def ns_fit(years, y):
    best, lam = None, 0.3
    while lam <= 8:
        X = [ns_basis(t, lam) for t in years]
        A = [[sum(r[i] * r[j] for r in X) for j in range(3)] for i in range(3)]
        bv = [sum(r[i] * y[k] for k, r in enumerate(X)) for i in range(3)]
        b = solve(A, bv)
        sse = sum((r[0] * b[0] + r[1] * b[1] + r[2] * b[2] - y[k]) ** 2 for k, r in enumerate(X))
        if math.isfinite(sse) and (best is None or sse < best["sse"]):
            best = {"lam": lam, "b0": b[0], "b1": b[1], "b2": b[2], "sse": sse}
        lam *= 1.08
    return {**best, "rmse": math.sqrt(best["sse"] / len(years))}


def eig_sym(A):                                       # Jacobi rotations
    n = len(A)
    a = [list(r) for r in A]
    V = [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
    for _ in range(60):
        off = sum(a[i][j] ** 2 for i in range(n) for j in range(i + 1, n))
        if off < 1e-22:
            break
        for p in range(n):
            for q in range(p + 1, n):
                if abs(a[p][q]) < 1e-30:
                    continue
                th = (a[q][q] - a[p][p]) / (2 * a[p][q])
                t = math.copysign(1, th or 1) / (abs(th) + math.sqrt(th * th + 1))
                c = 1 / math.sqrt(t * t + 1)
                s = t * c
                for k in range(n):
                    kp, kq = a[k][p], a[k][q]
                    a[k][p] = c * kp - s * kq; a[k][q] = s * kp + c * kq
                for k in range(n):
                    pk, qk = a[p][k], a[q][k]
                    a[p][k] = c * pk - s * qk; a[q][k] = s * pk + c * qk
                for k in range(n):
                    kp, kq = V[k][p], V[k][q]
                    V[k][p] = c * kp - s * kq; V[k][q] = s * kp + c * kq
    idx = sorted(range(n), key=lambda i: -a[i][i])
    return {"values": [a[i][i] for i in idx], "vectors": [[r[i] for r in V] for i in idx]}


def curve_pca(changes):                               # changes: rows = days, columns = maturities
    n, m = len(changes), len(changes[0])
    mu = [mean([r[j] for r in changes]) for j in range(m)]
    cov = [[sum((r[i] - mu[i]) * (r[j] - mu[j]) for r in changes) / (n - 1) for j in range(m)] for i in range(m)]
    e = eig_sym(cov)
    tot = sum(e["values"])
    vec = []
    for v in e["vectors"]:
        s = sum(v)
        vec.append([-x for x in v] if s < 0 and abs(s) > 1e-9 else v)
    return {"values": e["values"], "share": [x / tot for x in e["values"]], "vectors": vec, "cov": cov}


def bond_price(face, cpn, y, years, freq):
    n, c = math.floor(years * freq + 0.5), face * cpn / freq
    p = t1 = t2 = 0.0
    for k in range(1, n + 1):
        cf = c + (face if k == n else 0)
        df = _pow0(1 + y / freq, -k)
        p += cf * df; t1 += (k / freq) * cf * df; t2 += (k / freq) * (k / freq + 1 / freq) * cf * df
    mac = t1 / p
    mod = mac / (1 + y / freq)
    return {"price": p, "mac": mac, "mod": mod, "conv": t2 / p / (1 + y / freq) ** 2, "dv01": mod * p / 1e4}


def bond_ytm(price, face, cpn, years, freq):
    a, b = -0.5, 1.0
    for _ in range(200):
        m = (a + b) / 2
        if bond_price(face, cpn, m, years, freq)["price"] > price:
            a = m
        else:
            b = m
    return (a + b) / 2


# ---------- portfolios ----------
def cov_matrix(cols, ppy=252):
    m = [mean(c) for c in cols]
    return [[sum((a[t] - m[i]) * (b[t] - m[j]) for t in range(len(a))) / (len(a) - 1) * ppy for j, b in enumerate(cols)] for i, a in enumerate(cols)]


def pvar(w, S):
    return sum(wi * sum(wj * S[i][j] for j, wj in enumerate(w)) for i, wi in enumerate(w))


def dirichlet(n, R):
    g = [-math.log(R.u() + 1e-12) for _ in range(n)]
    s = sum(g)
    return [x / s for x in g]


def optimise(mu, S, mode, seed=2):                    # long-only: 'minvar' or 'sharpe' by random search + hill climbing
    R, n = Rng(seed), len(mu)

    def score(w):
        if mode == "minvar":
            return -pvar(w, S)
        return _div(sum(x * mu[i] for i, x in enumerate(w)), _sqrt(pvar(w, S)))
    best, top = None, -inf
    for _ in range(4000):
        w = dirichlet(n, R)
        s = score(w)
        if s > top:
            top, best = s, w
    step = 0.1
    while step > 1e-4:
        for _ in range(60):
            w = list(best)
            i, j = math.floor(R.u() * n), math.floor(R.u() * n)
            if i == j:
                continue
            d = min(step * R.u(), w[j])
            w[i] += d; w[j] -= d
            s = score(w)
            if s > top:
                top, best = s, w
        step *= 0.7
    return best


def risk_parity(S, it=400):
    n = len(S)
    w = [1 / n] * n
    for _ in range(it):
        mrc = [sum(x * w[j] for j, x in enumerate(r)) for r in S]
        rc = [x * mrc[i] for i, x in enumerate(w)]
        t = sum(rc) / n
        w = [x * _sqrt(_div(t, rc[i])) for i, x in enumerate(w)]
        s = sum(w)
        w = [x / s for x in w]
    return w


# ---------- credit and valuation ----------
def irb_rho(pd):
    f = (1 - _exp(-50 * pd)) / (1 - math.exp(-50))
    return 0.12 * f + 0.24 * (1 - f)


def irb_k(pd, lgd, rho, conf=0.999):
    return lgd * (norm_cdf((norm_inv(pd) + math.sqrt(rho) * norm_inv(conf)) / math.sqrt(1 - rho)) - pd)


def vasicek_cdf(x, pd, rho):                          # P(loss rate <= x), LGD = 1
    return norm_cdf((math.sqrt(1 - rho) * norm_inv(x) - norm_inv(pd)) / math.sqrt(rho))


def dcf(f0, g1, years, gT, wacc, net=0, shares=1):
    pv, f, rows = 0.0, f0, []
    for t in range(1, years + 1):
        f *= 1 + g1
        d = f / (1 + wacc) ** t
        pv += d
        rows.append({"t": t, "f": f, "d": d})
    tv = _div(f * (1 + gT), wacc - gT)
    pv_tv = tv / (1 + wacc) ** years
    ev = pv + pv_tv
    return {"ev": ev, "pv": pv, "tv": tv, "pvTv": pv_tv, "share": pv_tv / ev, "equity": ev - net, "perShare": (ev - net) / shares, "rows": rows}
