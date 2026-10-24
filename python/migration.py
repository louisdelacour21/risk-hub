# Rating migration: multi-year transition matrix and cumulative PD
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

# One-year transition matrix (AAA..CCC, D). Replace by your own estimates.
P = np.array([[.9081, .0833, .0068, .0006, .0012, 0, 0, 0],
              [.0070, .9065, .0779, .0064, .0006, .0013, .0002, 0.0001],
              [.0009, .0227, .9105, .0552, .0074, .0026, .0001, .0006],
              [.0002, .0033, .0595, .8693, .0530, .0117, .0112, .0518 * 0 + .0018],
              [.0003, .0014, .0067, .0773, .8053, .0884, .0100, .0106],
              [0, .0011, .0024, .0043, .0648, .8346, .0407, .0521],
              [.0022, 0, .0022, .0130, .0238, .1124, .6486, .1978],
              [0, 0, 0, 0, 0, 0, 0, 1.0]])
P = P / P.sum(axis=1, keepdims=True)                                # make rows sum to one
H, st = 5, 3                                 # horizon, starting rating index
PH = np.linalg.matrix_power(P, int(H))
print("cumulative default probability by rating after", H, "years:", np.round(PH[:, -1], 4))
print("distribution for rating", st, ":", np.round(PH[int(st)], 4))
