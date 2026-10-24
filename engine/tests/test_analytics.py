"""Python analytics == JavaScript, on the fixture written by make_fixture_analytics.js. Run from site/engine: python tests/test_analytics.py"""
import json, math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import analytics as A

F = json.load(open(os.path.join(os.path.dirname(__file__), "fixture_analytics.json")))
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


r, d, a = F["r"], F["dates"], F["assets"]
same(A.drawdown(r), F["dd"], "drawdown"); same(A.worst_windows(r, 5), F["ww"], "worstWindows"); same(A.rolling_vol(r, 20), F["rv"], "rollingVol")
same(A.jarque_bera(r), F["jb"], "jarqueBera"); same(A.histogram(r, 40), F["hist"], "histogram"); same(A.profile(r), F["prof"], "profile")
same([A.periods_per_year(d), A.periods_per_year(None), A.periods_per_year(d[:1])], F["ppy"], "periodsPerYear")
same([A.scenario_return(a, [60, 40], d[10], d[200]), A.scenario_return(a, [1, 1], "2019-01-01", d[200])], F["sc"], "scenarioReturn")
same([A.close_on(a[0], d[50]), A.close_on(a[0], "2020-02-02"), A.close_on(a[0], "2030-01-01")], F["close"], "closeOn")
Y = A.TENOR_YEARS
z = A.par_to_zero(Y, F["par"])
fl = F["flows"]
same(z, F["zero"], "parToZero"); same([A.present_value(fl, Y, z), A.present_value(fl, Y, z, 0.01)], F["pv"], "presentValue"); same(A.duration(fl, Y, z), F["durr"], "duration")
same([A.interp_rate(Y, z, t) for t in (0.1, 0.6, 4.4, 40)], F["ir"], "interpRate"); same(A.shock(1e6, -0.2), F["shock"], "shock")

print("analytics.py matches analytics.js" if not bad else f"{bad} differences")
sys.exit(1 if bad else 0)
