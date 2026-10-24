"""Risk, fourth and fifth waves (riskx3.js and riskx4.js): VaR scoring, dependence measures, covariance cleaning, drawdown at risk, Black-Litterman, Almgren-Chriss,
Euler risk contributions, stressed window, Higham nearest correlation, DCC. A line-for-line port. Tested by tests/test_riskx3.py."""
import math

from risk import norm_cdf as N
from quant import _exp, _div, _log, _sqrt

nan, inf = math.nan, math.inf


def _round(x):
    return math.floor(x + 0.5)


def _sign(x):
    return nan if x != x else (x > 0) - (x < 0)


def _or(x, d):                                        # JS  x || d
    return d if (x == 0 or x != x) else x


def mean(a):
    return _div(sum(a), len(a))


# ---------- VaR scoring ----------
def tick_loss(r, v, p):
    out = []
    for i, x in enumerate(r):
        q = -v[i]
        u = x - q
        out.append((p - (1 if u < 0 else 0)) * u)
    return out


def dm(l1, l2, h=1):
    d = [x - l2[i] for i, x in enumerate(l1)]
    n = len(d)
    m = mean(d)

    def g(k):
        s = 0.0
        for i in range(k, n):
            s += (d[i] - m) * (d[i - k] - m)
        return s / n
    lr = g(0)
    for k in range(1, h):
        lr += 2 * (1 - k / h) * g(k)
    stat = m / math.sqrt(max(lr, 1e-30) / n)
    return {"mean": m, "stat": stat, "p": 2 * (1 - N(abs(stat)))}


# ---------- dependence ----------
def rank(x):
    idx = sorted(((v, i) for i, v in enumerate(x)), key=lambda p: p[0])
    r = [0.0] * len(x)
    i = 0
    while i < len(idx):
        j = i
        while j + 1 < len(idx) and idx[j + 1][0] == idx[i][0]:
            j += 1
        av = (i + j) / 2 + 1
        for k in range(i, j + 1):
            r[idx[k][1]] = av
        i = j + 1
    return r


def pearson(x, y):
    mx, my = mean(x), mean(y)
    sxy = sxx = syy = 0.0
    for i in range(len(x)):
        sxy += (x[i] - mx) * (y[i] - my)
        sxx += (x[i] - mx) ** 2
        syy += (y[i] - my) ** 2
    return _div(sxy, math.sqrt(sxx * syy))


def spearman(x, y):
    return pearson(rank(x), rank(y))


def kendall(x, y):
    c = d = tx = ty = 0
    n = len(x)
    for i in range(n):
        for j in range(i + 1, n):
            a, b = _sign(x[i] - x[j]), _sign(y[i] - y[j])
            if a * b > 0:
                c += 1
            elif a * b < 0:
                d += 1
            else:
                if a == 0:
                    tx += 1
                if b == 0:
                    ty += 1
    return _div(c - d, math.sqrt((c + d + tx) * (c + d + ty)))


def dcor(x, y):
    n = len(x)

    def cen(v):
        D = [[abs(v[i] - w) for w in v] for i in range(n)]
        rm = [mean(r) for r in D]
        gm = mean(rm)
        for i in range(n):
            for j in range(n):
                D[i][j] += gm - rm[i] - rm[j]
        return D
    A, B = cen(x), cen(y)
    ab = aa = bb = 0.0
    for i in range(n):
        for j in range(n):
            ab += A[i][j] * B[i][j]
            aa += A[i][j] ** 2
            bb += B[i][j] ** 2
    return math.sqrt(_div(max(ab, 0), math.sqrt(aa * bb)))


def mutual_info(x, y, bins=10):
    n = len(x)
    rx, ry = rank(x), rank(y)

    def b(r):
        return min(bins - 1, math.floor(((r - 1) / n) * bins))
    J = [[0] * bins for _ in range(bins)]
    for i in range(n):
        J[b(rx[i])][b(ry[i])] += 1
    mi = 0.0
    for i in range(bins):
        for j in range(bins):
            if J[i][j]:
                p = J[i][j] / n
                mi += p * math.log(p / ((1 / bins) * (1 / bins)))
    return {"mi": mi, "bias": ((bins - 1) ** 2) / (2 * n)}


# ---------- covariance cleaning ----------
def sample_cov(X):
    T, k = len(X), len(X[0])
    mu = [mean([r[j] for r in X]) for j in range(k)]
    S = [[0.0] * k for _ in range(k)]
    for r in X:
        for i in range(k):
            for j in range(k):
                S[i][j] += (r[i] - mu[i]) * (r[j] - mu[j]) / T
    return {"S": S, "mu": mu}


def ledoit_wolf(X):
    T, k = len(X), len(X[0])
    sc = sample_cov(X)
    S, mu = sc["S"], sc["mu"]
    m = sum(r[i] for i, r in enumerate(S)) / k
    d2 = 0.0
    for i in range(k):
        for j in range(k):
            d2 += (S[i][j] - (m if i == j else 0)) ** 2
    b2 = 0.0
    for r in X:
        s = 0.0
        for i in range(k):
            for j in range(k):
                xi = (r[i] - mu[i]) * (r[j] - mu[j]) - S[i][j]
                s += xi * xi
        b2 += s / (T * T)
    b2 = min(b2, d2)
    a = b2 / d2 if d2 else 0
    return {"S": [[(1 - a) * x + (a * m if i == j else 0) for j, x in enumerate(r)] for i, r in enumerate(S)], "shrink": a, "raw": S}


def eig_sym(A0):
    n = len(A0)
    A = [r[:] for r in A0]
    V = [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
    for _ in range(60):
        off = 0.0
        for i in range(n):
            for j in range(i + 1, n):
                off += A[i][j] ** 2
        if off < 1e-22:
            break
        for p in range(n):
            for q in range(p + 1, n):
                if abs(A[p][q]) < 1e-300:
                    continue
                th = (A[q][q] - A[p][p]) / (2 * A[p][q])
                t = _sign(_or(th, 1)) / (abs(th) + math.sqrt(th * th + 1))
                c = 1 / math.sqrt(t * t + 1)
                s = t * c
                for k in range(n):
                    akp, akq = A[k][p], A[k][q]
                    A[k][p] = c * akp - s * akq
                    A[k][q] = s * akp + c * akq
                for k in range(n):
                    apk, aqk = A[p][k], A[q][k]
                    A[p][k] = c * apk - s * aqk
                    A[q][k] = s * apk + c * aqk
                for k in range(n):
                    vkp, vkq = V[k][p], V[k][q]
                    V[k][p] = c * vkp - s * vkq
                    V[k][q] = s * vkp + c * vkq
    vals = [A[i][i] for i in range(n)]
    ordr = sorted(range(n), key=lambda i: -vals[i])
    return {"vals": [vals[i] for i in ordr], "vecs": [[r[i] for r in V] for i in ordr]}


def mp_clean(C, T):
    k = len(C)
    e = eig_sym(C)
    edge = (1 + math.sqrt(k / T)) ** 2
    noise = [v <= edge for v in e["vals"]]
    nn = sum(1 for z in noise if z)
    av = sum(v for i, v in enumerate(e["vals"]) if noise[i]) / nn if nn else 0
    vals = [av if noise[i] else v for i, v in enumerate(e["vals"])]
    M = [[0.0] * k for _ in range(k)]
    for m in range(k):
        for i in range(k):
            for j in range(k):
                M[i][j] += vals[m] * e["vecs"][m][i] * e["vecs"][m][j]
    dg = [math.sqrt(_or(r[i], 1)) for i, r in enumerate(M)]
    for i in range(k):
        for j in range(k):
            M[i][j] /= dg[i] * dg[j]
    for i in range(k):
        for j in range(k):
            if i != j:
                M[i][j] = (M[i][j] + M[j][i]) / 2
    for i in range(k):
        M[i][i] = 1.0
    return {"C": M, "edge": edge, "kept": k - nn, "vals": e["vals"]}


def to_corr(S):
    return [[_div(x, math.sqrt(S[i][i] * S[j][j])) for j, x in enumerate(r)] for i, r in enumerate(S)]


def from_corr(C, sd):
    return [[x * sd[i] * sd[j] for j, x in enumerate(r)] for i, r in enumerate(C)]


def solve(A0, b0):
    n = len(b0)
    A = [list(r) + [b0[i]] for i, r in enumerate(A0)]
    for c in range(n):
        p = c
        for r in range(c + 1, n):
            if abs(A[r][c]) > abs(A[p][c]):
                p = r
        A[c], A[p] = A[p], A[c]
        for r in range(c + 1, n):
            f = _div(A[r][c], A[c][c])
            for k in range(c, n + 1):
                A[r][k] -= f * A[c][k]
    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        s = A[i][n]
        for j in range(i + 1, n):
            s -= A[i][j] * x[j]
        x[i] = _div(s, A[i][i])
    return x


def min_var(S):
    w = solve(S, [1.0] * len(S))
    t = sum(w)
    return [x / t for x in w]


def quad(w, S):
    s = 0.0
    for i in range(len(w)):
        for j in range(len(w)):
            s += w[i] * w[j] * S[i][j]
    return s


# ---------- drawdowns ----------
def drawdowns(r):
    v = pk = 1.0
    dd = []
    for x in r:
        v *= 1 + x
        pk = max(pk, v)
        dd.append(1 - v / pk)
    return dd


def cdar(dd, a):
    s = sorted(dd, reverse=True)
    n = max(1, math.ceil((1 - a) * len(s)))
    return {"dar": s[n - 1], "cdar": mean(s[:n])}


# ---------- Black-Litterman ----------
def black_litterman(Sigma, wm, delta, tau, P, Q, omega):
    pi = [delta * sum(x * wm[j] for j, x in enumerate(r)) for r in Sigma]
    if not P:
        return {"pi": pi, "mu": pi}
    ts = [[tau * x for x in r] for r in Sigma]
    PT = [[sum(x * p[j] for j, x in enumerate(r)) for r in ts] for p in P]
    K = [[sum(x * PT[j][m] for m, x in enumerate(p)) + (omega[i] if i == j else 0) for j, q in enumerate(P)] for i, p in enumerate(P)]
    diff = [q - sum(x * pi[j] for j, x in enumerate(P[i])) for i, q in enumerate(Q)]
    z = solve(K, diff)
    mu = [p + sum(row[i] * z[v] for v, row in enumerate(PT)) for i, p in enumerate(pi)]
    return {"pi": pi, "mu": mu}


def mv_weights(Sigma, mu, delta):
    return solve(Sigma, [m / delta for m in mu])


# ---------- Almgren-Chriss ----------
def almgren_chriss(X, T, N_, sigma, eta, gamma, lam):
    tau = T / N_
    kap = math.sqrt(max(lam, 0) * sigma * sigma / max(eta - 0.5 * gamma * tau, 1e-12))
    x = []
    for k in range(N_ + 1):
        if kap * T < 1e-6:
            x.append(X * (1 - k / N_))
        else:
            x.append(X * _exp(-kap * k * tau) * (1 - _exp(-2 * kap * (T - k * tau))) / (1 - _exp(-2 * kap * T)))
    cost = 0.5 * gamma * X * X
    vari = 0.0
    for k in range(1, N_ + 1):
        n = x[k - 1] - x[k]
        cost += (eta / tau) * n * n
        vari += sigma * sigma * tau * x[k] * x[k]
    return {"x": x, "cost": cost, "sd": math.sqrt(vari), "kappa": kap}


# ---------- Euler contributions, historical simulation (riskx4) ----------
def contrib(R, w, conf):
    T, n = len(R), len(w)
    L = [-sum(w[i] * x for i, x in enumerate(row)) for row in R]
    idx = sorted(range(T), key=lambda t: L[t])
    k = max(1, math.ceil((1 - conf) * T))
    q = T - k
    tail = idx[q:]
    m = max(3, _round(0.01 * T))
    near = idx[max(0, q - m):min(T, q + m + 1)]

    def comp(days):
        return [mean([-w[i] * R[t][i] for t in days]) for i in range(n)]
    return {"var": L[idx[q]], "es": mean([L[t] for t in tail]), "cVar": comp(near), "cEs": comp(tail), "L": L}


def port_var(R, w, conf):
    L = sorted(-sum(w[i] * x for i, x in enumerate(row)) for row in R)
    return L[min(len(L) - 1, math.ceil(conf * len(L)) - 1)]


def incremental_var(R, w, conf):
    base = port_var(R, w, conf)
    return [base - port_var(R, [0 if j == i else x for j, x in enumerate(w)], conf) for i in range(len(w))]


def rolling_es(r, win, conf):
    out = []
    k = max(1, math.ceil((1 - conf) * win))
    for s in range(len(r) - win + 1):
        a = sorted(r[s:s + win])
        out.append(-mean(a[:k]))
    return out


def stressed_window(r, win, conf):
    es = rolling_es(r, win, conf)
    b = 0
    for i in range(1, len(es)):
        if es[i] > es[b]:
            b = i
    return {"es": es, "start": b, "max": es[b]}


def higham(A, tol=1e-10, maxIt=500):
    n = len(A)

    def sub(P, Q):
        return [[x - Q[i][j] for j, x in enumerate(r)] for i, r in enumerate(P)]

    def psd(M):
        e = eig_sym(M)
        O = [[0.0] * n for _ in range(n)]
        for m, v in enumerate(e["vals"]):
            if v > 0:
                for i in range(n):
                    for j in range(n):
                        O[i][j] += v * e["vecs"][m][i] * e["vecs"][m][j]
        return O
    Y = [r[:] for r in A]
    dS = [[0.0 for _ in r] for r in A]
    it = 0
    while it < maxIt:
        Rm = sub(Y, dS)
        Xp = psd(Rm)
        dS = sub(Xp, Rm)
        Yn = [[1.0 if i == j else x for j, x in enumerate(r)] for i, r in enumerate(Xp)]
        d = 0.0
        for i in range(n):
            for j in range(n):
                d = max(d, abs(Yn[i][j] - Y[i][j]))
        Y = Yn
        if d < tol:
            it += 1
            break
        it += 1
    dist = 0.0
    for i in range(n):
        for j in range(n):
            dist += (Y[i][j] - A[i][j]) ** 2
    return {"C": Y, "iters": it, "dist": math.sqrt(dist), "minEig": eig_sym(Y)["vals"][-1]}


# ---------- DCC ----------
def dcc_path(z1, z2, a, b, qb):
    q11 = q22 = 1.0
    q12 = qb
    rho = []
    for t in range(len(z1)):
        rho.append(_div(q12, math.sqrt(q11 * q22)))
        q11 = (1 - a - b) + a * z1[t] ** 2 + b * q11
        q22 = (1 - a - b) + a * z2[t] ** 2 + b * q22
        q12 = (1 - a - b) * qb + a * z1[t] * z2[t] + b * q12
    return {"rho": rho, "next": _div(q12, math.sqrt(q11 * q22))}


def dcc_fit(z1, z2):
    T = len(z1)
    s12 = s11 = s22 = 0.0
    for t in range(T):
        s12 += z1[t] * z2[t]
        s11 += z1[t] * z1[t]
        s22 += z2[t] * z2[t]
    qb = s12 / math.sqrt(s11 * s22)

    def ll(a, b):
        rho = dcc_path(z1, z2, a, b, qb)["rho"]
        s = 0.0
        for t in range(T):
            r = min(0.999, max(-0.999, rho[t]))
            d = 1 - r * r
            s -= 0.5 * (math.log(d) + (z1[t] ** 2 + z2[t] ** 2 - 2 * r * z1[t] * z2[t]) / d)
        return s
    best = {"a": 0, "b": 0, "ll": ll(0, 0)}
    a = 0.0
    while a <= 0.2001:
        b = 0.5
        while b <= 0.995 and a + b < 0.999:
            l = ll(a, b)
            if l > best["ll"]:
                best = {"a": a, "b": b, "ll": l}
            b += 0.01
        a += 0.01
    p = dcc_path(z1, z2, best["a"], best["b"], qb)
    return {**best, "ll0": ll(0, 0), "qbar": qb, "rho": p["rho"], "next": p["next"]}
