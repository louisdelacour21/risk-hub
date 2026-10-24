# Key-rate DV01 and parallel / steepener / flattener shocks
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

# Bond book: (maturity in years, notional, coupon). Curve: zero rates at key tenors, linear interpolation.
tenors = np.array([0.25, 1, 2, 3, 5, 7, 10, 20, 30])
zeros = np.array([.040, .041, .042, .042, .043, .044, .045, .047, .048])    # replace by your curve (US Treasury)
book = [(2, 100, .03), (5, 150, .04), (10, 200, .045), (30, 50, .05)]

def pv(z):
    tot = 0.0
    for T, N, c in book:
        t = np.arange(1, T + 1.0); cf = np.full(t.shape, N * c); cf[-1] += N
        tot += (cf * np.exp(-np.interp(t, tenors, z) * t)).sum()
    return tot
base = pv(zeros); bp = 1e-4
for i, T in enumerate(tenors):
    bump = zeros.copy(); bump[i] += bp
    print(f"KRD {T:>5g}y  {pv(bump) - base:+10.4f}")
shocks = {"parallel up": np.ones_like(tenors) * 0.02, "parallel down": -np.ones_like(tenors) * 0.02,
          "steepener": -0.65 * 0.025 * np.exp(-tenors / 4) + 0.9 * 0.025 * (1 - np.exp(-tenors / 4)),
          "flattener": 0.8 * 0.025 * np.exp(-tenors / 4) - 0.6 * 0.025 * (1 - np.exp(-tenors / 4)),
          "short up": 0.025 * np.exp(-tenors / 4), "short down": -0.025 * np.exp(-tenors / 4)}
for name, s in shocks.items(): print(f"{name:14s} P&L {pv(zeros + s) - base:+10.3f}")
