"""Python engine == JavaScript engine, on the fixture written by make_fixture.js. Run from site/engine: python tests/test_risk.py"""
import json, math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import risk

F = json.load(open(os.path.join(os.path.dirname(__file__), "fixture_risk.json")))
bad = 0


def same(a, b, tag, tol=1e-9):
    global bad
    if isinstance(b, dict):
        for k in b:
            same(a[k], b[k], f"{tag}.{k}", tol)
    elif isinstance(b, list):
        for i, (x, y) in enumerate(zip(a, b)):
            same(x, y, f"{tag}[{i}]", tol)
    elif isinstance(b, str) or a is None or b is None:
        if a != b:
            bad += 1; print("DIFF", tag, a, b)
    elif not math.isclose(a, b, rel_tol=tol, abs_tol=1e-12):
        bad += 1; print("DIFF", tag, a, b)


sim = risk.simulate(800)
same(sim[:40], F["sim"], "simulate", 1e-12)
w = sim[:500]
for c in F["cases"]:
    same(risk.METHODS[c["method"]](w, c["conf"]), c["res"], f"{c['method']}@{c['conf']}")
bt = risk.rolling_backtest(sim, "historical", 0.99, 250)
x = sum(bt["hit"])
same(len(bt["t"]), F["bt"]["n"], "bt.n"); same(bt["hit"], F["bt"]["hit"], "bt.hit"); same(bt["var"][:20], F["bt"]["var"], "bt.var")
same(risk.kupiec(len(bt["t"]), x, 0.01), F["kupiec"], "kupiec")
same(risk.christoffersen(bt["hit"], 0.01), F["chr"], "christoffersen")
same(risk.basel_zone(250, 5, 0.01), F["zone"], "zone")
for p, z in F["inv"]:
    same(risk.norm_inv(p), z, f"normInv({p})")
same(risk.es_backtest(sim, bt, 0.01), F["es"], "esBacktest")
same(risk.horizon_var(w, 0.99, 10), F["hor"], "horizonVar")
same(risk.iv_backtest(sim, F["iv"], 0.99, 365), F["ivb"], "ivBacktest")
same(risk.component_risk(F["compIn"], 0.99, 500), F["comp"], "componentRisk")
print("risk.py matches risk.js" if not bad else f"{bad} differences")
sys.exit(1 if bad else 0)
