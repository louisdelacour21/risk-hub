"""Python riskx == JavaScript, on the fixture written by make_fixture_riskx.js. Run from site/engine: python tests/test_riskx.py"""
import json, math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import riskx as X

F = json.load(open(os.path.join(os.path.dirname(__file__), "fixture_riskx.json")))
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



def lda_check(res, f, tag):
    same(res["mean"], f["mean"], tag + ".mean"); same(res["meanSev"], f["meanSev"], tag + ".meanSev"); same(res["countMean"], f["countMean"], tag + ".countMean")
    same(res["sorted"], f["sorted"], tag + ".sorted")
    same([X.lda_var(res, p) for p in (0.5, 0.99, 0.999)], f["v"], tag + ".var"); same([X.lda_es(res, p) for p in (0.9, 0.99)], f["es"], tag + ".es")
    same(None if f["sla"] is None else [X.lda_sla(res, p) for p in (0.99, 0.999)], f["sla"], tag + ".sla")


for i, (o, f) in enumerate(zip(F["ldaIn"], F["lda"])):
    lda_check(X.lda(o), f, f"lda{i}")
R = X.Rng(3)
same([[X.poisson(R, l) for _ in range(8)] for l in (3, 40, 0.5)], F["pois"], "poisson"); same([[X.gamma_draw(R, a) for _ in range(5)] for a in (0.5, 2, 7)], F["gam"], "gammaDraw")
same(X.merton_eq(120, 100, 0.03, 1.5, 0.25), F["meq"], "mertonEq")
m = X.merton(40, 0.5, 60, 0.03, 2)
same(m, F["merton"], "merton"); same([X.merton_dd(m, 0.05), X.merton_dd(m, -0.02)], F["dd"], "merton.dd")
same([X.vas_bond(0.03, 5, 0.2, 0.04, 0.01), X.vas_bond(0.03, 0, 0.2, 0.04, 0.01)], F["vb"], "vasBond")
for i, (o, f) in enumerate(zip(F["swIn"], F["sw"])):
    same(X.swap_xva(o), f, f"swapXva{i}", 1e-8)
same(X.frtb_es(F["rets"], [100, 200, 50], [10, 40, 120]), F["frtb"], "frtbEs"); same(X.LHS, F["LHS"], "LHS")
hq = {"l1": 100, "l2a": 60, "l2b": 40}; outs = {"retail_stable": 200, "corp_non": 80, "lines": 50, "fin": 10}; ins = {"loans": 60, "reverse": 20}
same([X.lcr(hq, outs, ins), X.lcr(hq, outs, ins, 2), X.lcr({"l1": 10, "l2a": 0, "l2b": 0}, {}, ins)], F["lcr"], "lcr")
same([X.nsfr({"cap": 50, "ret_stable": 200, "wh_op": 80}, {"hq1": 50, "mort": 100, "corp": 120, "off": 30}), X.nsfr({"cap": 1}, {})], F["nsfr"], "nsfr")
cov = F["cov"]
same(X.reverse_stress(cov, [0.4, 0.3, 0.2, 0.1], 0.15), F["rs"], "reverseStress"); same(X.hrp(cov), F["hrp"], "hrp"); same(X.long_only(cov, [0.3, -0.1, 0.5, 0.3]), F["lo"], "longOnly")
same([X.irb_rw(0.02, 0.45, 3, k) for k in ("corp", "mortgage", "qrre", "retail")], F["irb"], "irbRw"); same(X.irb_rw(0, 0.45, 1), F["irb2"], "irbRw0")
same(X.TRANS, F["TRANS"], "TRANS"); same(X.RATINGS, F["RATINGS"], "RATINGS"); same([[a, b, c] for a, b, c in X.LCR_OUT], F["LCR_OUT"], "LCR_OUT"); same([[a, b, c] for a, b, c in X.NSFR_RSF], F["NSFR_RSF"], "NSFR_RSF")
same(X.mat_mul(X.TRANS, X.TRANS), F["mm"], "matMul"); cp = X.cum_pd(X.TRANS, 5); same(cp, F["cp"], "cumPd")
pdc = [r[3] for r in cp]
same([X.ecl_cum(pdc, 0.45, 1000, 0.04, s) for s in (1, 2, 3)], F["ecl"], "eclCum")

print("riskx.py matches riskx.js" if not bad else f"{bad} differences")
sys.exit(1 if bad else 0)
