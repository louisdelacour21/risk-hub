# Nearest valid correlation matrix (Higham alternating projections)
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

C = np.array([[1, 0.9, -0.9],
              [0.9, 1, 0.9],
              [-0.9, 0.9, 1]])
print("smallest eigenvalue before:", np.linalg.eigvalsh(C).min())

def nearest_corr(A, tol=1e-10, maxit=1000):
    dS = np.zeros_like(A); Y = A.copy()
    for _ in range(maxit):
        R = Y - dS
        ev, V = np.linalg.eigh(R); X = V @ np.diag(np.maximum(ev, 0)) @ V.T      # project on PSD
        dS = X - R
        Y_new = X.copy(); np.fill_diagonal(Y_new, 1.0)                              # project on unit diagonal
        if np.linalg.norm(Y_new - Y, "fro") < tol: Y = Y_new; break
        Y = Y_new
    return Y

Cn = nearest_corr(C)
print(np.round(Cn, 4)); print("smallest eigenvalue after:", np.linalg.eigvalsh(Cn).min())
