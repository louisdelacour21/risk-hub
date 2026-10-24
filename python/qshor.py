# Shor on elliptic curves: what the quantum machine needs (Roetteler et al. 2017 + surface code)
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

n = 256                    # curve size in bits
p = 10 ** -3                 # physical error rate
p_th = 1e-2                              # surface-code threshold
cycle = 1 * 1e-6            # error-correction cycle, seconds
gain = 1                   # assumed algorithmic improvement on the gate count
budget = 0.1                             # allowed overall failure probability

lg = np.log2(n)
logical = int(np.ceil(9 * n + 2 * lg + 10))
toffoli = (448 * n**3 * lg + 4090 * n**3) / gain

d = 3
while d < 301 and 0.1 * (p / p_th) ** ((d + 1) / 2) * logical * toffoli > budget:
    d += 2                                # smallest odd code distance meeting the budget
per_logical = 2 * d * d
physical = logical * per_logical
seconds = toffoli * d * cycle
print(f"logical qubits {logical:,}   Toffoli gates {toffoli:.3e}   code distance {d}")
print(f"physical qubits {physical:,.0f}   run time {seconds / 3600:.1f} h")
