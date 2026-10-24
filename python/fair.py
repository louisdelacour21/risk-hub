# Fairness metrics for a binary decision
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

def fairness(y_true, y_pred, group):
    """Return approval rates, demographic-parity gap, equal-opportunity gap, disparate-impact ratio (group 1 vs group 0)."""
    y_true, y_pred, group = map(np.asarray, (y_true, y_pred, group))
    out = {}
    for g in (0, 1):
        m = group == g
        out[g] = dict(approval=y_pred[m].mean(), tpr=y_pred[m & (y_true == 1)].mean(), fpr=y_pred[m & (y_true == 0)].mean())
    return dict(rates=out,
                demographic_parity_gap=out[1]["approval"] - out[0]["approval"],
                equal_opportunity_gap=out[1]["tpr"] - out[0]["tpr"],
                disparate_impact=out[1]["approval"] / out[0]["approval"])

rng = np.random.default_rng(0)
group = rng.integers(0, 2, 5000)
y_true = (rng.random(5000) < np.where(group == 0, 0.7, 0.4)).astype(int)
score = y_true * 1.5 + rng.normal(size=5000) - 0.0 * group
y_pred = (score > 0.75).astype(int)
print(fairness(y_true, y_pred, group))     # four-fifths rule: disparate impact below 0.8 is a red flag
