"""Black-Scholes-Merton with continuous dividend yield q: a line-for-line port of options.js.
Time in years, volatility as a decimal. Prices and greeks are for ONE unit of the underlying. Tested by tests/test_quant.py."""
import math

from risk import norm_pdf


def _log(x):                                          # JS Math.log: -Infinity at 0, NaN below
    return math.log(x) if x > 0 else (-math.inf if x == 0 else math.nan)


def norm_cdf_hw(x):                                   # Hart/West double-precision normal CDF (~1e-15): option prices need more than risk.norm_cdf
    a = abs(x)
    if a > 37:
        c = 0.0
    else:
        e = math.exp(-a * a / 2)
        if a < 7.07106781186547:
            b = 3.52624965998911e-02 * a + 0.700383064443688
            for k in (6.37396220353165, 33.912866078383, 112.079291497871, 221.213596169931, 220.206867912376):
                b = b * a + k
            c = e * b
            b = 8.83883476483184e-02 * a + 1.75566716318264
            for k in (16.064177579207, 86.7807322029461, 296.564248779674, 637.333633378831, 793.826512519948, 440.413735824752):
                b = b * a + k
            c /= b
        else:
            b = a + 0.65
            b = a + 4 / b
            b = a + 3 / b
            b = a + 2 / b
            b = a + 1 / b
            c = e / b / 2.506628274631
    return 1 - c if x > 0 else c


def d12(S, K, T, v, r, q):
    s = v * math.sqrt(T)
    d1 = (math.log(S / K) + (r - q + v * v / 2) * T) / s
    return d1, d1 - s


def bs(S, K, T, v, r, q, kind):                       # kind: 'C' or 'P'. Vega per 1.00 of vol, theta per year, rho per 1.00 of rate
    call = kind == "C"
    eq, er = math.exp(-q * T), math.exp(-r * T)
    if T <= 0 or v <= 0:
        intr = max(S - K, 0) if call else max(K - S, 0)
        return {"price": intr, "delta": (1 if S > K else 0) if call else (-1 if S < K else 0), "gamma": 0, "vega": 0, "theta": 0, "rho": 0}
    d1, d2 = d12(S, K, T, v, r, q)
    pdf, sq = norm_pdf(d1), math.sqrt(T)
    N = norm_cdf_hw
    price = S * eq * N(d1) - K * er * N(d2) if call else K * er * N(-d2) - S * eq * N(-d1)
    delta = eq * N(d1) if call else -eq * N(-d1)
    gamma, vega = eq * pdf / (S * v * sq), S * eq * pdf * sq
    if call:
        theta = -S * eq * pdf * v / (2 * sq) - r * K * er * N(d2) + q * S * eq * N(d1)
        rho = K * T * er * N(d2)
    else:
        theta = -S * eq * pdf * v / (2 * sq) + r * K * er * N(-d2) - q * S * eq * N(-d1)
        rho = -K * T * er * N(-d2)
    return {"price": price, "delta": delta, "gamma": gamma, "vega": vega, "theta": theta, "rho": rho}


def implied_vol(price, S, K, T, r, q, kind):          # bisection; None when the price is outside the no-arbitrage bounds
    eq, er = math.exp(-q * T), math.exp(-r * T)
    lo = max(S * eq - K * er, 0) if kind == "C" else max(K * er - S * eq, 0)
    hi = S * eq if kind == "C" else K * er
    if not (price > lo + 1e-12) or not (price < hi - 1e-12) or T <= 0:
        return None
    a, b = 1e-6, 5.0
    if bs(S, K, T, b, r, q, kind)["price"] < price:
        return None
    for _ in range(200):
        m = (a + b) / 2
        if bs(S, K, T, m, r, q, kind)["price"] < price:
            a = m
        else:
            b = m
        if b - a < 1e-12:
            break
    return (a + b) / 2


def iv_at(pts, k):                                    # linear interpolation of implied vol in log-moneyness; pts: [{"k", "iv"}] sorted by k
    if not pts:
        return None
    if k <= pts[0]["k"]:
        return pts[0]["iv"]
    for i in range(1, len(pts)):
        if k <= pts[i]["k"]:
            a, b = pts[i - 1], pts[i]
            w = (_log(k) - _log(a["k"])) / (_log(b["k"]) - _log(a["k"]))
            return a["iv"] + w * (b["iv"] - a["iv"])
    return pts[-1]["iv"]


def option_scenario(S, K, T, v, r, q, kind, dS, dv, dDays):
    b = bs(S, K, T, v, r, q, kind)
    S1, T1, v1 = S * (1 + dS), max(T - dDays / 365, 0), max(v + dv, 1e-4)
    a = bs(S1, K, T1, v1, r, q, kind)
    x = S1 - S
    dg = b["delta"] * x + 0.5 * b["gamma"] * x * x
    return {"base": b["price"], "after": a["price"], "pnl": a["price"] - b["price"], "delta": b["delta"] * x, "deltaGamma": dg, "deltaGammaTheta": dg + b["theta"] * (T - T1)}
