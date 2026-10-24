# Funding wall: maturing debt against the liquidity buffer
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

buf, cf = @@buf=100@@, @@cf=0.5@@                                   # buffer, share of maturing funding that can be rolled
mat = np.array([@@o1=40@@, @@o2=60@@, @@o3=50@@, @@o4=30@@, @@o5=20@@])
months = ["M1", "M2", "M3", "M4", "M5"]
b = buf
for m, o in zip(months, mat):
    b = b - o * (1 - cf)                                                      # only the non-rolled part drains the buffer
    print(f"{m}: maturing {o:6.1f}  buffer left {b:7.1f}  {'SHORTFALL' if b < 0 else ''}")
