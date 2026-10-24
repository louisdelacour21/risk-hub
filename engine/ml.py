"""Small honest machine learning of the lab (ridge, lasso, logistic, ROC / AUC / KS, trees, boosting, Gaussian HMM, quantile regression): a line-for-line port of ml.js.
The closures of the JavaScript (p, raw, predict) become functions taking the fitted dict. Tested by tests/test_ml.py."""
import math

from risk import mean
from quant import solve, _exp, _div, _log

nan, inf = math.nan, math.inf


def col_stats(X):
    n, k = len(X), len(X[0])
    mu, sd = [0.0] * k, [0.0] * k
    for r in X:
        for j in range(k):
            mu[j] += r[j] / n
    for r in X:
        for j in range(k):
            sd[j] += (r[j] - mu[j]) ** 2 / n
    return {"mu": mu, "sd": [math.sqrt(v) or 1 for v in sd]}


def apply(X, st):
    return [[(v - st["mu"][j]) / st["sd"][j] for j, v in enumerate(r)] for r in X]


def dot(a, b):
    s = 0.0
    for i in range(len(a)):
        s += a[i] * b[i]
    return s


def sigmoid(z):
    return 1 / (1 + _exp(-z)) if z >= 0 else _exp(z) / (1 + _exp(z))


def r2(y, p):
    m = mean(y)
    a = b = 0.0
    for i in range(len(y)):
        a += (y[i] - p[i]) ** 2
        b += (y[i] - m) ** 2
    return 1 - _div(a, b)


def _sign(x):
    return 1 if x > 0 else -1 if x < 0 else 0


# ---------- ridge and lasso ----------
def ridge(Z, y, lam):
    k = len(Z[0])
    A = []
    for i in range(k):
        row = []
        for j in range(k):
            s = lam if i == j else 0
            for r in Z:
                s += r[i] * r[j]
            row.append(s)
        A.append(row)
    c = [sum(r[i] * y[t] for t, r in enumerate(Z)) for i in range(k)]
    return solve(A, c)


def lasso(Z, y, lam, o=None):
    o = o or {}
    n, k = len(Z), len(Z[0])
    b = list(o["start"]) if o.get("start") else [0.0] * k
    res = [v - dot(Z[t], b) for t, v in enumerate(y)]
    nz = [sum(r[j] * r[j] for r in Z) / n for j in range(k)]
    for _ in range(o.get("iters") or 2000):
        dmax = 0.0
        for j in range(k):
            if nz[j] == 0:
                continue
            rho = 0.0
            for t in range(n):
                rho += Z[t][j] * res[t]
            rho = rho / n + nz[j] * b[j]
            nb = _sign(rho) * max(abs(rho) - lam, 0) / nz[j]
            d = nb - b[j]
            if d != 0:
                for t in range(n):
                    res[t] -= Z[t][j] * d
                b[j] = nb
                dmax = max(dmax, abs(d) * math.sqrt(nz[j]))
        if dmax < (o.get("tol") or 1e-10):
            break
    return b


def lasso_path(Z, y, lams):
    out, b = [], None
    for l in lams:
        b = lasso(Z, y, l, {"start": b})
        out.append(b)
    return out


# ---------- logistic regression (Newton / IRLS) ----------
def logistic(X, y, lam=0):
    n, k = len(X), len(X[0]) + 1
    th = [0.0] * k
    m = mean(y)
    th[0] = math.log((m + 1e-9) / (1 - m + 1e-9))
    for _ in range(50):
        g = [0.0] * k
        H = [[0.0] * k for _ in range(k)]
        for t in range(n):
            x = [1] + list(X[t])
            p = sigmoid(dot(th, x))
            w = max(p * (1 - p), 1e-9)
            e = p - y[t]
            for i in range(k):
                g[i] += e * x[i]
                for j in range(i, k):
                    H[i][j] += w * x[i] * x[j]
        for i in range(1, k):
            g[i] += lam * th[i]
            H[i][i] += lam
        for i in range(k):
            for j in range(i):
                H[i][j] = H[j][i]
        H[0][0] += 1e-10
        d = solve(H, g)
        th = [v - d[i] for i, v in enumerate(th)]
        if max(abs(v) for v in d) < 1e-10:
            break
    return {"b0": th[0], "w": th[1:]}


def logistic_p(fit, x):
    return sigmoid(fit["b0"] + dot(fit["w"], x))


# ---------- classification metrics ----------
def auc(score, y):
    idx = sorted(range(len(score)), key=lambda i: score[i])
    rank_sum = 0.0
    n1, i = 0, 0
    while i < len(idx):
        j = i
        while j + 1 < len(idx) and score[idx[j + 1]] == score[idx[i]]:
            j += 1
        rk = (i + j) / 2 + 1
        for m in range(i, j + 1):
            if y[idx[m]] == 1:
                rank_sum += rk
                n1 += 1
        i = j + 1
    n0 = len(y) - n1
    return _div(rank_sum - n1 * (n1 + 1) / 2, n1 * n0)


def roc(score, y):
    idx = sorted(range(len(score)), key=lambda i: -score[i])
    n1 = sum(y)
    n0 = len(y) - n1
    fpr, tpr = [0], [0]
    tp = fp = 0
    ks = 0
    for i in range(len(idx)):
        if y[idx[i]] == 1:
            tp += 1
        else:
            fp += 1
        if i == len(idx) - 1 or score[idx[i + 1]] != score[idx[i]]:
            fpr.append(_div(fp, n0))
            tpr.append(_div(tp, n1))
            ks = max(ks, _div(tp, n1) - _div(fp, n0))
    a = auc(score, y)
    return {"fpr": fpr, "tpr": tpr, "auc": a, "gini": 2 * a - 1, "ks": ks}


def log_loss(p, y):
    return -mean([v * math.log(max(p[i], 1e-12)) + (1 - v) * math.log(max(1 - p[i], 1e-12)) for i, v in enumerate(y)])


def calibration(p, y, bins=10):
    idx = sorted(range(len(p)), key=lambda i: p[i])
    out = []
    for b in range(bins):
        s = idx[math.floor(b * len(idx) / bins):math.floor((b + 1) * len(idx) / bins)]
        out.append({"pred": mean([p[i] for i in s]), "obs": mean([y[i] for i in s]), "n": len(s)})
    return out


# ---------- trees and boosting ----------
def build_tree(X, g, h, idx, depth, o):
    def leaf():
        sg = sh = 0.0
        for i in idx:
            sg += g[i]
            sh += h[i] if h else 1
        return {"v": _div(sg, sh + (o.get("reg") or 0))}
    if depth >= o["maxDepth"] or len(idx) < 2 * o["minLeaf"]:
        return leaf()
    tot = 0.0
    for i in idx:
        tot += g[i]
    best = None
    for f in range(len(X[0])):
        s = sorted(idx, key=lambda i: X[i][f])
        sl = 0.0
        for m in range(len(s) - 1):
            sl += g[s[m]]
            nl = m + 1
            nr = len(s) - nl
            if X[s[m]][f] == X[s[m + 1]][f] or nl < o["minLeaf"] or nr < o["minLeaf"]:
                continue
            gain = sl * sl / nl + (tot - sl) ** 2 / nr
            if best is None or gain > best["gain"]:
                best = {"gain": gain, "f": f, "t": (X[s[m]][f] + X[s[m + 1]][f]) / 2}
    if best is None or best["gain"] <= tot * tot / len(idx) + 1e-12:
        return leaf()
    L = [i for i in idx if X[i][best["f"]] <= best["t"]]
    Rr = [i for i in idx if not X[i][best["f"]] <= best["t"]]
    return {"f": best["f"], "t": best["t"], "l": build_tree(X, g, h, L, depth + 1, o), "r": build_tree(X, g, h, Rr, depth + 1, o)}


def tree_predict(nd, x):
    while "f" in nd:
        nd = nd["l"] if x[nd["f"]] <= nd["t"] else nd["r"]
    return nd["v"]


def tree_fit(X, y, o=None):
    o = o or {}
    return build_tree(X, y, None, list(range(len(y))), 0, {"maxDepth": 3 if o.get("maxDepth") is None else o["maxDepth"], "minLeaf": 20 if o.get("minLeaf") is None else o["minLeaf"]})


def boost(X, y, o=None):
    o = o or {}
    n = len(X)
    lr = 0.1 if o.get("lr") is None else o["lr"]
    T = 100 if o.get("trees") is None else o["trees"]
    p0 = mean(y)
    F0 = math.log(p0 / (1 - p0))
    F = [F0] * n
    trees, idx = [], list(range(len(y)))
    for _ in range(T):
        g = [y[i] - sigmoid(f) for i, f in enumerate(F)]
        h = [max(sigmoid(f) * (1 - sigmoid(f)), 1e-9) for f in F]
        tr = build_tree(X, g, h, idx, 0, {"maxDepth": 2 if o.get("depth") is None else o["depth"], "minLeaf": 20 if o.get("minLeaf") is None else o["minLeaf"], "reg": 1})
        trees.append(tr)
        for i in range(n):
            F[i] += lr * tree_predict(tr, X[i])
    return {"F0": F0, "lr": lr, "trees": T, "forest": trees}


def boost_raw(m, x, k=None):
    f = m["F0"]
    for i in range(min(m["trees"] if k is None else k, m["trees"])):
        f += m["lr"] * tree_predict(m["forest"][i], x)
    return f


def boost_p(m, x, k=None):
    return sigmoid(boost_raw(m, x, k))


# ---------- Gaussian hidden Markov model ----------
def hmm(r, K=2, iters=200):
    n = len(r)
    mu0 = mean(r)
    idx = sorted(range(n), key=lambda i: abs(r[i] - mu0))
    mu, sg = [], []
    A = [[0.95 if i == j else 0.05 / (K - 1) for j in range(K)] for i in range(K)]
    pi = [1 / K] * K
    for k in range(K):
        s = [r[i] for i in idx[math.floor(k * n / K):math.floor((k + 1) * n / K)]]
        mu.append(mean(s))
        sg.append(math.sqrt(mean([(v - mean(s)) ** 2 for v in s])) or 1e-3)

    def dens(x, k):
        return _exp(-0.5 * ((x - mu[k]) / sg[k]) ** 2) / (sg[k] * math.sqrt(2 * math.pi)) + 1e-300
    ll, gam = -inf, None
    for _ in range(iters):
        al, c = [], []
        B = [[dens(x, k) for k in range(K)] for x in r]
        a0 = [p * B[0][k] for k, p in enumerate(pi)]
        s0 = sum(a0)
        c.append(s0)
        al.append([v / s0 for v in a0])
        for t in range(1, n):
            a = [b * sum(v * A[i][j] for i, v in enumerate(al[t - 1])) for j, b in enumerate(B[t])]
            s = sum(a)
            c.append(s)
            al.append([v / s for v in a])
        be = [None] * n
        be[n - 1] = [1.0] * K
        for t in range(n - 2, -1, -1):
            be[t] = [sum(a * B[t + 1][j] * be[t + 1][j] for j, a in enumerate(A[i])) / c[t + 1] for i in range(K)]
        gam = [[v * be[t][k] for k, v in enumerate(a)] for t, a in enumerate(al)]
        xi = [[0.0] * K for _ in range(K)]
        for t in range(n - 1):
            for i in range(K):
                for j in range(K):
                    xi[i][j] += al[t][i] * A[i][j] * B[t + 1][j] * be[t + 1][j] / c[t + 1]
        nll = sum(math.log(v) for v in c)
        pi = list(gam[0])
        A = [[v / sum(row) for v in row] for row in xi]
        for k in range(K):
            w = sum(g[k] for g in gam)
            mu[k] = sum(g[k] * r[t] for t, g in enumerate(gam)) / w
            sg[k] = max(math.sqrt(sum(g[k] * (r[t] - mu[k]) ** 2 for t, g in enumerate(gam)) / w), 1e-5)
        if abs(nll - ll) < 1e-8:
            ll = nll
            break
        ll = nll
    ord_ = sorted(range(K), key=lambda k: sg[k])

    def pick(arr):
        return [arr[k] for k in ord_]
    npar = K * K - 1 + 2 * K
    return {"K": K, "mu": pick(mu), "sigma": pick(sg), "A": [[A[i][j] for j in ord_] for i in ord_], "prob": [pick(g) for g in gam], "ll": ll, "stay": [A[i][i] for i in ord_],
            "duration": [1 / (1 - A[i][i]) for i in ord_], "aic": -2 * ll + 2 * npar, "bic": -2 * ll + npar * math.log(n)}


# ---------- quantile regression (IRLS) ----------
def quant_reg(y, cols, tau):
    n, k = len(y), len(cols) + 1
    X = [[1] + [c[t] for c in cols] for t in range(n)]

    def wls(w):
        A = [[sum(w[t] * X[t][i] * X[t][j] for t in range(n)) for j in range(k)] for i in range(k)]
        c = [sum(w[t] * X[t][i] * y[t] for t in range(n)) for i in range(k)]
        return solve(A, c)
    b = wls([1.0] * n)
    for _ in range(500):
        w = []
        for t, x in enumerate(X):
            e = y[t] - dot(b, x)
            w.append((tau if e >= 0 else 1 - tau) / max(abs(e), 1e-6))
        nb = wls(w)
        d = max(abs(v - b[i]) for i, v in enumerate(nb))
        b = nb
        if d < 1e-9:
            break
    loss = 0.0
    for t, x in enumerate(X):
        e = y[t] - dot(b, x)
        loss += (tau if e >= 0 else tau - 1) * e
    return {"beta": b, "loss": loss}


def quant_predict(fit, xs):
    b = fit["beta"]
    return b[0] + sum(v * b[i + 1] for i, v in enumerate(xs))
