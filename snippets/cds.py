# CDS curve bootstrap: hazard rates, survival probabilities, par spreads
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

tenors = np.array([1, 3, 5, 7, 10.0])
spreads = np.array([@@s1=80@@, @@s3=110@@, @@s5=140@@, @@s7=155@@, @@s10=170@@]) / 1e4
R, r = @@R=0.4@@, @@r=0.03@@
hz, prev_t, S = [], 0.0, [1.0]
def surv(t, hz):
    edges = np.r_[0, tenors[: len(hz)]]; out, acc = 1.0, 0.0
    for h, a, b in zip(hz, edges[:-1], edges[1:]):
        acc += h * (min(t, b) - a) if t > a else 0
    last = tenors[len(hz) - 1]
    return np.exp(-(acc + (hz[-1] * (t - last) if t > last else 0)))
def par_spread(k, hz, step=0.25):                                     # quarterly premium, continuous protection
    grid = np.arange(step, tenors[k] + 1e-9, step); sv = np.array([surv(t, hz) for t in grid]); df = np.exp(-r * grid)
    prem = np.sum(df * sv * step); prot = (1 - R) * np.sum(df * (np.r_[1, sv[:-1]] - sv))
    return prot / prem
for k in range(len(tenors)):
    f = lambda h: par_spread(k, hz + [h]) - spreads[k]
    lo, hi = 1e-6, 2.0
    for _ in range(80):
        mid = 0.5 * (lo + hi); (lo, hi) = (mid, hi) if f(mid) < 0 else (lo, mid)
    hz.append(0.5 * (lo + hi))
print("hazard rates:", np.round(hz, 5))
print("survival at tenors:", [round(surv(t, hz), 4) for t in tenors])
cp = @@cp=5@@; N = @@N=10@@
print(f"mark-to-market of {N}m protection bought at {spreads[2] * 1e4:.0f}bp vs market 5y: {N * 1e6 * (par_spread(2, hz) - spreads[2]) * 4.5:,.0f}")
