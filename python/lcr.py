# Liquidity Coverage Ratio (Basel III, simplified run-off rates)
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
# Stock of HQLA over net cash outflows in 30 days. Run-off / inflow rates below are the Basel III standard ones used by the lab.
l1, l2a, l2b = 100, 40, 10

stock = l1 + min(0.85 * l2a + 0.75 * l2b, l1 * 2 / 3)         # level 2 capped at 40% of the stock (= 2/3 of level 1)

outflows = {   # (amount, run-off rate)
    "retail stable":      (400, 0.05),
    "retail less stable": (150, 0.10),
    "corporate operational":     (150, 0.25),
    "corporate non-operational": (100, 0.40),
    "financial institutions":    (50, 1.00),
    "undrawn credit lines":      (150, 0.10),
}
out = sum(a * r for a, r in outflows.values())
inflow = min(50 * 0.50, 0.75 * out)                # inflows capped at 75% of outflows
net = out - inflow
print(f"HQLA {stock:.1f}  outflows {out:.1f}  inflows {inflow:.1f}  LCR {stock / net:.1%}  (minimum 100%)")
