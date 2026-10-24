"""Python econometrics == JavaScript, on the fixture written by make_fixture_eco.js. Run from site/engine: python tests/test_eco.py"""
import json, math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import econometrics as E

F = json.load(open(os.path.join(os.path.dirname(__file__), "fixture_eco.json")))
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


r, b, walk, walk2, pct = F["r"], F["b"], F["walk"], F["walk2"], F["pct"]
sp = F["sp"]
same([E.lgamma(x) for x in (0.3, 5.5, 20)], sp["lg"], "lgamma"); same([E.t_two_sided(2.1, 12), E.t_two_sided(0.4, 3)], sp["t"], "tTwoSided")
same([E.f_sf(3.2, 2, 40), E.f_sf(0, 2, 5)], sp["f"], "fSf"); same([E.chi2_sf(5.9, 3), E.chi2_sf(0.5, 4), E.chi2_sf(30, 6)], sp["c"], "chi2Sf")
o = E.ols(r[5:], [b[5:], r[4:-1]], {"allSe": True})
same(o, F["ols"], "ols")
same(E.ols(r[5:], [b[5:]], {"robust": "hc1"}), F["olsHC"], "olsHC1"); same(E.ols(r[5:], [b[5:]], {"robust": "hac", "nw": 4}), F["olsHAC"], "olsHAC")
same(E.ols(r, [b], {"intercept": False}), F["olsNoInt"], "olsNoInt")
same(E.breusch_pagan(o, [b[5:], r[4:-1]]), F["bp"], "breuschPagan")
same([E.adf(walk), E.adf(r), E.adf(walk, {"trend": "ct", "lags": 2}), E.adf(walk, {"trend": "n", "lags": 1})], F["adf"], "adf")
same(E.engle_granger(walk2, [walk]), F["eg"], "engleGranger")
same(E.acf(r, 8), F["acf"], "acf"); same(E.pacf(r, 8), F["pacf"], "pacf")
af = E.ar_fit(pct, 2)
same(af, F["arFit"], "arFit"); same(E.ar_select(pct, 4), F["arSel"], "arSelect"); same(E.ar_forecast(pct, af, 5), F["arFc"], "arForecast")
same(E.arma_css(pct[:300], 1, 1), F["arma"], "armaCss", 1e-6)
gm = E.garch_mle(pct[:400])
same(gm, F["garch"], "garch", 1e-3); same(E.garch_forecast(gm, 5), F["garchFc"], "garch.forecast", 1e-3); same([E.garch_nic(gm, e) for e in (-2, 0, 1.5)], F["garchNic"], "garch.nic", 1e-3)
gj = E.garch_mle(pct[:400], {"gjr": True})
same(gj, F["gjr"], "gjr", 1e-3); same([E.garch_nic(gj, e) for e in (-2, 0, 1.5)], F["gjrNic"], "gjr.nic", 1e-3)
same(E.granger(r, b, 2), F["granger"], "granger")

print("econometrics.py matches econometrics.js" if not bad else f"{bad} differences")
sys.exit(1 if bad else 0)
