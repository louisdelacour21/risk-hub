"""Risk, sixth wave (riskx5.js): quantum risk (Shor on ECC, Q-Day timing, Mosca, jump mixture), block bootstrap, tail beta, fairness of a decision, proxy effect, drift (PSI, KS),
explaining a scoring model (permutation importance, Shapley), model risk reserve. A line-for-line port. Tested by tests/test_riskx5.py."""
import math

from risk import norm_cdf as normCdf, norm_inv, norm_pdf, mean, std
from quant import Rng, _exp, _div, _log
from riskx3 import solve, pearson

nan, inf = math.nan, math.inf


def _round(x):
    return math.floor(x + 0.5)


def _get(o, k, d):                                    # JS  o.k ?? d
    return o[k] if o.get(k) is not None else d


def _or(o, k, d):                                     # JS  o.k || d
    v = o.get(k)
    return d if (v is None or v == 0 or v != v) else v


# ---------- quantum ----------
def shor_ecc(o):
    n = _or(o, "bits", 256)
    p = o["pPhys"]
    pth = _or(o, "pThresh", 0.01)
    lg = math.log2(n)
    logical = math.ceil(9 * n + 2 * lg + 10)
    toffoli = (448 * n ** 3 * lg + 4090 * n ** 3) / _or(o, "gain", 1)
    budget = _or(o, "failBudget", 0.1)
    if not (p < pth):
        return {"logical": logical, "toffoli": toffoli, "d": inf, "perLogical": inf, "physical": inf, "seconds": inf}
    d = 3
    while d < 301 and 0.1 * (p / pth) ** ((d + 1) / 2) * logical * toffoli > budget:
        d += 2
    perLogical = 2 * d * d
    cycle = _or(o, "cycleUs", 1) * 1e-6
    return {"logical": logical, "toffoli": toffoli, "d": d, "perLogical": perLogical, "physical": logical * perLogical, "pL": 0.1 * (p / pth) ** ((d + 1) / 2), "seconds": toffoli * d * cycle}


def qday_year(need, N0, t0, g):
    return t0 + max(0, _div(_log(need / N0), _log(g))) if (g > 1 and N0 > 0) else inf


def qday_prob(h, median, sigma):
    return 0 if h <= 0 else normCdf(_div(_log(h) - _log(median), sigma))


def mosca(x, y, median, sigma):
    return {"p": qday_prob(x + y, median, sigma), "slack": median - (x + y)}


def weighted_tail(L, W, cf):
    idx = sorted(range(len(L)), key=lambda i: L[i])
    c = 0.0
    v = L[idx[-1]]
    for i in idx:
        c += W[i]
        if c >= cf - 1e-12:
            v = L[i]
            break
    es = 0.0
    for i in idx:
        if L[i] > v:
            es += W[i] * (L[i] - v)
    return {"var": v, "es": v + es / (1 - cf)}


def jump_mixture(r, p, J, cf):
    n = len(r)
    base = [-x for x in r]
    shocked = [1 - (1 + x) * (1 - J) for x in r]
    hist = weighted_tail(base, [1 / n for _ in base], cf)
    mix = weighted_tail(base + shocked, [(1 - p) / n for _ in base] + [p / n for _ in shocked], cf)
    return {"hist": hist, "mix": mix}


def boot_windows(R, L, paths, block, seed, demean):
    T = len(R[0])
    g = Rng(seed or 7)
    mu = [mean(r) if demean else 0 for r in R]
    out = []
    for _ in range(paths):
        cum = [1.0 for _ in R]
        t = 0
        while t < L:
            s = math.floor(g.u() * T)
            k = 0
            while k < block and t < L:
                j = (s + k) % T
                for i in range(len(R)):
                    cum[i] *= 1 + R[i][j] - mu[i]
                k += 1
                t += 1
        out.append([c - 1 for c in cum])
    return out


def tail_beta(ref, alt, q):
    k = max(3, _round(q * len(ref)))
    idx = sorted(range(len(ref)), key=lambda i: ref[i])[:k]
    return _div(mean([alt[i] for i in idx]), mean([ref[i] for i in idx]))


# ---------- fairness ----------
def population(o):
    R = Rng(o.get("seed") or 5)
    n = o.get("n") or 20000
    y, g, s = [], [], []
    for _ in range(n):
        gi = 1 if R.u() < _get(o, "share", 0.4) else 0
        yi = 1 if R.u() < (o["base1"] if gi else o["base0"]) else 0
        g.append(gi)
        y.append(yi)
        s.append(_get(o, "sep", 1.5) * yi + R.n() + (_or(o, "bias", 0) if gi else 0))
    return {"y": y, "g": g, "s": s}


def group_stats(P, thr):
    out = []
    for k in (0, 1):
        tp = fp = fn = tn = 0
        for i in range(len(P["y"])):
            if P["g"][i] == k:
                d = P["s"][i] >= thr[k]
                if P["y"][i]:
                    if d:
                        tp += 1
                    else:
                        fn += 1
                else:
                    if d:
                        fp += 1
                    else:
                        tn += 1
        n = tp + fp + fn + tn
        out.append({"n": n, "tp": tp, "fp": fp, "fn": fn, "tn": tn, "sel": _div(tp + fp, n), "ppv": tp / max(1, tp + fp), "tpr": tp / max(1, tp + fn), "fpr": fp / max(1, fp + tn), "acc": _div(tp + tn, n), "base": _div(tp + fn, n)})
    return out


def fairness(P, thr):
    a, b = group_stats(P, thr)
    tot = a["n"] + b["n"]
    return {"a": a, "b": b, "dp": b["sel"] - a["sel"], "ratio": min(a["sel"], b["sel"]) / max(a["sel"], b["sel"], 1e-12), "tpr": b["tpr"] - a["tpr"], "fpr": b["fpr"] - a["fpr"], "ppv": b["ppv"] - a["ppv"],
            "acc": (a["acc"] * a["n"] + b["acc"] * b["n"]) / tot, "naive": max((a["base"] * a["n"] + b["base"] * b["n"]) / tot, 1 - (a["base"] * a["n"] + b["base"] * b["n"]) / tot)}


def threshold_for(P, k, target, what):
    sc = [P["s"][i] for i in range(len(P["y"])) if P["g"][i] == k and (P["y"][i] if what == "tpr" else True)]
    sc.sort(reverse=True)
    return sc[min(len(sc) - 1, max(0, _round(target * len(sc)) - 1))]


# ---------- proxy ----------
def ols(y, cols):
    n, k = len(y), len(cols) + 1
    Z = [[1] + [c[i] for c in cols] for i in range(n)]
    A = []
    for i in range(k):
        row = []
        for j in range(k):
            s = 0
            for r in Z:
                s += r[i] * r[j]
            row.append(s)
        A.append(row)
    b = []
    for i in range(k):
        s = 0
        for t, r in enumerate(Z):
            s += r[i] * y[t]
        b.append(s)
    return solve(A, b)


def proxy(o):
    R = Rng(o.get("seed") or 9)
    n = o.get("n") or 5000
    z, x, y = [], [], []
    for _ in range(n):
        zi = 1 if R.u() < 0.5 else 0
        xi = o["rho"] * (zi - 0.5) * 2 + math.sqrt(1 - o["rho"] ** 2) * R.n()
        z.append(zi)
        x.append(xi)
        y.append(o["bx"] * xi + o["bz"] * zi + o["noise"] * R.n())
    full, short = ols(y, [x, z]), ols(y, [x])
    return {"bxFull": full[1], "bzFull": full[2], "bxShort": short[1], "theory": o["bx"] + o["bz"] * pearson(x, z) * std(z) / std(x), "z": z, "x": x, "y": y}


# ---------- drift ----------
def psi(ref, cur, bins=10):
    s = sorted(ref)
    cuts = [s[math.floor(k * len(s) / bins)] for k in range(1, bins)]

    def hist(a):
        c = [0] * bins
        for v in a:
            j = 0
            while j < len(cuts) and v > cuts[j]:
                j += 1
            c[j] += 1
        return [max(x / len(a), 1e-4) for x in c]
    e, c = hist(ref), hist(cur)
    t = 0
    for i, ei in enumerate(e):
        t = t + (c[i] - ei) * math.log(c[i] / ei)
    return t


def ks2(a, b):
    A, B = sorted(a), sorted(b)
    i = j = 0
    d = 0
    while i < len(A) and j < len(B):
        v = min(A[i], B[j])
        while i < len(A) and A[i] <= v:
            i += 1
        while j < len(B) and B[j] <= v:
            j += 1
        d = max(d, abs(i / len(A) - j / len(B)))
    en = math.sqrt(len(A) * len(B) / (len(A) + len(B)))
    lam = (en + 0.12 + 0.11 / en) * d
    p = 0.0
    for k in range(1, 101):
        p += 2 * (1 if k % 2 else -1) * _exp(-2 * k * k * lam * lam)
    return {"d": d, "p": min(1, max(0, p))}


def rolling_drift(s, refLen, win, step):
    ref = s[:refLen]
    out = []
    e = refLen + win
    while e <= len(s):
        cur = s[e - win:e]
        out.append({"end": e, "psi": psi(ref, cur), "ks": ks2(ref, cur)["d"]})
        e += step
    return out


# ---------- explaining a scoring model ----------
TRUE_W = [-0.8, 0.9, 0.6, -0.5, 0]


def applicants(o):
    R = Rng(o.get("seed") or 11)
    n = o.get("n") or 3000
    rho = _get(o, "rho", 0.7)
    Xm, y = [], []
    for _ in range(n):
        z = [R.n() for _ in range(5)]
        x = [z[0], z[1], rho * z[1] + math.sqrt(1 - rho * rho) * z[2], z[3], z[4]]
        s = 0
        for j, c in enumerate(TRUE_W):
            s = s + c * x[j]
        p = 1 / (1 + _exp(-(-1.5 + s)))
        Xm.append(x)
        y.append(1 if R.u() < p else 0)
    return {"X": Xm, "y": y, "trueW": TRUE_W, "names": ["Income", "Debt ratio", "Credit utilisation", "Credit history", "Noise (no effect)"]}


def auc_of(s, y):
    idx = sorted(range(len(s)), key=lambda i: s[i])
    rs = n1 = 0
    for r, k in enumerate(idx):
        if y[k]:
            rs += r + 1
            n1 += 1
    return _div(rs - n1 * (n1 + 1) / 2, n1 * (len(y) - n1))


def perm_importance(pf, Xm, y, reps, seed):
    R = Rng(seed or 3)
    base = auc_of([pf(x) for x in Xm], y)
    d = len(Xm[0])
    drop = []
    for j in range(d):
        t = 0
        for _ in range(reps):
            col = [x[j] for x in Xm]
            for i in range(len(col) - 1, 0, -1):
                k = math.floor(R.u() * (i + 1))
                col[i], col[k] = col[k], col[i]
            t += base - auc_of([pf(x[:j] + [col[i]] + x[j + 1:]) for i, x in enumerate(Xm)], y)
        drop.append(t / reps)
    return {"base": base, "drop": drop}


def shapley(pf, x, B):
    d = len(x)
    N = 1 << d
    v = [0.0] * N
    fact = [1]
    for i in range(1, d + 1):
        fact.append(fact[i - 1] * i)
    for m in range(N):
        s = 0
        for b in B:
            s += pf([xj if (m >> j) & 1 else b[j] for j, xj in enumerate(x)])
        v[m] = s / len(B)
    phi = [0.0] * d
    for m in range(N):
        k = sum(1 for j in range(d) if (m >> j) & 1)
        for j in range(d):
            if not (m >> j) & 1:
                phi[j] += fact[k] * fact[d - k - 1] / fact[d] * (v[m | (1 << j)] - v[m])
    return {"phi": phi, "base": v[0], "full": v[N - 1]}


# ---------- model risk ----------
def model_risk(models, o):
    q = _get(o, "q", 0.99)
    z = norm_inv(q)
    rows = []
    for m in models:
        s = o["s0"] * m["cx"] * (1 + 0.15 * m["age"])
        rows.append({**m, "s": s, "var": m["exposure"] * s * z, "es": m["exposure"] * s * norm_pdf(z) / (1 - q)})
    R = Rng(o.get("seed") or 5)
    N = o.get("n") or 20000
    L = []
    a, b = math.sqrt(o["rho"]), math.sqrt(1 - o["rho"])
    for _ in range(N):
        F = R.n()
        l = 0
        for r in rows:
            l += r["exposure"] * max(0, r["s"] * (a * F + b * R.n()))
        L.append(l)
    L.sort()
    k = math.floor(q * N)
    tail = L[k:]
    s = 0
    for r in rows:
        s += r["es"]
    return {"rows": rows, "sumEs": s, "aggVar": L[k], "aggEs": sum(tail) / len(tail)}
