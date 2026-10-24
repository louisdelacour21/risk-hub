# Where could my portfolio be? Bootstrap fan chart
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

@@RETS@@
yrs, goal = @@y=3@@, @@g=0.2@@
steps, paths = int(252 * yrs), 10_000
rng = np.random.default_rng(0)
sim = rng.choice(r, (paths, steps))                                  # resample the history day by day
wealth = np.cumprod(1 + sim, axis=1)
end = wealth[:, -1]
print(f"P(loss after {yrs}y): {(end < 1).mean():.1%};  P(gain >= {goal:.0%}): {(end >= 1 + goal).mean():.1%}")
print("5% / 25% / 50% / 75% / 95% quantiles of final wealth:", np.round(np.quantile(end, [.05, .25, .5, .75, .95]), 3))
print(f"average of the worst 5% outcomes: {end[end <= np.quantile(end, .05)].mean():.3f}")
