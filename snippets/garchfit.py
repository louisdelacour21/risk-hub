# GARCH(1,1) / GJR-GARCH volatility fit and forecast
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
# pip install arch
import numpy as np
from arch import arch_model

@@RETS@@
am = arch_model(r * 100, vol="GARCH", p=1, o=@@=garchfit_1@@, q=1, dist="normal", mean="Constant")   # o=1 -> GJR asymmetry
res = am.fit(disp="off")
print(res.summary())
f = res.forecast(horizon=@@h=120@@)
vol = np.sqrt(f.variance.values[-1]) / 100            # daily vol forecast path
print("annualised vol, first and last forecast day:", vol[0] * np.sqrt(252), vol[-1] * np.sqrt(252))
