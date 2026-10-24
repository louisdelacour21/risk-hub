"""Python riskx11 == JavaScript, on the fixture written by make_fixture_riskx11.js. Run from site/engine: python tests/test_riskx11.py"""
import json, math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import riskx11 as X

F = json.load(open(os.path.join(os.path.dirname(__file__), "fixture_riskx11.json")))
bad = 0
SPECIAL = {"__nan__": math.nan, "__inf__": math.inf, "__-inf__": -math.inf}


def same(a, b, tag, tol=1e-9):
    global bad
    if isinstance(b, dict):
        for k in b:
            if k not in a:
                bad += 1; print("MISSING", f"{tag}.{k}"); continue
            same(a[k], b[k], f"{tag}.{k}", tol)
    elif isinstance(b, list):
        if len(a) != len(b):
            bad += 1; print("LEN", tag, len(a), len(b)); return
        for i, (x, y) in enumerate(zip(a, b)):
            same(x, y, f"{tag}[{i}]", tol)
    elif b in SPECIAL if isinstance(b, str) else False:
        t = SPECIAL[b]
        if not (a == t or (t != t and a != a)):
            bad += 1; print("DIFF", tag, a, b)
    elif isinstance(b, str) or a is None or b is None or isinstance(b, bool):
        if a != b:
            bad += 1; print("DIFF", tag, a, b)
    elif not math.isclose(a, b, rel_tol=tol, abs_tol=1e-12):
        bad += 1; print("DIFF", tag, a, b)
for o, v in zip(F["kmvIn"], F["kmv"]):
    same(X.kmv(o), v, "kmv")
lr = F["lr"]
same(X.empirical(lr, 30, 1.4), F["emp"][0], "emp0")
same(X.empirical(lr, 10, 1.2, 0.05), F["emp"][1], "emp1")
same(X.migration(lr, 20, [0.4, 0.6, 0.75], 0.9), F["mig"][0], "mig0")
same(X.migration(lr, 10, [0.5, 0.7], 0.85, 0.1), F["mig"][1], "mig1")
close, vol = F["close"], F["vol"]
lr2 = [math.log(c / close[i]) for i, c in enumerate(close[1:])]
same(X.roll_vol(lr2, 10), F["rv"], "rv")
runs = [dict(), dict(mny=1.1, call=False, terms=("delta", "gamma", "vega")), dict(terms=("delta", "gamma", "vega", "theta"), T=0.2, r=0.02)]
for i, kw in enumerate(runs):
    o = X.option_pla(close, vol, **kw)
    same(o, F["opl"][i], f"opl{i}", 1e-6)
    same(X.pla(o["hpl"], o["rtpl"]), F["pla"][i], f"pla{i}", 1e-6)
for (a, b), z in zip([[0.9, 0.05], [0.75, 0.1], [0.6, 0.05], [0.9, 0.2]], F["zones"]):
    same(X.pla_zone(a, b), z, "zone")
fs = [(lambda S: max(S - 100, 0), 100, 0.5, 0.5), (lambda S: S * S / 100, 100, 0.3, 1.0), (lambda S: -max(100 - S, 0), 90, 0.5, 0.3)]
for (f, S0, w, d), v in zip(fs, F["cur"]):
    same(X.curvature(f, S0, w, d), v, "cur")
same(X.wwr_cva(paths=400, steps=6), F["wwr"][0], "wwr0", 1e-8)
same(X.wwr_cva(rho=0.5, paths=500, steps=8, pos="fwdShort", seed=5), F["wwr"][1], "wwr1", 1e-8)
same(X.wwr_cva(rho=0.8, paths=400, steps=4, pos="fwdLong"), F["wwr"][2], "wwr2", 1e-8)
x, lo = F["x"], F["lo"]
for t, v in zip([0.5, 0.05, 0.95, 0.01], F["exp"]):
    same(X.expectile(x, t), v, f"exp{t}")
same([X.match_level(lo, 0.05), X.match_level(lo, 0.1)], F["ml"], "ml")
for k, v in zip([0.001, 1, 10, 50], F["sp"]):
    same(X.spectral(lo, k), v, f"sp{k}")
for a, v in zip([[5, 3, 2, 1], [1, 1, 1, 1], [-4, 10, 0, 3, 7]], F["conc"]):
    same(X.concentration(a), v, "conc")
print("OK riskx11.py matches riskx11.js" if not bad else f"{bad} differences")
sys.exit(1 if bad else 0)
