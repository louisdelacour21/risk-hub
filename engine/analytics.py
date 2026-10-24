"""Risk-profile, stress and discounting analytics: a line-for-line port of analytics.js. Simple returns: 0.01 = +1%. Tested by tests/test_analytics.py."""
import datetime
import math

from risk import std, moments, chi2sf2, norm_pdf
from quant import _exp, _div, _log

inf = math.inf
TENOR_YEARS = [0.25, 0.5, 0.75, 1, 2, 3, 5, 7, 10, 15, 20, 30]


def _ms(d):                                           # Date.parse of an ISO date, in milliseconds
    return datetime.datetime.strptime(d[:10], "%Y-%m-%d").replace(tzinfo=datetime.timezone.utc).timestamp() * 1000


def drawdown(returns):                                # "underwater" curve: loss since the previous peak
    peak = v = 1.0
    worst, wi, pi, pk = 0, 0, 0, 0
    dd = []
    for i, r in enumerate(returns):
        v *= 1 + r
        if v > peak:
            peak = v
            pk = i
        d = v / peak - 1
        if d < worst:
            worst, wi, pi = d, i, pk
        dd.append(d)
    return {"series": dd, "max": worst, "trough": wi, "peak": pi}


def worst_windows(returns, k):                        # worst compounded return over k consecutive days
    best = {"ret": inf, "end": -1}
    for end in range(k - 1, len(returns)):
        g = 1.0
        for i in range(end - k + 1, end + 1):
            g *= 1 + returns[i]
        if g - 1 < best["ret"]:
            best = {"ret": g - 1, "end": end}
    return {"ret": best["ret"], "start": best["end"] - k + 1, "end": best["end"]}


def rolling_vol(returns, w, ann=252):                 # None until the window is full
    return [None if i + 1 < w else std(returns[i + 1 - w:i + 1]) * math.sqrt(ann) for i in range(len(returns))]


def jarque_bera(returns):
    m = moments(returns)
    n = len(returns)
    jb = n / 6 * (m["skew"] ** 2 + m["exkurt"] ** 2 / 4)
    return {"jb": jb, "p": chi2sf2(jb)}


def histogram(returns, bins=60):
    m = moments(returns)
    mean, sd = m["mean"], m["std"]
    lo, hi = mean - 6 * sd, mean + 6 * sd
    w = (hi - lo) / bins
    counts = [0] * bins
    out = 0
    for r in returns:
        k = math.floor((r - lo) / w)
        if 0 <= k < bins:
            counts[k] += 1
        else:
            out += 1
    n = len(returns)
    return {"lo": lo, "w": w, "density": [c / n / w for c in counts], "normal": [norm_pdf((lo + (i + 0.5) * w - mean) / sd) / sd for i in range(bins)], "outside": out}


def profile(returns, ann=252):
    m, dd, jb = moments(returns), drawdown(returns), jarque_bera(returns)
    s = sorted(returns)
    beyond = len([r for r in returns if abs(r - m["mean"]) > 2 * m["std"]]) / len(returns)
    return {"n": len(returns), "annVol": m["std"] * math.sqrt(ann), "annRet": m["mean"] * ann, "skew": m["skew"], "exkurt": m["exkurt"], "dd": dd, "jb": jb, "best": s[-1], "worst": s[0], "beyond2": beyond}


def periods_per_year(dates):                          # observations per year, from the calendar span (252 when dates are unknown)
    if not dates or len(dates) < 2:
        return 252
    years = (_ms(dates[-1]) - _ms(dates[0])) / (365.25 * 864e5)
    return math.floor((len(dates) - 1) / years + 0.5) if years > 0 else 252


def shock(value, pct):
    return value * pct


def close_on(asset, date):                            # last close on or before `date`; None when not covered or with a gap of more than 7 days
    d = asset.get("dates")
    if not d or d[0] > date or d[-1] < date:
        return None
    lo, hi = 0, len(d) - 1
    while lo < hi:
        m = (lo + hi + 1) >> 1
        if d[m] <= date:
            lo = m
        else:
            hi = m - 1
    return None if (_ms(date) - _ms(d[lo])) / 864e5 > 7 else asset["close"][lo]


def scenario_return(assets, weights, frm, to):        # buy-and-hold, initial weights normalised to 100%; None if any asset lacks data
    tot = sum(weights)
    parts = []
    for i, a in enumerate(assets):
        c0, c1 = close_on(a, frm), close_on(a, to)
        if c0 is None or c1 is None:
            return None
        w = weights[i] / tot
        ret = c1 / c0 - 1
        parts.append({"id": a.get("id"), "name": a.get("name"), "w": w, "ret": ret, "contrib": w * ret})
    return {"ret": sum(p["contrib"] for p in parts), "parts": parts}


def interp_rate(years, rates, t):                     # linear interpolation of zero rates, flat beyond the ends
    if t <= years[0]:
        return rates[0]
    n = len(years) - 1
    if t >= years[n]:
        return rates[n]
    i = 1
    while years[i] < t:
        i += 1
    return rates[i - 1] + (rates[i] - rates[i - 1]) * (t - years[i - 1]) / (years[i] - years[i - 1])


def present_value(flows, years, rates, shift=0):      # continuous compounding: DF = exp(-r t)
    rows = []
    for f in flows:
        r = interp_rate(years, rates, f["t"]) + shift
        df = _exp(-r * f["t"])
        rows.append({**f, "r": r, "df": df, "pv": f["amount"] * df})
    return {"pv": sum(x["pv"] for x in rows), "rows": rows}


def duration(flows, years, rates):                    # effective duration, central difference with a 1 bp bump
    up = present_value(flows, years, rates, 0.0001)["pv"]
    dn = present_value(flows, years, rates, -0.0001)["pv"]
    mid = present_value(flows, years, rates)["pv"]
    return _div(dn - up, 2 * mid * 0.0001)


def par_to_zero(years, par_pct):                      # par yields (semi-annual, %) -> continuous zero rates by bootstrapping
    par = [x / 100 for x in par_pct]
    df = [0.0]
    T = years[-1]
    annuity = 0.0
    k = 1
    while k * 0.5 <= T + 1e-9:
        c = interp_rate(years, par, k * 0.5) / 2
        d = 1 / (1 + c) if k == 1 else (1 - c * annuity) / (1 + c)
        df.append(d)
        annuity += d
        k += 1
    out = []
    for i, t in enumerate(years):
        j = math.floor(t * 2 + 0.5)
        x = 1 / (1 + par[i] * t) if t <= 0.5 + 1e-9 else (df[j] if j < len(df) else math.nan)
        out.append(_div(-_log(x), t))
    return out
