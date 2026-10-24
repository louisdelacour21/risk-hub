# Equal weight, minimum variance, risk parity and Hierarchical Risk Parity
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy.cluster.hierarchy import linkage, leaves_list
from scipy.optimize import minimize

# Four correlated fat-tailed daily return series (replace by your own DataFrame of returns) and portfolio weights
rng = np.random.default_rng(0)
C = np.array([[1, .6, .4, .2], [.6, 1, .5, .3], [.4, .5, 1, .4], [.2, .3, .4, 1]])
R = rng.standard_t(5, (2500, 4)) @ np.linalg.cholesky(C).T * (np.array([.02, .015, .03, .01]) / np.sqrt(5 / 3))
w = np.array([.4, .3, .2, .1])

def hrp(S):
    C = S / np.outer(np.sqrt(np.diag(S)), np.sqrt(np.diag(S)))
    order = leaves_list(linkage(np.sqrt(0.5 * (1 - C))[np.triu_indices(len(S), 1)], "single"))
    w = np.ones(len(S))
    def cvar(idx):
        sub = S[np.ix_(idx, idx)]; ivp = 1 / np.diag(sub); ivp /= ivp.sum(); return ivp @ sub @ ivp
    def bisect(items):
        if len(items) < 2: return
        a, b = items[:len(items) // 2], items[len(items) // 2:]
        va, vb = cvar(a), cvar(b); alpha = 1 - va / (va + vb)
        w[a] *= alpha; w[b] *= 1 - alpha
        bisect(a); bisect(b)
    bisect(list(order)); return w / w.sum()

def minvar(S): x = np.linalg.solve(S, np.ones(len(S))); return x / x.sum()
def parity(S):
    f = lambda x: np.sum((x * (S @ x) - (x @ S @ x) / len(S)) ** 2)
    r = minimize(f, np.ones(len(S)) / len(S), bounds=[(0, 1)] * len(S), constraints={"type": "eq", "fun": lambda x: x.sum() - 1}); return r.x

win, reb = 500, 63
strategies = {"equal": lambda S: np.ones(len(S)) / len(S), "min-var": minvar, "risk parity": parity, "HRP": hrp}
for name, f in strategies.items():
    pnl = []
    for t in range(win, len(R) - reb, reb):
        wt = f(np.cov(R[t - win:t].T)); pnl.extend(R[t:t + reb] @ wt)
    pnl = np.array(pnl); print(f"{name:12s} out-of-sample vol {pnl.std() * np.sqrt(252):.2%}  Sharpe {pnl.mean() / pnl.std() * np.sqrt(252):.2f}")
