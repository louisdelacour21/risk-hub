# Python code of the Risk Hub modules

One standalone script per module (108), the same code as the app's "Python" button. Each runs on synthetic data with the module's default parameters; needs numpy, scipy, pandas (some also statsmodels, scikit-learn, arch).

| Script | What it does |
|---|---|
| [`acf.py`](acf.py) | Autocorrelation, AR(1) and normality tests |
| [`almgren.py`](almgren.py) | Almgren-Chriss optimal liquidation schedule |
| [`basisccy.py`](basisccy.py) | Cross-currency basis: cost of synthetic dollar funding |
| [`bond.py`](bond.py) | Bond price, duration and convexity |
| [`btscore.py`](btscore.py) | VaR scoring: pinball loss and Diebold-Mariano test between two methods |
| [`cdar.py`](cdar.py) | Drawdown risk: maximum drawdown and CDaR |
| [`cds.py`](cds.py) | CDS curve bootstrap: hazard rates, survival probabilities, par spreads |
| [`cdsbond.py`](cdsbond.py) | CDS-bond basis |
| [`ci.py`](ci.py) | How sure is your VaR? Order-statistic interval and bootstrap |
| [`concen.py`](concen.py) | Concentration: Herfindahl, Gini and effective number of positions |
| [`condsim.py`](condsim.py) | Conditional simulation: filtered historical simulation from a calm or stormy start |
| [`copfit.py`](copfit.py) | Fit Gaussian, t, Clayton and Gumbel copulas by maximum likelihood, compare by AIC |
| [`corr.py`](corr.py) | EWMA correlation (RiskMetrics) against sample correlation |
| [`corrstab.py`](corrstab.py) | Correlation stability: average pairwise correlation, calm days against crash days |
| [`covclean.py`](covclean.py) | Covariance cleaning: sample vs Ledoit-Wolf vs random-matrix, minimum-variance out of sample |
| [`creditul.py`](creditul.py) | Credit portfolio loss: single-factor Gaussian copula, unexpected loss and credit VaR |
| [`crplus.py`](crplus.py) | CreditRisk+: Poisson mixture with a gamma factor (analytic loss distribution) |
| [`curve.py`](curve.py) | Nelson-Siegel yield curve fit |
| [`curvfrtb.py`](curvfrtb.py) | FRTB curvature charge on an option position |
| [`cusum.py`](cusum.py) | Parameter stability: CUSUM of residuals and Chow break scan |
| [`dcc.py`](dcc.py) | DCC-GARCH: dynamic correlation between two assets |
| [`deltagamma.py`](deltagamma.py) | Option book VaR: delta-normal, delta-gamma, full revaluation |
| [`depend.py`](depend.py) | Dependence beyond Pearson: rank correlations, distance correlation, mutual information |
| [`drc.py`](drc.py) | FRTB default risk charge: jump to default, netting and hedge benefit |
| [`drift.py`](drift.py) | Population Stability Index and two-sample Kolmogorov-Smirnov drift test |
| [`ecl.py`](ecl.py) | IFRS 9 expected credit loss, probability-weighted scenarios |
| [`euler.py`](euler.py) | Euler allocation of Expected Shortfall: who owns the tail |
| [`evt.py`](evt.py) | Extreme Value Theory: peaks-over-threshold with a Generalised Pareto tail |
| [`expectile.py`](expectile.py) | Expectile and spectral risk measure |
| [`factor.py`](factor.py) | Beta, alpha and idiosyncratic risk (single-factor regression) |
| [`fair.py`](fair.py) | Fairness metrics for a binary decision |
| [`fairreal.py`](fairreal.py) | Fairness metrics on a credit scoring model |
| [`fan.py`](fan.py) | Where could my portfolio be? Bootstrap fan chart |
| [`frtb.py`](frtb.py) | FRTB internal model: Expected Shortfall 97.5% with liquidity horizons |
| [`frtbsa.py`](frtbsa.py) | FRTB standardised approach: delta capital by buckets (three correlation scenarios) |
| [`ftp.py`](ftp.py) | Funds transfer pricing: matched-maturity transfer rate and liquidity premium |
| [`fundgap.py`](fundgap.py) | Funding gap ladder: inflows, outflows and rollover |
| [`fundwall.py`](fundwall.py) | Funding wall: maturing debt against the liquidity buffer |
| [`fxhedge.py`](fxhedge.py) | FX hedge: forward cost (covered interest parity) and hedge ratio |
| [`fxvar.py`](fxvar.py) | FX VaR for a currency position |
| [`garchfit.py`](garchfit.py) | GARCH(1,1) / GJR-GARCH volatility fit and forecast |
| [`greeks2.py`](greeks2.py) | Second-order Greeks: vanna and volga |
| [`hedge.py`](hedge.py) | Minimum-variance hedge ratio and hedging effectiveness |
| [`heston.py`](heston.py) | Heston stochastic volatility: simulation, smile and Feller condition |
| [`higham.py`](higham.py) | Nearest valid correlation matrix (Higham alternating projections) |
| [`histscen.py`](histscen.py) | Historical stress episodes: the worst non-overlapping windows |
| [`hrp.py`](hrp.py) | Equal weight, minimum variance, risk parity and Hierarchical Risk Parity |
| [`irb.py`](irb.py) | Basel IRB risk-weight formula (corporate) |
| [`irrbb.py`](irrbb.py) | Interest-rate risk in the banking book: delta EVE and delta NII |
| [`jumps.py`](jumps.py) | Merton jump-diffusion: simulation and the option smile it creates |
| [`kmvcrypto.py`](kmvcrypto.py) | KMV / Merton on a crypto-backed loan: distance to default and liquidation |
| [`krd.py`](krd.py) | Key-rate DV01 and parallel / steepener / flattener shocks |
| [`kvamva.py`](kvamva.py) | KVA: cost of the capital held against a derivative over its life |
| [`lcr.py`](lcr.py) | Liquidity Coverage Ratio (Basel III, simplified run-off rates) |
| [`lda.py`](lda.py) | Operational risk: loss distribution approach (frequency x severity) |
| [`liqcrypto.py`](liqcrypto.py) | Crypto liquidity: unwinding a position against market depth and spread |
| [`ltvmig.py`](ltvmig.py) | Loan-to-value migration matrix from price history (CreditMetrics style) |
| [`lvar.py`](lvar.py) | Liquidity-adjusted VaR: exit cost from the bid-ask spread and market depth |
| [`margincall.py`](margincall.py) | Margin calls on a leveraged position: liquidation probability |
| [`mc.py`](mc.py) | Monte-Carlo paths under geometric Brownian motion |
| [`mcconv.py`](mcconv.py) | Monte-Carlo VaR: how many simulations are enough? |
| [`merton.py`](merton.py) | Merton structural model: asset value, asset volatility, distance to default, PD |
| [`migration.py`](migration.py) | Rating migration: multi-year transition matrix and cumulative PD |
| [`modelbench.py`](modelbench.py) | Model risk: the same calibration, three pricing models (Black-Scholes, Merton jumps, Heston) |
| [`mrank.py`](mrank.py) | Model risk reserve and ranking |
| [`netting.py`](netting.py) | Netting benefit and potential future exposure of a portfolio of trades |
| [`ns.py`](ns.py) | Nelson-Siegel yield curve fit |
| [`ols.py`](ols.py) | Regression with diagnostics (HAC errors, Durbin-Watson, Breusch-Pagan, Jarque-Bera) |
| [`optbook.py`](optbook.py) | Option book: Greeks and full revaluation on a spot / volatility grid |
| [`options.py`](options.py) | Black-Scholes price, Greeks and implied volatility |
| [`ou.py`](ou.py) | Ornstein-Uhlenbeck: simulation, half-life and parameter estimation |
| [`paramunc.py`](paramunc.py) | Estimation and method risk of a VaR |
| [`pca.py`](pca.py) | PCA of yield-curve changes: level, slope, curvature |
| [`pd.py`](pd.py) | Probability of default, expected loss and hazard rate |
| [`pdback.py`](pdback.py) | PD back-testing: binomial and traffic-light tests |
| [`pla.py`](pla.py) | FRTB P&L attribution test: Spearman and Kolmogorov-Smirnov |
| [`proxy.py`](proxy.py) | Removing a sensitive variable does not remove its effect (proxy discrimination) |
| [`qagile.py`](qagile.py) | Crypto-agility register: fund the migrations that cut expected loss most |
| [`qday.py`](qday.py) | Q-Day as a tail event on a crypto book |
| [`qharvest.py`](qharvest.py) | Harvest now, decrypt later: the Mosca inequality |
| [`qshor.py`](qshor.py) | Shor on elliptic curves: what the quantum machine needs (Roetteler et al. 2017 + surface code) |
| [`qvar.py`](qvar.py) | Quantile-regression VaR (regress the quantile on risk indicators) |
| [`rcsa.py`](rcsa.py) | Risk and control self-assessment: severity x frequency and aggregation with correlation |
| [`regimes.py`](regimes.py) | Two-regime Markov-switching model of returns (calm / stressed) |
| [`reverse.py`](reverse.py) | Reverse stress test: the most plausible scenario that loses L |
| [`riskbudget.py`](riskbudget.py) | Risk budgeting: contributions to portfolio volatility and VaR |
| [`run_var.py`](run_var.py) | VaR and Expected Shortfall: historical, parametric (normal), Monte-Carlo |
| [`runoff.py`](runoff.py) | Deposit run-off, liquidity buffer survival and stable funding |
| [`saccr.py`](saccr.py) | SA-CCR exposure at default (simplified, one netting set) |
| [`scorecard.py`](scorecard.py) | Credit scorecard: logistic regression, AUC, KS, score points |
| [`slope.py`](slope.py) | Yield-curve slope as a recession signal (probit) |
| [`sma.py`](sma.py) | Basel III standardised measurement approach (operational risk capital) |
| [`smile.py`](smile.py) | Black-Scholes price, Greeks and implied volatility |
| [`sqrtt.py`](sqrtt.py) | Square-root-of-time rule against actual H-day losses |
| [`sr117.py`](sr117.py) | Model validation sheet (SR 11-7): tier, findings and review frequency |
| [`stress.py`](stress.py) | Stress test: replay shocks on a portfolio |
| [`subadd.py`](subadd.py) | VaR is not subadditive, ES is: n independent defaultable loans |
| [`svar.py`](svar.py) | Stressed VaR (Basel 2.5): VaR on the worst 12 months |
| [`swapexp.py`](swapexp.py) | Expected exposure profile of an interest-rate swap |
| [`tailcop.py`](tailcop.py) | Tail dependence: Gaussian against Student-t copula |
| [`unitroot.py`](unitroot.py) | Unit roots (Augmented Dickey-Fuller) and spurious regression |
| [`vas.py`](vas.py) | Vasicek short-rate model: simulation and bond price |
| [`vasicek.py`](vasicek.py) | Vasicek: default rate distribution of a large loan pool |
| [`volcone.py`](volcone.py) | Volatility cone: today against the history at each horizon |
| [`wwrcrypto.py`](wwrcrypto.py) | Wrong-way risk on CVA: counterparty default linked to a price fall |
| [`xai.py`](xai.py) | Explaining a scoring model: permutation importance and exact Shapley values |
| [`xva.py`](xva.py) | CVA, DVA and FVA of an interest-rate swap by Monte-Carlo |
| [`xvasuite.py`](xvasuite.py) | XVA suite: CVA, DVA, FVA, MVA and KVA together |
