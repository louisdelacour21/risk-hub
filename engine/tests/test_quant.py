"""Python quant engine == JavaScript, on the fixture written by make_fixture_quant.js. Run from site/engine: python tests/test_quant.py"""
import json, math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import quant, options, risk

F = json.load(open(os.path.join(os.path.dirname(__file__), "fixture_quant.json")))
bad = 0
SPECIAL = {"__nan__": math.nan, "__inf__": math.inf, "__-inf__": -math.inf}


def same(a, b, tag, tol=1e-9):
    global bad
    if isinstance(b, dict):
        for k in b:
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
    elif isinstance(b, str) or a is None or b is None:
        if a != b:
            bad += 1; print("DIFF", tag, a, b)
    elif not math.isclose(a, b, rel_tol=tol, abs_tol=1e-12):
        bad += 1; print("DIFF", tag, a, b)


# ---- chunk 1: random numbers, optimiser, tails, confidence intervals, performance ----
g = quant.Rng(5)
same([g.u() for _ in range(8)], F["rng"]["u"], "rng.u", 1e-14)
same([g.n() for _ in range(8)], F["rng"]["n"], "rng.n", 1e-12)
same(quant.nelder_mead(lambda p: (1 - p[0]) ** 2 + 100 * (p[1] - p[0] ** 2) ** 2, [-1, 1], 0.3, 500), F["nm"], "nelderMead", 1e-7)
r = F["r"]; L = [-x for x in r]
e = quant.evt_tail(L, 0.9, 0.99)
same(e, {k: v for k, v in F["evt"].items() if k != "cdf"}, "evt", 1e-6)
same([quant.evt_cdf(x, e["u"], e["xi"], e["beta"], e["Nu"], len(L)) for x in (0.03, 0.05, 0.1)], F["evt"]["cdf"], "evt.cdf", 1e-6)
same(quant.hill(L, 60), F["hill"], "hill"); same(quant.mean_excess(L), F["me"], "meanExcess")
same(quant.qq_points(r)[:30], F["qq"], "qq"); same([quant.t_pdf(x, 5) for x in (0.1, 1.3, -2)], F["tpdf"], "tPdf")
same(quant.var_ci(r[:500], 0.99), F["varci"], "varCI")
same(quant.bootstrap_var(r[:300], 0.95, 80, 1), F["boot"]["iid"], "boot.iid"); same(quant.bootstrap_var(r[:300], 0.95, 80, 5), F["boot"]["blk"], "boot.blk")
b = F["b"]
same(quant.ewma_corr(r[:100], b[:100]), F["ewc"], "ewmaCorr"); same(quant.corr(r, b), F["corr"], "corr"); same(quant.vol_cone(r), F["cone"], "volCone")
same(quant.ratios(r, b, 252, 0.02), F["ratios"], "ratios"); same(quant.ratios(r), F["ratios0"], "ratios0")
same(quant.regress(r, b), F["reg"], "regress"); same(quant.rolling_beta(r[:300], b[:300], 126), F["rb"], "rollingBeta")
# ---- chunk 2: options, simulation, smiles, rates, portfolios, credit ----
c = F["c2"]
same([options.bs(S, K, 0.75, 0.25, 0.03, 0.01, k) for k, S, K in (("C", 100, 95), ("P", 100, 95), ("C", 100, 110))], c["bs"], "bs", 1e-12)
same(options.bs(100, 90, 0, 0.2, 0.03, 0, "C"), c["bsEdge"], "bsEdge")
same([options.implied_vol(p, 100, 95, 0.75, 0.03, 0.01, "C") for p in (9.5, 0.2, 40)], c["iv"], "impliedVol", 1e-9)
same([options.iv_at(c["ivp"], k) for k in (0.4, 0.5, 0.7, 1.1, 1.3)], c["ivAt"], "ivAt")
same(options.option_scenario(100, 100, 0.5, 0.25, 0.03, 0, "C", -0.1, 0.05, 5), c["scen"], "optionScenario")
same([quant.halton(i, 2) for i in (1, 2, 5, 17)], c["halton"], "halton"); same(quant.gbm_paths(100, 0.05, 0.2, 1, 12, 4, 3, True), c["gbm"], "gbmPaths")
same([quant.mc_call(100, 105, 1, 0.2, 0.03, 0.01, 501, m, quant.Rng(7), 0.37) for m in ("plain", "antithetic", "halton", "control")], c["mc"], "mcCall")
same([quant.merton_price(100, 100, 1, 0.2, 0.03, 0, 0.8, -0.1, 0.15, "C"), quant.merton_price(100, 90, 0.5, 0.2, 0.03, 0.01, 0.4, -0.05, 0.1, "P")], c["merton"], "mertonPrice")
mp = quant.merton_paths(100, 0.06, 0.2, 0.8, -0.1, 0.15, 1, 20, 60)
same({"paths": mp["paths"][:3], "term": mp["term"]}, c["mertonPaths"], "mertonPaths")
hp = c["hp"]
same([quant.heston_call(100, 100, 1, 0.03, 0.01, hp), quant.heston_call(100, 120, 0.5, 0.03, 0, hp)], c["heston"], "hestonCall", 1e-8)
same(quant.heston_paths(100, 0.03, 0.01, hp, 1, 20, 5), c["hestonPaths"], "hestonPaths")
same(quant.ou_sim(0.5, 3, 0.1, 0.4, 1 / 252, 400)[:10], c["ouSim"], "ouSim"); same(quant.ou_fit(c["ou"], 1 / 252), c["ouFit"], "ouFit", 1e-8)
same(quant.ou_fit(list(range(400)), 1), c["ouFit2"], "ouFit(trend)")
same([quant.crr(100, 100, 1, 0.2, 0.03, 0.01, "C", 200, False), quant.crr(100, 110, 1, 0.3, 0.05, 0, "P", 200, True), quant.crr(100, 110, 1, 0.3, 0.05, 0, "P", 200, False)], c["crr"], "crr")
same([quant.geo_asian(100, 100, 1, 0.2, 0.03, 0.01, 12), quant.asian_mc(100, 100, 1, 0.2, 0.03, 0.01, 12, 400)], c["asian"], "asian")
same([quant.down_out_call(100, 100, 85, 1, 0.2, 0.03, 0.01), quant.down_out_call(80, 100, 85, 1, 0.2, 0.03, 0.01), quant.barrier_mc(100, 100, 85, 1, 0.2, 0.03, 0.01, 50, 300)], c["barrier"], "barrier")
same(quant.greeks2(100, 105, 0.5, 0.25, 0.03, 0.01), c["g2"], "greeks2")
sv = quant.svi_fit(c["sp"], 0.5)
same({**sv, "vol": [quant.svi_vol(k, sv, 0.5) for k in (-0.2, 0, 0.15)]}, c["svi"], "sviFit", 1e-6)
sb = quant.sabr_fit(c["sp"], 100, 0.5, 0.7)
same({**sb, "vol": [quant.sabr_vol(100, K, 0.5, sb["al"], 0.7, sb["rho"], sb["nu"]) for K in (80, 100, 120)]}, c["sabr"], "sabrFit", 1e-6)
same([quant.sabr_vol(100, 100, 1, 0.2, 0.5, -0.3, 0.6), quant.sabr_vol(100, 90, 1, 0.2, 0.5, -0.3, 0.6)], c["sabrVol"], "sabrVol")
same(quant.density_sabr(sb, 100, 0.5), c["dens"], "density(sabr)", 1e-5); same(quant.density_svi(sv, 100, 0.5), c["densSvi"], "density(svi)", 1e-5)
same(quant.solve([[2, 1, -1], [-3, -1, 2], [-2, 1, 2]], [8, -11, -3]), c["solve"], "solve")
ns = quant.ns_fit(c["yrs"], c["yl"])
same({**ns, "at": [quant.ns_at(t, ns) for t in (0.5, 4, 15)]}, c["ns"], "nsFit", 1e-8)
same(quant.eig_sym(c["sym"]), c["eig"], "eigSym"); same(quant.curve_pca(c["ch"]), c["pca"], "curvePCA", 1e-8)
same(quant.bond_price(100, 0.05, 0.04, 7, 2), c["bond"], "bondPrice"); same(quant.bond_ytm(103.5, 100, 0.05, 7, 2), c["ytm"], "bondYtm")
cm = quant.cov_matrix(c["cols"])
same(cm, c["cm"], "covMatrix"); same(quant.pvar([0.5, 0.3, 0.2], cm), c["pvar"], "pvar")
same([quant.optimise([0.08, 0.05, 0.06], cm, "minvar"), quant.optimise([0.08, 0.05, 0.06], cm, "sharpe")], c["opt"], "optimise", 1e-8)
same(quant.risk_parity(cm), c["rp"], "riskParity")
rho = quant.irb_rho(0.02)
same({"rho": rho, "k": quant.irb_k(0.02, 0.45, rho), "vas": quant.vasicek_cdf(0.05, 0.02, 0.15)}, c["credit"], "credit")
same(quant.dcf(100, 0.08, 5, 0.02, 0.09, 50, 10), c["dcf"], "dcf")

print("quant.py matches quant.js" if not bad else f"{bad} differences")
sys.exit(1 if bad else 0)
