"""Risk Hub market-risk engine in Python: a line-for-line port of risk.js.
Convention: a return is a plain number (-0.02 = -2%); a VaR or ES is a POSITIVE loss (0.03 = 3%).
Cross-checked against the JavaScript on fixed inputs by tests/test_risk.py."""
import math

M32 = 0xFFFFFFFF
inf = math.inf


# ---------- distributions ----------
def norm_cdf(x):                                   # Abramowitz-Stegun 26.2.17, absolute error < 7.5e-8
    t = 1 / (1 + 0.2316419 * abs(x))
    d = 0.3989422804014327 * math.exp(-x * x / 2)
    p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
    return 1 - p if x >= 0 else p


def norm_pdf(x):
    return 0.3989422804014327 * math.exp(-x * x / 2)


_A = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239]
_B = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572]
_C = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
_D = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416]


def _tail(q):
    c, d = _C, _D
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)


def norm_inv(p):                                   # Acklam's rational approximation, relative error < 1.2e-9
    if p <= 0 or p >= 1:
        return -inf if p <= 0 else inf
    lo = 0.02425
    if p < lo:
        return _tail(math.sqrt(-2 * math.log(p)))
    if p > 1 - lo:
        return -_tail(math.sqrt(-2 * math.log(1 - p)))
    a, b = _A, _B
    q = p - 0.5
    r = q * q
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)


def chi2sf1(x):
    return 2 * (1 - norm_cdf(math.sqrt(max(x, 0))))      # P(chi2_1 > x)


def chi2sf2(x):
    return math.exp(-max(x, 0) / 2)                      # P(chi2_2 > x)


# ---------- statistics ----------
def mean(a):
    return sum(a) / len(a)


def std(a):
    m = mean(a)
    return math.sqrt(sum((x - m) ** 2 for x in a) / (len(a) - 1))


def moments(a):
    m, s, n = mean(a), std(a), len(a)
    sp = math.sqrt(sum((x - m) ** 2 for x in a) / n)      # skewness and kurtosis use the population std (textbook definition)
    m3 = m4 = 0.0
    for x in a:
        z = (x - m) / sp
        m3 += z ** 3
        m4 += z ** 4
    return {"mean": m, "std": s, "skew": m3 / n, "exkurt": m4 / n - 3}


# ---------- VaR / ES on a window of returns (losses are positive) ----------
def historical(window, conf):
    s = sorted(window)
    k = max(1, math.ceil(len(s) * (1 - conf) - 1e-9))     # the 1e-9 guards against float noise: 500 * (1 - 0.99) is 5.000000000000004
    return {"var": -s[k - 1], "es": -mean(s[:k])}


def normal(window, conf):
    mo = moments(window)
    z = norm_inv(1 - conf)
    return {"var": -(mo["mean"] + mo["std"] * z), "es": -(mo["mean"] - mo["std"] * norm_pdf(z) / (1 - conf))}


def cornish_fisher(window, conf):
    mo = moments(window)
    m, s, N = mo["mean"], mo["std"], 60
    z_lo = min(-4, norm_inv((1 - conf) / (2 * N)))

    def slope(z, sk, ek):
        return 1 + z * sk / 3 + (z * z - 1) * ek / 8 - (6 * z * z - 5) * sk * sk / 36

    def ok(sk, ek):                                    # the expansion is a valid quantile function only while it increases with z
        return all(slope(z_lo * (1 - i / 40), sk, ek) > 0.05 for i in range(41))

    t = 1.0
    while t > 0 and not ok(mo["skew"] * t, mo["exkurt"] * t):
        t = max(0, t - 0.05)
    skew, exkurt = mo["skew"] * t, mo["exkurt"] * t

    def q(alpha):
        z = norm_inv(alpha)
        return m + s * (z + (z * z - 1) * skew / 6 + (z ** 3 - 3 * z) * exkurt / 24 - (2 * z ** 3 - 5 * z) * skew * skew / 36)

    es = sum(q((1 - conf) * (i + 0.5) / N) for i in range(N))   # ES = average of the quantile over the tail (midpoint rule)
    return {"var": -q(1 - conf), "es": -es / N, "damp": t}


def ewma(window, conf, lam=0.94):                     # RiskMetrics: exponentially weighted variance, zero mean
    v = sum(x * x for x in window[:30]) / 30
    for x in window:
        v = lam * v + (1 - lam) * x * x
    z, s = norm_inv(1 - conf), math.sqrt(v)
    return {"var": -s * z, "es": s * norm_pdf(z) / (1 - conf)}


# ---------- volatility models: parameters re-fitted on every window by a coarse grid search of the Gaussian likelihood ----------
LAMBDAS = [0.90, 0.92, 0.94, 0.95, 0.96, 0.97, 0.98, 0.99]
GARCH_GRID = [(a, b) for a in [0.02, 0.04, 0.06, 0.08, 0.11, 0.15] for b in [0.78, 0.84, 0.88, 0.91, 0.93, 0.95, 0.97] if a + b < 0.999]


def vol_path(window, omega, a, b):                    # sigma^2 recursion: log-likelihood, one-step-ahead variance, standardised residuals
    v0 = sum(x * x for x in window) / len(window)
    v, ll, z = v0, 0.0, []
    for x in window:
        ll -= 0.5 * (math.log(v) + x * x / v)
        z.append(x / math.sqrt(v))
        v = omega + a * x * x + b * v
    return {"ll": ll, "next": v, "z": z, "v0": v0}


def garch_fit(window):                                # GARCH(1,1) with variance targeting: omega = (1 - a - b) * sample variance
    v0 = sum(x * x for x in window) / len(window)
    best = None
    for a, b in GARCH_GRID:
        f = vol_path(window, v0 * (1 - a - b), a, b)
        if best is None or f["ll"] > best["ll"]:
            best = {**f, "a": a, "b": b}
    return best


def ewma_fit(window):                                 # EWMA with lambda estimated by likelihood instead of fixed at 0.94
    best = None
    for lam in LAMBDAS:
        f = vol_path(window, 0, 1 - lam, lam)
        if best is None or f["ll"] > best["ll"]:
            best = {**f, "lambda": lam}
    return best


def gauss_tail(s, conf):
    z = norm_inv(1 - conf)
    return {"var": -s * z, "es": s * norm_pdf(z) / (1 - conf)}


def garch(window, conf):
    f = garch_fit(window)
    return {**gauss_tail(math.sqrt(f["next"]), conf), "a": f["a"], "b": f["b"]}


def ewma_mle(window, conf):
    f = ewma_fit(window)
    return {**gauss_tail(math.sqrt(f["next"]), conf), "lambda": f["lambda"]}


def fhs(window, conf):                                # filtered historical simulation: GARCH volatility x empirical quantile of the residuals
    f = garch_fit(window)
    r, s = historical(f["z"], conf), math.sqrt(f["next"])
    return {"var": r["var"] * s, "es": r["es"] * s}


def age_weighted(window, conf, lam=0.98):             # Boudoukh-Richardson-Whitelaw: weight of age i proportional to lam^i (newest = age 0)
    n, alpha, tot = len(window), 1 - conf, 0.0
    o = []
    for i, x in enumerate(window):
        w = lam ** (n - 1 - i)
        tot += w
        o.append((x, w))
    o.sort(key=lambda p: p[0])
    cum = num = 0.0
    v = None
    for x, w0 in o:
        w = min(w0 / tot, alpha - cum)
        if w <= 1e-15:
            break
        if v is None and cum + w0 / tot >= alpha - 1e-12:
            v = -x
        cum += w
        num += w * x
    return {"var": v, "es": -num / cum}


def vol_weighted(window, conf):                       # Hull-White: past returns rescaled by today's EWMA vol forecast / that of their own day
    f = vol_path(window, 0, 0.06, 0.94)
    s = math.sqrt(f["next"])
    return historical([z * s for z in f["z"]], conf)


METHODS = {"historical": historical, "normal": normal, "cornishFisher": cornish_fisher, "ewma": ewma, "ewmaMle": ewma_mle,
           "garch": garch, "fhs": fhs, "ageWeighted": age_weighted, "volWeighted": vol_weighted}


def rolling_backtest(returns, method, conf, W):
    fn, out = METHODS[method], {"t": [], "var": [], "es": [], "hit": []}
    for t in range(W, len(returns)):
        r = fn(returns[t - W:t], conf)                # the VaR of day t only uses the past
        out["t"].append(t); out["var"].append(r["var"]); out["es"].append(r["es"]); out["hit"].append(1 if returns[t] < -r["var"] else 0)
    return out


# ---------- simulated data (same generator as the JavaScript, bit for bit) ----------
class Mulberry32:
    def __init__(self, seed):
        self.a = seed & M32

    def __call__(self):
        self.a = (self.a + 0x6D2B79F5) & M32
        a = self.a
        t = ((a ^ (a >> 15)) * (1 | a)) & M32
        t = ((t + (((t ^ (t >> 7)) * (61 | t)) & M32)) & M32) ^ t
        return ((t ^ (t >> 14)) & M32) / 4294967296


def simulate(n, seed=20261023):                       # GARCH(1,1) with Student-t innovations (5 d.o.f.), unit variance
    rnd = Mulberry32(seed)

    def gauss():
        return math.sqrt(-2 * math.log(1 - rnd())) * math.cos(2 * math.pi * rnd())

    nu = 5

    def tdraw():
        c = 0.0
        for _ in range(nu):
            g = gauss()
            c += g * g
        return gauss() / math.sqrt(c / nu) * math.sqrt((nu - 2) / nu)

    omega, alpha, beta, out = 2e-6, 0.09, 0.90, []
    v = omega / (1 - alpha - beta)
    for _ in range(n):
        r = math.sqrt(v) * tdraw()
        out.append(r)
        v = omega + alpha * r * r + beta * v
    return out


# ---------- coverage tests ----------
def _xlogy(x, y):
    return 0 if x == 0 else x * math.log(y)


def kupiec(N, x, p):                                  # proportion of failures (POF)
    ph = x / N
    lr = -2 * (_xlogy(N - x, 1 - p) + _xlogy(x, p) - _xlogy(N - x, 1 - ph) - _xlogy(x, ph))
    return {"lr": max(lr, 0), "p": chi2sf1(lr)}


def christoffersen(hits, p):                          # independence (LR_ind) and conditional coverage (LR_cc)
    n00 = n01 = n10 = n11 = 0
    for a, b in zip(hits, hits[1:]):
        if a:
            n11, n10 = (n11 + 1, n10) if b else (n11, n10 + 1)
        else:
            n01, n00 = (n01 + 1, n00) if b else (n01, n00 + 1)
    x, N = sum(hits), len(hits)
    pi01, pi11 = n01 / max(1, n00 + n01), n11 / max(1, n10 + n11)
    pi = (n01 + n11) / max(1, n00 + n01 + n10 + n11)
    ll1 = _xlogy(n00 + n10, 1 - pi) + _xlogy(n01 + n11, pi)
    ll2 = _xlogy(n00, 1 - pi01) + _xlogy(n01, pi01) + _xlogy(n10, 1 - pi11) + _xlogy(n11, pi11)
    ind = max(-2 * (ll1 - ll2), 0)
    cc = kupiec(N, x, p)["lr"] + ind
    return {"ind": ind, "pInd": chi2sf1(ind), "cc": cc, "pCc": chi2sf2(cc), "n": {"n00": n00, "n01": n01, "n10": n10, "n11": n11}}


def binom_cdf(N, p, x):                               # P(X <= x), log-space recursion: no underflow when N(1-p) is large
    lp = N * math.log1p(-p)
    cdf = math.exp(lp)
    for k in range(x):
        lp += math.log((N - k) / (k + 1) * p / (1 - p))
        cdf += math.exp(lp)
    return min(1, cdf)


def basel_zone(N, x, p):                              # Basel "traffic light": thresholds at 95% and 99.99% of the binomial law
    c = binom_cdf(N, p, x)
    return "green" if c < 0.95 else "yellow" if c < 0.9999 else "red"
