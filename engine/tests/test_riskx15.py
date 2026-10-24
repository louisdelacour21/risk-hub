"""Python riskx15 == JavaScript, on the fixture written by make_fixture_riskx15.js. Run from site/engine: python tests/test_riskx15.py"""
import json, math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import riskx15 as X

F = json.load(open(os.path.join(os.path.dirname(__file__), "fixture_riskx15.json")))
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
a, b, c = F["a"], F["b"], F["c"]
same(X.pseudo(a[:20]), F["pseudo"], "pseudo")
for (x, nu), v in zip([(0.3, 5), (-1.2, 4), (2.5, 12)], F["tc"]):
    same([X.t_cdf(x, nu), X.t_inv(0.9, nu)], v, f"t{x}", 1e-8)
same([X.lgam(x) for x in (0.3, 1.5, 7)], F["lg"], "lgam")
same(X.fit_copulas(a, b), F["fit"], "fit", 1e-7)
same([X.avg_corr([a, b, c]), X.avg_corr([a, b, c], [1, 5, 9, 20, 40, 41])], F["ac"], "ac")
same(X.corr_stability([a, b, c], 60, 0.1), F["cs"], "cs")
r = [0.01 * v for v in a]
same(X.episodes(r, 5, 3), F["ep"][0], "ep0")
same(X.episodes(r, 20, 4), F["ep"][1], "ep1")
same(X.mc_var_runs(0.001, 0.02, 0.99, 400, 5, 7), F["mc"][0], "mc0")
same(X.mc_var_runs(0, 0.03, 0.95, 250, 3, 1), F["mc"][1], "mc1")
legs = F["legs"]
same(X.book_value(legs, 102, 0.6, 0.01), F["bv"], "bv")
same(X.book_greeks(legs, 100, 0.6), F["bg"][0], "bg0", 1e-7)
same(X.book_greeks(legs, 96, 0.8, 0.02), F["bg"][1], "bg1", 1e-7)
same(X.book_grid(legs, 100, 0.6, [-0.2, -0.1, 0, 0.1, 0.2], [-0.1, 0, 0.1, 0.5], 0.01), F["bgr"], "bgr")
lr = F["lr"]
same(X.margin_calls(lr, 20, 2, 0.3), F["mcl"][0], "mcl0")
same(X.margin_calls(lr, 10, 3, 0.4), F["mcl"][1], "mcl1")
same(X.buffer_ladder([5, 10, 20, 40], 50), F["bl"][0], "bl0")
same(X.buffer_ladder([1, 2, 3], 100), F["bl"][1], "bl1")
same(X.drc(F["pos"]), F["drc"][0], "drc")
same(X.drc([]), F["drc"][1], "drc0")
for t in F["mt"]:
    same(X.model_tier(t["in"]), t["out"], "mt")
for t in F["fr"]:
    same(X.findings_rating(t["in"]), t["out"], "fr")
lr2 = F["lr2"]
ef = X.ewma_filter(lr2)
same(ef, F["ef"][0], "ef0")
same(X.ewma_filter(lr2, 0.97), F["ef"][1], "ef1")
fh = X.fhs_paths(ef["z"], ef["next"], 10, 500, 5)
same(fh, F["fh"], "fh", 1e-8)
same(X.fhs_paths(ef["z"], 0.02, 5, 300, 8, 0.9), F["fh2"], "fh2", 1e-8)
same([X.qtile(fh, 0.99), X.qtile(fh, 0.95), X.es_sorted(fh, 0.975), X.es_sorted(fh, 0.999)], F["qe"], "qe", 1e-8)
ys, zs = F["ys"], F["zs"]
book = [{"notional": 100, "flows": X.bond_flows(0.03, 5)}, {"notional": -40, "flows": X.bond_flows(0.05, 10)}, {"notional": 60, "flows": X.bond_flows(0.02, 2)}]
same(X.bond_flows(0.04, 3), F["bf"], "bf")
same(X.key_rate_dv01(book, ys, zs), F["krd"], "krd")
same(X.book_pv(book, ys, zs), F["bpv"], "bpv")
for nm, row in zip(["parallel up", "parallel down", "steepener", "flattener", "short up", "short down"], F["bsh"]):
    same([X.bcbs_shock(nm, t, X.BCBS["usd"]) for t in (0.5, 3, 10)], row, nm)
same(X.bcbs_scenarios(book, ys, zs, X.BCBS["usd"]), F["bsc"][0], "bsc0")
same(X.bcbs_scenarios(book, ys, [0.001, 0.002, 0.004, 0.006, 0.01], X.BCBS["eur"]), F["bsc"][1], "bsc1")
print("OK riskx15.py matches riskx15.js" if not bad else f"{bad} differences")
sys.exit(1 if bad else 0)
