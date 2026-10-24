# Two-regime Markov-switching model of returns (calm / stressed)
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
# pip install statsmodels
import numpy as np
import statsmodels.api as sm

# Daily returns: replace the synthetic series by your own (e.g. pd.read_csv("btc.csv")["close"].pct_change().dropna().values)
rng = np.random.default_rng(0)
r = rng.standard_t(4, 2500) * 0.02 / np.sqrt(2)

K = 2
mod = sm.tsa.MarkovRegression(r[-3000:] * 100, k_regimes=K, switching_variance=True)
res = mod.fit(disp=False)
print(res.summary().tables[1])
pr = dict(zip(res.model.param_names, res.params))
sig = [np.sqrt(pr[f"sigma2[{i}]"]) for i in range(K)]
calm = int(np.argmin(sig))
print("daily vol by regime (%):", np.round(sig, 3), " probability of the stressed regime today:", 1 - res.smoothed_marginal_probabilities[-1, calm])
print("transition matrix:\n", np.round(res.regime_transition.squeeze(), 3))
