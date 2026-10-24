# Black-Scholes price, Greeks and implied volatility
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy.stats import norm
from scipy.optimize import brentq

S, K, T, r, sigma = 100.0, 100.0, 1.0, 0.03, 0.50   # spot, strike, years, rate, volatility

def bs(S, K, T, r, sigma, call=True):
    d1 = (np.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * np.sqrt(T))
    d2 = d1 - sigma * np.sqrt(T)
    if call:
        price = S * norm.cdf(d1) - K * np.exp(-r * T) * norm.cdf(d2)
        delta, theta_adj = norm.cdf(d1), -r * K * np.exp(-r * T) * norm.cdf(d2)
    else:
        price = K * np.exp(-r * T) * norm.cdf(-d2) - S * norm.cdf(-d1)
        delta, theta_adj = norm.cdf(d1) - 1, r * K * np.exp(-r * T) * norm.cdf(-d2)
    gamma = norm.pdf(d1) / (S * sigma * np.sqrt(T))
    vega = S * norm.pdf(d1) * np.sqrt(T)                       # per 1.00 of volatility
    theta = -S * norm.pdf(d1) * sigma / (2 * np.sqrt(T)) + theta_adj   # per year
    vanna = -norm.pdf(d1) * d2 / sigma
    volga = vega * d1 * d2 / sigma
    return dict(price=price, delta=delta, gamma=gamma, vega=vega, theta=theta, vanna=vanna, volga=volga)

print("call", bs(S, K, T, r, sigma, True))
print("put ", bs(S, K, T, r, sigma, False))

def implied_vol(market_price, S, K, T, r, call=True):
    return brentq(lambda s: bs(S, K, T, r, s, call)["price"] - market_price, 1e-4, 5.0)

p = bs(S, K, T, r, sigma)["price"]
print("implied vol recovered:", implied_vol(p, S, K, T, r))
