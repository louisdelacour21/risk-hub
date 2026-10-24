# Nelson-Siegel yield curve fit
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy.optimize import least_squares

tau = np.array([0.25, 0.5, 1, 2, 3, 5, 7, 10, 20, 30])
y = np.array([.040, .041, .042, .042, .0425, .043, .0435, .044, .0455, .046])     # observed zero yields (replace by data)
def ns(p, t):
    b0, b1, b2, lam = p; x = t / lam
    return b0 + b1 * (1 - np.exp(-x)) / x + b2 * ((1 - np.exp(-x)) / x - np.exp(-x))
fit = least_squares(lambda p: ns(p, tau) - y, [0.045, -0.01, 0.01, 2.0], bounds=([0, -0.2, -0.2, 0.1], [0.2, 0.2, 0.2, 10]))
b0, b1, b2, lam = fit.x
print(f"level {b0:.4f}  slope {b1:.4f}  curvature {b2:.4f}  lambda {lam:.2f}   rmse {np.sqrt(np.mean(fit.fun**2)) * 1e4:.2f} bp")
pos = @@=ns_0@@
print("P&L of a ", "short" if pos < 0 else "long", "10y position for +100bp level shift (duration ~8):", -pos * 8 * 0.01)
