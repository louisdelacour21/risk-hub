# IFRS 9 expected credit loss, probability-weighted scenarios
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

pd_, lgd, T, eir, ead = @@pd=0.02@@, @@lgd=0.45@@, @@T=5@@, @@eir=0.05@@, 100.0
stage = @@st=1@@
scenarios = [  # (weight, PD multiplier)
    (@@=ecl_5@@, 1.0),
    (@@=ecl_6@@, @@dn=2@@),
]

def ecl(mult, years):
    """Level-principal loan of T years, annual hazard h, default mid-year, discounted at the effective rate."""
    h = min(0.999, pd_ * mult); surv = 1.0; tot = 0.0
    for t in range(1, int(min(T, years)) + 1):
        balance = ead * (1 - (t - 1) / T)
        tot += surv * h * lgd * balance * (1 + eir) ** (-(t - 0.5))
        surv *= 1 - h
    return tot

e12 = sum(w * ecl(m, 1) for w, m in scenarios)
life = sum(w * ecl(m, T) for w, m in scenarios)
out = {1: e12, 2: life, 3: lgd * ead}[stage]       # stage 3: credit-impaired, PD = 1 on the current balance
print(f"12-month ECL {e12:.3f}   lifetime ECL {life:.3f}   stage {stage} provision {out:.3f} ({out / ead:.2%} of exposure)")
