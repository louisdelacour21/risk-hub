"""Python riskx7 == JavaScript, on the fixture written by make_fixture_riskx7.js. Run from site/engine: python tests/test_riskx7.py"""
import json, math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import riskx7 as X

F = json.load(open(os.path.join(os.path.dirname(__file__), "fixture_riskx7.json")))
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
for r in F["chi"]:
    same(X.chi2sf(r["x"], r["k"]), r["v"], f"chi{r['x']},{r['k']}")
for r in F["bu"]:
    same(X.binom_upper(*r["a"]), r["v"], f"bu{r['a']}")
same(X.pd_backtest(F["pd"], F["y"]), F["pb"][0], "pb0")
same(X.pd_backtest(F["pd"], F["y"], 5), F["pb"][1], "pb1")
cb = F["cb"]
same(X.ccy_basis(cb), F["ccy"][0], "ccy0")
same(X.ccy_basis({**cb, "T": 0.5, "F": 1.09}), F["ccy"][1], "ccy1")
same(X.fwd_from_basis({"S": 1.1, "rU": 0.05, "rE": 0.03, "T": 1, "basis": -0.004}), F["fwd"], "fwd")
nb = F["nb"]
same(X.neg_basis(nb), F["nbr"][0], "nb0")
same(X.neg_basis({**nb, "cds": 0.015}), F["nbr"][1], "nb1")
for d, v in zip([0, 0.001, 0.01], F["nbw"]):
    same(X.neg_basis_widen(nb, d), v, f"nbw{d}")
same(X.op_scenarios(F["sc"], {"rho": 0.3, "sims": 3000}), F["op"][0], "op0", 1e-8)
same(X.op_scenarios(F["sc"], {"rho": 0.7, "sims": 2000, "seed": 2, "q": 0.99}), F["op"][1], "op1", 1e-8)
eo = F["eo"]
same(X.ecl(eo), F["ecl"][0], "ecl0")
same(X.ecl({**eo, "years": 1}), F["ecl"][1], "ecl1")
same(X.ecl({**eo, "mult": 3}), F["ecl"][2], "ecl2")
same(X.ecl({**eo, "mult": 60}), F["ecl"][3], "ecl3")
for st in (1, 2, 3):
    same(X.ecl_weighted({**eo, "stage": st, "scenarios": F["scn"]}), F["ew"][st - 1], f"ew{st}")
L = F["liq"]
same(X.roll(F["close"]), L["roll"], "roll")
same(X.roll(list(range(200))), L["up"], "rollup")
same(X.amihud(F["ret"], F["vol"]), L["am"], "amihud")
same(X.corwin_schultz(F["high"], F["low"]), L["cs"], "cs")
same(X.parkinson(F["high"], F["low"]), L["pk"], "pk")
for m, v in zip(("low", "medium", "high"), F["sba"]):
    same(X.sba(F["bk"], 0.4, m), v, f"sba{m}")
same(X.sba(F["bk"], 0.4), F["sba0"], "sba0")
same(X.sba_max(F["bk"], 0.4), F["sbm"][0], "sbm0")
same(X.sba_max(F["bk"], 0.9), F["sbm"][1], "sbm1")
print("OK riskx7.py matches riskx7.js" if not bad else f"{bad} differences")
sys.exit(1 if bad else 0)
