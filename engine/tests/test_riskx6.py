"""Python riskx6 == JavaScript, on the fixture written by make_fixture_riskx6.js. Run from site/engine: python tests/test_riskx6.py"""
import json, math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import riskx6 as X

F = json.load(open(os.path.join(os.path.dirname(__file__), "fixture_riskx6.json")))
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

so = F["so"]
same([X.survival(so), X.survival({**so, "cash": 1000}), X.survival({**so, "horizon": 0, "hqla": 0, "cash": 0})], F["sv"], "survival")
same([X.ladder([10, 20, 30, 5], [15, 25, 10, 40], [0.5, 0, 0.9]), X.ladder([1], [2], [])], F["lad"], "ladder")
fo = F["fo"]
same([X.ftp(fo), X.ftp({**fo, "slices": 12})], [{k: v for k, v in d.items() if k != "curve"} for d in F["ftp"]], "ftp"); same([X.ftp_curve(fo, t) for t in (0, 1, 5, 20)], F["curve"], "ftpCurve")
r = F["r"]; same([X.hedged(r, 0.5, -0.001), X.hedged(r, 0, 0.002), X.hedged(r, 1, 0.002)], F["hd"], "hedged")
x, y = F["x"], F["y"]; o2 = X.ols2(y, x); same(o2, F["o2"], "ols2"); same([X.sup_f(y, x), X.sup_f(y, x, {"trim": 0.2, "B": 49, "seed": 3})], F["sf"], "supF"); same(X.cusum(o2["res"]), F["cu"], "cusum")

print("riskx6.py matches riskx6.js" if not bad else f"{bad} differences")
sys.exit(1 if bad else 0)
