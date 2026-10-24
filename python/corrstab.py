# Correlation stability: average pairwise correlation, calm days against crash days
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
import pandas as pd

# Four correlated fat-tailed daily return series (replace by your own DataFrame of returns) and portfolio weights
rng = np.random.default_rng(0)
C = np.array([[1, .6, .4, .2], [.6, 1, .5, .3], [.4, .5, 1, .4], [.2, .3, .4, 1]])
R = rng.standard_t(5, (2500, 4)) @ np.linalg.cholesky(C).T * (np.array([.02, .015, .03, .01]) / np.sqrt(5 / 3))
w = np.array([.4, .3, .2, .1])

df = pd.DataFrame(R, columns=list("ABCD"))
w_ = 180
iu = np.triu_indices(4, 1)
avg = [np.corrcoef(df.iloc[t - w_:t].values.T)[iu].mean() for t in range(w_, len(df), 20)]
print("rolling average pairwise correlation: min", min(avg), "max", max(avg), "last", avg[-1])
basket = df.mean(axis=1)
worst = basket <= basket.quantile(0.1)
print("average correlation on the worst days:", np.corrcoef(df[worst].values.T)[iu].mean(), "| on other days:", np.corrcoef(df[~worst].values.T)[iu].mean())
