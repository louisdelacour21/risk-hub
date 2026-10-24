"""Python riskx5 == JavaScript, on the fixture written by make_fixture_riskx5.js. Run from site/engine: python tests/test_riskx5.py"""
import json, math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import riskx5 as X

F = json.load(open(os.path.join(os.path.dirname(__file__), "fixture_riskx5.json")))
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

r = F["r"]
for t in F["shor"]:
    same(X.shor_ecc(t["o"]), t["r"], "shor")
q = F["qd"]
same([X.qday_year(2e7, 1e3, 2025, 1.5), X.qday_year(2e7, 1e3, 2025, 1), X.qday_year(10, 1e3, 2025, 2), X.qday_prob(10, 15, 0.4), X.qday_prob(0, 15, 0.4)], q[:5], "qday"); same(X.mosca(5, 8, 15, 0.4), q[5], "mosca")
same([X.weighted_tail(list(range(1, 11)), [0.1] * 10, 0.9), X.weighted_tail([-x for x in r], [1 / 250] * 250, 0.99)], F["wt"], "weightedTail")
same([X.jump_mixture(r, 0.05, 0.3, 0.99), X.jump_mixture(r, 0, 0.3, 0.975)], F["jm"], "jumpMixture")
R2 = F["R2"]
same([X.boot_windows(R2, 30, 20, 5, 7, True), X.boot_windows(R2, 17, 10, 4, 3, False)], F["bw"], "bootWindows"); same([X.tail_beta(R2[0], R2[1], 0.05), X.tail_beta(R2[0], R2[2], 0.01)], F["tb"], "tailBeta")
P = X.population({"base0": 0.3, "base1": 0.2, "bias": -0.3, "n": 4000}); same(P, F["P"], "population"); same(X.population({"base0": 0.3, "base1": 0.2, "seed": 8, "n": 500, "share": 0.5, "sep": 1}), F["pop2"], "population2")
same(X.group_stats(P, [0.8, 0.8]), F["gs"], "groupStats"); same(X.fairness(P, [0.8, 0.8]), F["fa"], "fairness"); same([X.threshold_for(P, 1, 0.3, "sel"), X.threshold_for(P, 0, 0.6, "tpr")], F["th"], "thresholdFor")
same(X.proxy({"rho": 0.6, "bx": 1, "bz": 0.5, "noise": 1, "n": 1500}), F["px"], "proxy", 1e-8)
a, b = F["a"], F["b"]
same([X.psi(a, b), X.psi(a, b, 5), X.psi(a, a)], F["psi"], "psi"); same([X.ks2(a, b), X.ks2(a, a)], F["ks"], "ks2"); same(X.rolling_drift(r, 80, 40, 20), F["rd"], "rollingDrift")
ap = X.applicants({"n": 600}); same(ap, F["ap"], "applicants"); same(X.applicants({"n": 100, "rho": 0.2, "seed": 4}), F["ap2"], "applicants2")
W = F["W"]


def pf(x):
    s = 0
    for j, c in enumerate(W):
        s = s + c * x[j]
    return 1 / (1 + math.exp(-(-1.5 + s)))


same(X.auc_of([pf(x) for x in ap["X"]], ap["y"]), F["auc"], "aucOf"); same(X.perm_importance(pf, ap["X"], ap["y"], 3, 3), F["pi"], "permImportance")
same(X.shapley(pf, ap["X"][0], ap["X"][1:41]), F["sh"], "shapley")
same([X.model_risk(F["models"], {"s0": 0.05, "rho": 0.3, "n": 5000}), X.model_risk(F["models"], {"s0": 0.05, "rho": 0.6, "q": 0.975, "seed": 2, "n": 2000})], F["mr"], "modelRisk")

print("riskx5.py matches riskx5.js" if not bad else f"{bad} differences")
sys.exit(1 if bad else 0)
