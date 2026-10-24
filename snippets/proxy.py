# Removing a sensitive variable does not remove its effect (proxy discrimination)
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

rho, bx, bz, noise = @@rho=0.6@@, @@bx=0.5@@, @@bz=0.4@@, @@noise=1@@
N = 5000; rng = np.random.default_rng(9)
z = (rng.random(N) < 0.5).astype(float)                                       # protected group
zs = (z - z.mean()) / z.std()
x = rho * zs + np.sqrt(1 - rho**2) * rng.standard_normal(N)                    # proxy correlated with the group
y = bx * x + bz * z + noise * rng.standard_normal(N)
ols = lambda *cols: np.linalg.lstsq(np.c_[np.ones(N), *cols], y, rcond=None)[0]
full, noz = ols(x, z), ols(x)
print(f"with the group   : proxy coefficient {full[1]:.3f} (true {bx})  group {full[2]:.3f} (true {bz})")
print(f"without the group: proxy coefficient {noz[1]:.3f}   <- inflated by omitted-variable bias")
pred = noz[0] + noz[1] * x
print(f"gap in predictions between groups despite removing z: {pred[z == 1].mean() - pred[z == 0].mean():+.3f}  (gap in outcomes {y[z == 1].mean() - y[z == 0].mean():+.3f})")
