# Q-Day as a tail event on a crypto book
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
from scipy.stats import norm

med, sg, yr, J, cf = @@med=6@@, @@sg=0.5@@, @@yr=3@@, @@J=0.5@@, @@cf=0.99@@
F = lambda t: norm.cdf((np.log(t) - np.log(med)) / sg)                      # P(Q-Day <= t), lognormal
p_year = (F(yr + 1) - F(yr)) / (1 - F(yr))                                   # Q-Day falls in the year starting at yr, given it has not happened
print(f"P(Q-Day within that year | not yet) = {p_year:.2%}")

book = {"BTC": 0.5, "ETH": 0.3, "SOL": 0.2}                                  # weights (replace by yours)
shock_btc = -0.5                                                              # Bitcoin loss if keys fall
tail_beta = {"BTC": 1.0, "ETH": 0.8, "SOL": 0.7}                              # tail dependence measured on your data (see Tail dependence module)
loss_if_qday = -sum(w * shock_btc * tail_beta[k] for k, w in book.items())
print(f"book loss if Q-Day occurs: {loss_if_qday:.1%};  expected loss over the year {p_year * loss_if_qday:.2%}")
rng = np.random.default_rng(0); N = 1_000_000
hit = rng.random(N) < p_year
loss = hit * loss_if_qday * np.exp(rng.normal(0, 0.2, N)) + (~hit) * np.abs(rng.standard_t(4, N)) * 0.01
print(f"{cf:.0%} VaR {np.quantile(loss, cf):.2%}   ES {loss[loss >= np.quantile(loss, cf)].mean():.2%}   (p_year {'above' if p_year > 1 - cf else 'below'} the tail level {1 - cf:.0%})")
