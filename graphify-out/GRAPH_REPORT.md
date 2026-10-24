# Graph Report - public  (2026-10-24)

## Corpus Check
- 202 files · ~161,501 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 32 file(s) not represented in the graph (top: .csv 29, .css 2, (none) 1)

## Summary
- 730 nodes · 970 edges · 98 communities (42 shown, 56 thin omitted)
- Extraction: 78% EXTRACTED · 22% INFERRED · 0% AMBIGUOUS · INFERRED: 218 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `de3a939f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- numpy
- quant.js
- ui.js
- risk.js
- scipy
- usd
- scipy_stats
- scipy_optimize
- riskx5.js
- lab.js
- econometrics.js
- bs
- lab_risk5.js
- analytics.js
- riskx.js
- lab_more.js
- ml.js
- lab_sim.js
- lab_risk3.js
- lab_eco.js
- riskx15.js
- riskx6.js
- data.js
- lab_ml.js
- lab_opt.js
- lab_quantum.js
- riskx7.js
- lab_rates.js
- run.js
- core/tables.js
- glossary.js
- lab_risk13.js
- lab_risk6.js
- riskx12.js
- riskx17.js
- dcc.py
- lab_fan.js
- lab_risk18.js
- copfit.py
- INDEX.md
- app.js
- pycode.js
- lab_ai3.js
- lab_learn.js
- lab_perf.js
- lab_risk12.js
- lab_risk15.js
- lab_risk17.js
- lab_risk4.js
- covclean.py
- modelbench.py
- riskx21.js
- modules/data.js
- renderRates
- cds.py
- deltagamma.py
- depend.py
- ecl.py
- fair.py
- hrp
- optbook.py
- smile.py
- riskx10.js
- riskx8.js
- registry.js
- shell.js
- renderOptions
- renderTables

## God Nodes (most connected - your core abstractions)
1. `rng()` - 9 edges
2. `usd` - 8 edges
3. `eur` - 7 edges
4. `ols()` - 7 edges
5. `draw()` - 7 edges
6. `renderStart()` - 7 edges
7. `bs()` - 7 edges
8. `draw()` - 6 edges
9. `normInv()` - 6 edges
10. `assetOpts()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `saveImport()` --indirect_call--> `esc()`  [INFERRED]
  modules/import.js → core/ui.js
- `renderStart()` --indirect_call--> `byId()`  [INFERRED]
  modules/portfolio.js → core/ui.js
- `Lab` --indirect_call--> `isSim()`  [INFERRED]
  core/lab.js → core/ui.js
- `assetOptsPf()` --indirect_call--> `isSim()`  [INFERRED]
  core/lab.js → core/ui.js

## Import Cycles
- None detected.

## Communities (98 total, 56 thin omitted)

### Community 0 - "numpy"
Cohesion: 0.04
Nodes (7): stats_(), expectile(), es(), es_j(), charge(), nearest_corr(), pv()

### Community 1 - "quant.js"
Cohesion: 0.07
Nodes (31): asianMC(), barrierMC(), bondPrice(), bondYtm(), bootstrapVar(), curvePCA(), dirichlet(), eigSym() (+23 more)

### Community 2 - "ui.js"
Cohesion: 0.08
Nodes (30): ANALYSES, byId(), esc(), EXAMPLES, frame(), histChart(), LABEL, lineChart() (+22 more)

### Community 3 - "risk.js"
Cohesion: 0.13
Nodes (23): baselZone(), binomCdf(), christoffersen(), componentRisk(), cornishFisher(), esBacktest(), ewma(), ewmaFit() (+15 more)

### Community 5 - "usd"
Cohesion: 0.10
Nodes (20): from, n, policy_to, source, tenors, to, ohlcv, options (+12 more)

### Community 7 - "scipy_optimize"
Cohesion: 0.12
Nodes (10): ns(), bs(), minvar(), parity(), bs(), merton(), equations(), ns() (+2 more)

### Community 8 - "riskx5.js"
Cohesion: 0.13
Nodes (9): fairness(), groupStats(), jumpMixture(), ks2(), ols(), proxy(), psi(), rollingDrift() (+1 more)

### Community 9 - "lab.js"
Cohesion: 0.12
Nodes (6): assetOpts(), assetOptsPf(), Lab, isSim(), r16Book, rkBook

### Community 10 - "econometrics.js"
Cohesion: 0.19
Nodes (12): acf(), adf(), adfReg(), arFit(), arSelect(), breuschPagan(), engleGranger(), garchMle() (+4 more)

### Community 11 - "bs"
Cohesion: 0.17
Nodes (9): draw(), r8Bp(), r8Load(), r8Sys, bs(), d12(), impliedVol(), normCdf() (+1 more)

### Community 12 - "lab_risk5.js"
Cohesion: 0.16
Nodes (9): draw(), rzLoad(), rzRets(), rzUni, draw(), r7Fx, r7Pc(), r7Rets() (+1 more)

### Community 13 - "analytics.js"
Cohesion: 0.21
Nodes (9): closeOn(), drawdown(), duration(), interpRate(), jarqueBera(), parToZero(), presentValue(), profile() (+1 more)

### Community 14 - "riskx.js"
Cohesion: 0.16
Nodes (3): gammaDraw(), lda(), poisson()

### Community 15 - "lab_more.js"
Cohesion: 0.26
Nodes (8): draw(), frmBench, frmPair(), mxBin(), mxEs(), mxNormals(), mxPmf(), mxVar()

### Community 16 - "ml.js"
Cohesion: 0.22
Nodes (4): auc(), boost(), buildTree(), roc()

### Community 17 - "lab_sim.js"
Cohesion: 0.31
Nodes (9): clampTo(), draw(), fitGbm(), fitHeston(), fitMerton(), pcts(), rolling(), smileOf() (+1 more)

### Community 18 - "lab_risk3.js"
Cohesion: 0.27
Nodes (8): tick(), draw(), rxBook, rxCsa, rxLoad(), rxM(), rxSwap(), rxUni

### Community 19 - "lab_eco.js"
Cohesion: 0.29
Nodes (6): draw(), ecoAlign(), ecoBench, ecoLogP(), ecoP(), ecoVerdict()

### Community 21 - "riskx15.js"
Cohesion: 0.36
Nodes (9): avgCorr(), betacf(), corrStability(), fitCopulas(), golden(), ibeta(), lgam(), llT() (+1 more)

### Community 22 - "riskx6.js"
Cohesion: 0.38
Nodes (5): fitSeg(), ols2(), prefix(), scanF(), supF()

### Community 24 - "data.js"
Cohesion: 0.32
Nodes (5): isoDate(), parseCsv(), portfolioReturns(), put(), returnsOf()

### Community 25 - "lab_ml.js"
Cohesion: 0.36
Nodes (4): draw(), mlLoans(), mlP(), mlQ()

### Community 26 - "lab_opt.js"
Cohesion: 0.36
Nodes (6): chainControls, chainFor(), chainList(), chainOf(), LEGS, otmSmile()

### Community 27 - "lab_quantum.js"
Cohesion: 0.36
Nodes (6): draw(), qxBig(), qxBook, qxRows, qxTime(), qxYear()

### Community 28 - "riskx7.js"
Cohesion: 0.36
Nodes (5): binomUpper(), chi2sf(), opScenarios(), pdBacktest(), poisInv()

### Community 29 - "lab_rates.js"
Cohesion: 0.43
Nodes (6): curveOpt, draw(), goodRow(), nearestIdx(), ratesCache, ratesOf()

### Community 30 - "run.js"
Cohesion: 0.48
Nodes (6): head(), renderRun(), runProfile(), runStress(), runVar(), SCENARIOS

### Community 31 - "core/tables.js"
Cohesion: 0.53
Nodes (4): dateMode(), detect(), seriesFrom(), toNum()

### Community 32 - "glossary.js"
Cohesion: 0.40
Nodes (4): AUTO, decorate(), GLOSS, tip()

### Community 33 - "lab_risk13.js"
Cohesion: 0.47
Nodes (4): draw(), r13Px(), r13Terms, r13Zone()

### Community 34 - "lab_risk6.js"
Cohesion: 0.40
Nodes (4): draw(), rwBook, rwRets(), rwUni

### Community 36 - "riskx17.js"
Cohesion: 0.47
Nodes (3): bookGreeks(), bookGrid(), bookValue()

### Community 38 - "lab_fan.js"
Cohesion: 0.60
Nodes (4): draw(), FAN_METHODS, fanPaths(), fanStats()

### Community 39 - "lab_risk18.js"
Cohesion: 0.60
Nodes (3): draw(), r18Fmt(), r18Px()

### Community 40 - "copfit.py"
Cohesion: 0.40
Nodes (4): nll_clayton(), nll_gauss(), nll_gumbel(), nll_t()

### Community 41 - "INDEX.md"
Cohesion: 0.40
Nodes (3): Python code of the Risk Hub modules, Python code, Risk Hub

### Community 43 - "app.js"
Cohesion: 0.67
Nodes (3): loadModule(), modLoaded, route()

### Community 44 - "pycode.js"
Cohesion: 0.83
Nodes (3): callEngine(), init(), runRemote()

### Community 46 - "lab_ai3.js"
Cohesion: 0.67
Nodes (3): draw(), gcFeat, gcLoad()

### Community 48 - "lab_perf.js"
Cohesion: 0.67
Nodes (3): alignedPair(), benchOpt, draw()

### Community 54 - "modelbench.py"
Cohesion: 0.50
Nodes (3): bs_terminal(), heston_terminal(), merton_terminal()

### Community 70 - "hrp"
Cohesion: 1.00
Nodes (3): hrp(), bisect(), cvar()

## Knowledge Gaps
- **56 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `isSim()` connect `lab.js` to `ui.js`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **Should `numpy` be split into smaller, more focused modules?**
  _Cohesion score 0.04281567489114659 - nodes in this community are weakly interconnected._
- **Should `quant.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06976744186046512 - nodes in this community are weakly interconnected._
- **Should `ui.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07564102564102564 - nodes in this community are weakly interconnected._
- **Should `risk.js` be split into smaller, more focused modules?**
  _Cohesion score 0.12962962962962962 - nodes in this community are weakly interconnected._
- **Should `scipy` be split into smaller, more focused modules?**
  _Cohesion score 0.09971509971509972 - nodes in this community are weakly interconnected._
- **Should `usd` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._