# Model validation sheet (SR 11-7): tier, findings and review frequency
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

scores = {"materiality": @@materiality=4@@, "complexity": @@complexity=3@@, "uncertainty": @@uncertainty=3@@, "reliance": @@reliance=4@@}   # 1 to 5
weights = {"materiality": 0.4, "complexity": 0.2, "uncertainty": 0.2, "reliance": 0.2}
score = sum(scores[k] * weights[k] for k in scores)
tier, months = (1, 12) if score >= 3.6 else (2, 24) if score >= 2.6 else (3, 36)
findings = {"high": 0, "medium": 2, "low": 3}                                      # open findings from the review
sev = {"high": 5, "medium": 2, "low": 1}
penalty = sum(sev[k] * c for k, c in findings.items())
rating = "unsatisfactory" if findings["high"] >= 2 or penalty >= 10 else "needs improvement" if penalty >= 4 else "satisfactory"
if rating == "unsatisfactory": months /= 2
print(f"weighted score {score:.2f} -> tier {tier}; findings penalty {penalty} -> {rating}; next full validation in {months:g} months")
