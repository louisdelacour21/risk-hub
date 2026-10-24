# Almgren-Chriss optimal liquidation schedule
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

X, T, sig, adv, lam = 1000000, 10, 0.02, 5000000, 0.000001
eta, gamma = 0.1 * sig / adv, 0.05 * sig / adv                               # temporary and permanent impact coefficients
kappa = np.sqrt(lam * sig**2 / (eta - 0.5 * gamma * 1.0))
t = np.linspace(0, T, T + 1)
holdings = X * np.sinh(kappa * (T - t)) / np.sinh(kappa * T)                  # optimal remaining position
trades = -np.diff(holdings)
print("kappa", kappa, " (0 = straight-line / TWAP; larger = trade faster, accept more impact)")
print("shares sold per day:", np.round(trades))
cost = gamma * 0.5 * X**2 + eta * np.sum(trades**2)
risk = sig * np.sqrt(np.sum(holdings[1:] ** 2))
print(f"expected impact cost {cost:,.0f}   risk of the unsold remainder {risk:,.0f}")
