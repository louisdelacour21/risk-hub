# Probability of default, expected loss and hazard rate
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

pd_, lgd, ead, T = 0.02, 0.45, 100, 5
hazard = -np.log(1 - pd_)                                              # constant intensity from the 1-year PD
cum = 1 - np.exp(-hazard * T)
print(f"one-year expected loss {pd_ * lgd * ead:.3f};  hazard {hazard:.4f};  cumulative PD over {T}y {cum:.2%};  {T}y expected loss {cum * lgd * ead:.3f}")
print("implied credit spread ~ PD x LGD:", pd_ * lgd * 1e4, "bp")
