# Autocorrelation, AR(1) and normality tests
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
# pip install statsmodels
import numpy as np
from statsmodels.tsa.stattools import acf
from statsmodels.stats.diagnostic import acorr_ljungbox
from scipy import stats

@@RETS@@
L = @@lags=25@@
print("ACF of returns :", np.round(acf(r, nlags=5)[1:], 3))
print("ACF of squares :", np.round(acf(r**2, nlags=5)[1:], 3), "  <- volatility clustering")
print(acorr_ljungbox(r**2, lags=[L]))
phi = np.corrcoef(r[1:], r[:-1])[0, 1]
print("AR(1) coefficient:", phi)
print("Jarque-Bera:", stats.jarque_bera(r), " skew", stats.skew(r), " excess kurtosis", stats.kurtosis(r))
