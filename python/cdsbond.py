# CDS-bond basis
# Risk Hub — educational code, not investment advice. Needs: pip install numpy scipy pandas
import numpy as np

z, cds, f, hc, T, wd = 150, 120, 30, 5, 5, 100   # bp, bp, funding bp, haircut %, years, widening bp
basis = cds - z
print(f"basis = CDS - bond spread = {basis:+.0f} bp  ({'negative basis: buy bond + buy protection' if basis < 0 else 'positive basis'})")
carry = (z - cds - f * (1 - hc / 100)) / 1e4                         # annual carry of the negative-basis package, funding included
print(f"carry per year {carry * 1e4:.1f} bp of notional;  over {T}y {carry * T * 1e4:.0f} bp")
dv01 = T * 0.9 / 1e4
print(f"mark-to-market if spreads widen {wd} bp together: {-0 * wd:.0f}; if only the bond widens {wd} bp: {-dv01 * wd:.4f} of notional")
