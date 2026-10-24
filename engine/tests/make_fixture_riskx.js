// Writes fixture_riskx.json from the JavaScript: inputs and the outputs engine/riskx.py must reproduce.
const fs = require('fs'), path = require('path'), Risk = require('../../riskx.js'), X = Risk.x;
const out = {};
const l1 = X.lda({ mu: 9, sigma: 1.6, lam: 12, n: 4000, seed: 5 }), l2 = X.lda({ mu: 9, sigma: 1.6, lam: 40, n: 3000, seed: 9, disp: 2, xi: 0.4, q: 0.85 });
const ld = (l) => ({ mean: l.mean, meanSev: l.meanSev, countMean: l.countMean, sorted: Array.from(l.sorted), v: [0.5, 0.99, 0.999].map((p) => l.var(p)), es: [0.9, 0.99].map((p) => l.es(p)), sla: l.sla ? [0.99, 0.999].map((p) => l.sla(p)) : null });
out.lda = [ld(l1), ld(l2)];
out.ldaIn = [{ mu: 9, sigma: 1.6, lam: 12, n: 4000, seed: 5 }, { mu: 9, sigma: 1.6, lam: 40, n: 3000, seed: 9, disp: 2, xi: 0.4, q: 0.85 }];
const R = Risk.rng(3); out.pois = [3, 40, 0.5].map((l) => Array.from({ length: 8 }, () => X.poisson(R, l))); out.gam = [0.5, 2, 7].map((a) => Array.from({ length: 5 }, () => X.gammaDraw(R, a)));
out.meq = X.mertonEq(120, 100, 0.03, 1.5, 0.25);
const m = X.merton(40, 0.5, 60, 0.03, 2); out.merton = (({ dd, ...r }) => r)(m); out.dd = [m.dd(0.05), m.dd(-0.02)];
out.vb = [X.vasBond(0.03, 5, 0.2, 0.04, 0.01), X.vasBond(0.03, 0, 0.2, 0.04, 0.01)];
const swIn = [{ r0: 0.03, a: 0.15, b: 0.04, sig: 0.012, T: 5, paths: 200, seed: 4, hCp: 0.02, lgdCp: 0.6, hOwn: 0.01, lgdOwn: 0.6, fund: 0.005 },
  { r0: 0.03, a: 0.15, b: 0.04, sig: 0.012, T: 3, paths: 150, seed: 8, hCp: 0.03, lgdCp: 0.6, hOwn: 0.01, lgdOwn: 0.6, fund: 0.005, pay: -1, K: 0.035, mpor: 2, thr: 0.01, omega: 0.5 }];
out.swIn = swIn; out.sw = swIn.map((o) => X.swapXva(o));
const rets = [0, 1, 2].map((k) => Risk.simulate ? Risk.simulate(300 + k * 5, 11 + k) : Array.from({ length: 300 + k * 5 }, (_, i) => 0.01 * Math.sin(i * (k + 1.3)) + 0.003 * Math.cos(i / 3)));
out.rets = rets; out.frtb = X.frtbEs(rets, [100, 200, 50], [10, 40, 120]); out.LHS = X.LHS;
const hq = { l1: 100, l2a: 60, l2b: 40 }, outs = { retail_stable: 200, corp_non: 80, lines: 50, fin: 10 }, ins = { loans: 60, reverse: 20 };
out.lcr = [X.lcr(hq, outs, ins), X.lcr(hq, outs, ins, 2), X.lcr({ l1: 10, l2a: 0, l2b: 0 }, {}, ins)];
out.nsfr = [X.nsfr({ cap: 50, ret_stable: 200, wh_op: 80 }, { hq1: 50, mort: 100, corp: 120, off: 30 }), X.nsfr({ cap: 1 }, {})];
const cov = [[0.04, 0.012, 0.006, 0.002], [0.012, 0.09, 0.02, 0.01], [0.006, 0.02, 0.0625, 0.015], [0.002, 0.01, 0.015, 0.0225]]; out.cov = cov;
out.rs = X.reverseStress(cov, [0.4, 0.3, 0.2, 0.1], 0.15); out.hrp = X.hrp(cov); out.lo = X.longOnly(cov, [0.3, -0.1, 0.5, 0.3]);
out.irb = ['corp', 'mortgage', 'qrre', 'retail'].map((k) => X.irbRw(0.02, 0.45, 3, k)); out.irb2 = X.irbRw(0, 0.45, 1);
out.TRANS = X.TRANS; out.RATINGS = X.RATINGS; out.LCR_OUT = X.LCR_OUT; out.NSFR_RSF = X.NSFR_RSF;
const mm = X.matMul(X.TRANS, X.TRANS); out.mm = mm; const cp = X.cumPd(X.TRANS, 5); out.cp = cp;
const pdc = cp.map((r) => r[3]); out.ecl = [1, 2, 3].map((s) => X.eclCum(pdc, 0.45, 1000, 0.04, s));
fs.writeFileSync(path.join(__dirname, 'fixture_riskx.json'), JSON.stringify(out, (k, v) => (typeof v === 'function' ? undefined : typeof v === 'number' && !Number.isFinite(v) ? (Number.isNaN(v) ? '__nan__' : v > 0 ? '__inf__' : '__-inf__') : v)));
console.log('fixture riskx ok');
