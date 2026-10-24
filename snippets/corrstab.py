# Correlation stability: average pairwise correlation, calm days against crash days
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np
import pandas as pd

@@MULTI@@
df = pd.DataFrame(R, columns=list("ABCD"))
w_ = @@w=180@@
iu = np.triu_indices(4, 1)
avg = [np.corrcoef(df.iloc[t - w_:t].values.T)[iu].mean() for t in range(w_, len(df), 20)]
print("rolling average pairwise correlation: min", min(avg), "max", max(avg), "last", avg[-1])
basket = df.mean(axis=1)
worst = basket <= basket.quantile(@@f=0.1@@)
print("average correlation on the worst days:", np.corrcoef(df[worst].values.T)[iu].mean(), "| on other days:", np.corrcoef(df[~worst].values.T)[iu].mean())
