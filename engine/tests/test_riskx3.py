"""Python riskx3 == JavaScript, on the fixture written by make_fixture_riskx3.js. Run from site/engine: python tests/test_riskx3.py"""
import json, math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import riskx3 as X

F = json.load(open(os.path.join(os.path.dirname(__file__), "fixture_riskx3.json")))
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

R, w = F["R"], F["w"]
same(X.tick_loss(F["r1"], F["v"], 0.01), F["tl"], "tickLoss")
same([X.dm(F["tl"], F["tl2"], 1), X.dm(F["tl"], F["tl2"], 5)], F["dm"], "dm"); same(X.rank(F["ties"]), F["rank"], "rank")
a, b, t = F["a"], F["b"], F["ties"]
same([X.pearson(a, b), X.spearman(a, b), X.kendall(a, b), X.dcor(a, b), X.mutual_info(a, b), X.mutual_info(a, b, 5), X.kendall(t, t[::-1])], F["dep"], "dep")
sc = X.sample_cov(R); same(sc, F["sc"], "sampleCov"); same(X.ledoit_wolf(R), F["lw"], "ledoitWolf")
C = X.to_corr(sc["S"]); same(C, F["C"], "toCorr"); same(X.mp_clean(C, 260), F["mp"], "mpClean", 1e-8); same(X.eig_sym(sc["S"]), F["eig"], "eigSym", 1e-8)
same(X.from_corr(C, F["sd"]), F["fc"], "fromCorr"); lw = F["lw"]["S"]
mv = X.min_var(lw); same(mv, F["mv"], "minVar"); same(X.quad(mv, lw), F["q"], "quad"); same(X.solve(lw, [1, 2, 3, 4]), F["sol"], "solve")
dd = X.drawdowns(F["r1"]); same(dd, F["dd"], "drawdowns"); same([X.cdar(dd, 0.95), X.cdar(dd, 0.5)], F["cdar"], "cdar")
g = F["bl"]; Sg = F["Sg"]
bl = X.black_litterman(Sg, g["wm"], 2.5, 0.05, g["P"], g["Q"], g["om"])
same([bl, X.black_litterman(Sg, g["wm"], 2.5, 0.05, [], [], [])], F["blr"], "blackLitterman"); same(X.mv_weights(Sg, bl["mu"], 2.5), F["mvw"], "mvWeights")
same([X.almgren_chriss(1e6, 5, 10, 0.3, 2.5e-6, 2.5e-7, 1e-6), X.almgren_chriss(1e6, 5, 10, 0.3, 2.5e-6, 2.5e-7, 0)], F["ac"], "almgrenChriss")
same([X.contrib(R, w, 0.99), X.contrib(R, w, 0.95)], F["contrib"], "contrib"); same(X.port_var(R, w, 0.99), F["pv"], "portVar"); same(X.incremental_var(R, w, 0.99), F["iv"], "incrementalVar")
same(X.stressed_window(F["r1"], 60, 0.975), F["sw"], "stressedWindow"); same(X.rolling_es(F["r2"], 40, 0.95), F["re"], "rollingEs")
same([X.higham(F["A"]), X.higham(F["B"])], F["hg"], "higham", 1e-8)
same(X.dcc_path(F["z1"], F["z2"], 0.05, 0.9, 0.5), F["dp"], "dccPath"); same(X.dcc_fit(F["z1"], F["z2"]), F["df"], "dccFit", 1e-8)

print("riskx3.py matches riskx3.js + riskx4.js" if not bad else f"{bad} differences")
sys.exit(1 if bad else 0)
