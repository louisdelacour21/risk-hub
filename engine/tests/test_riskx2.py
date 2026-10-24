"""Python riskx2 == JavaScript, on the fixture written by make_fixture_riskx2.js. Run from site/engine: python tests/test_riskx2.py"""
import json, math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import riskx2 as X

F = json.load(open(os.path.join(os.path.dirname(__file__), "fixture_riskx2.json")))
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


same([X.bs(100, 95, 1, 0.03, 0.2), X.bs(100, 95, 1, 0.03, 0.2, False), X.bs(100, 100, 0.5, 0.01, 0)], F["bs"], "bs")
same(X.imp_vol(X.bs(100, 105, 0.7, 0.02, 0.27), 100, 105, 0.7, 0.02), F["iv"], "impVol"); same(X.merton_jump(100, 100, 1, 0.03, 0.2, 0.8, -0.1, 0.15), F["mj"], "mertonJump")
hp = F["hp"]
same([X.heston_call(100, 100, 1, 0.03, hp), X.heston_call(100, 120, 0.5, 0.01, hp)], F["h"], "hestonCall", 1e-8)
hz = X.cds_bootstrap(F["ten"], F["spr"], 0.03, 0.4)
same(hz, F["hz"], "cdsBootstrap"); same([X.cds_pv(5, 0.01, hz, 0.03, 0.4), X.cds_pv(2.5, 0.012, hz, 0.03, 0.4), X.cds_pv(9, 0.012, hz, 0.03, 0.4)], F["cds"], "cdsPv"); same(X.cds_legs(3, hz, 0.02, 0.4), F["legs"], "cdsLegs")
for s2, f in zip((0, 0.5, 2), F["crp"]):
    c = X.credit_risk_plus(F["loans"], s2, 80)
    same(c, {k: f[k] for k in ("pmf", "cdf", "mean", "mass", "el")}, f"crp{s2}"); same([X.crp_q(c, p) for p in (0.5, 0.99, 0.999)], f["q"], f"crp{s2}.q"); same([X.crp_es(c, p) for p in (0.9, 0.99)], f["es"], f"crp{s2}.es")
tr = F["tr"]
same([X.saccr(tr), X.saccr(tr, {"margined": True, "mpor": 15, "th": 1, "mta": 0.5, "collateral": 2}), X.saccr(tr, {"collateral": 3}), X.saccr([])], F["sa"], "saccr")
same(X.kva_mva(F["x"], {"r0": 0.03, "sig": 0.012, "rw": 0.5, "hurdle": 0.1, "fund": 0.005}), F["km"], "kvaMva")

print("riskx2.py matches riskx2.js" if not bad else f"{bad} differences")
sys.exit(1 if bad else 0)
