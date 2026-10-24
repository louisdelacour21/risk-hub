"""Python ml == JavaScript, on the fixture written by make_fixture_ml.js. Run from site/engine: python tests/test_ml.py"""
import json, math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import ml as M

F = json.load(open(os.path.join(os.path.dirname(__file__), "fixture_ml.json")))
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


X, y, yb, Z = F["X"], F["y"], F["yb"], F["Z"]
st = M.col_stats(X)
same(st, F["st"], "colStats"); same(M.apply(X, st), Z, "apply"); same(M.r2(y, [v + 0.1 * math.sin(i) for i, v in enumerate(y)]), F["r2"], "r2")
same([M.ridge(Z, y, 0.5), M.ridge(Z, y, 20)], F["ridge"], "ridge"); same([M.lasso(Z, y, 0.05), M.lasso(Z, y, 0.5)], F["lasso"], "lasso"); same(M.lasso_path(Z, y, [0.6, 0.3, 0.1, 0.02]), F["path"], "lassoPath")
lg = M.logistic(Z, yb, 1)
same({"b0": lg["b0"], "w": lg["w"], "p": [M.logistic_p(lg, x) for x in Z[:6]]}, F["lg"], "logistic", 1e-8); same(M.logistic(Z, yb), F["lg0"], "logistic0", 1e-8)
sc = [M.logistic_p(lg, x) for x in Z]
same(M.auc(sc, yb), F["auc"], "auc", 1e-8); same(M.auc([v + i % 3 for i, v in enumerate(yb)], yb), F["auc2"], "auc ties"); same(M.roc(sc, yb), F["roc"], "roc", 1e-8)
same(M.roc([math.floor(v + i % 3 + 0.5) for i, v in enumerate(yb)], yb), F["roc2"], "roc ties")
same(M.log_loss(sc, yb), F["ll"], "logLoss", 1e-8); same(M.calibration(sc, yb, 5), F["cal"], "calibration", 1e-8)
tr = M.tree_fit(Z, yb, {"maxDepth": 3, "minLeaf": 15})
same(tr, F["tree"], "tree"); same([M.tree_predict(tr, x) for x in Z[:8]], F["treeP"], "treePredict")
bo = M.boost(Z, yb, {"trees": 30, "depth": 2, "lr": 0.2})
same([[M.boost_p(bo, x), M.boost_raw(bo, x), M.boost_p(bo, x, 5)] for x in Z[:8]], F["boostP"], "boost", 1e-8)
same(M.hmm(F["hmmr"], 2), F["hmm"], "hmm", 1e-6); same(M.hmm(F["hmmr"], 3, 60), F["hmm3"], "hmm3", 1e-6)
q = M.quant_reg(y, [[z[0] for z in Z], [z[1] for z in Z]], 0.1)
same({"beta": q["beta"], "loss": q["loss"], "pred": M.quant_predict(q, [0.5, -0.3])}, F["q"], "quantReg", 1e-6)

print("ml.py matches ml.js" if not bad else f"{bad} differences")
sys.exit(1 if bad else 0)
