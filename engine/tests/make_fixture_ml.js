// Writes fixture_ml.json from the JavaScript: inputs and the outputs engine/ml.py must reproduce.
const fs = require('fs'), path = require('path'), R = require('../../ml.js'), M = R.ml;
const out = {}, r = R.simulate(500);
const n = 300, X = Array.from({ length: n }, (_, i) => [r[i] * 50, Math.sin(i / 9), r[i + 1] * 30 + Math.cos(i / 4), (i % 7) - 3]);
const yc = X.map((x, i) => x[0] * 0.8 - x[1] * 0.5 + 0.2 * x[2] + 0.3 * Math.sin(i * 1.7)), ym = yc.reduce((a, b) => a + b, 0) / n, y = yc.map((v) => v - ym);
const yb = X.map((x, i) => (x[0] + 0.7 * x[1] + 0.6 * Math.sin(i * 2.3) > 0.2 ? 1 : 0));
const st = M.colStats(X), Z = M.apply(X, st); out.X = X; out.y = y; out.yb = yb; out.st = st; out.Z = Z;
out.r2 = M.r2(y, y.map((v, i) => v + 0.1 * Math.sin(i)));
out.ridge = [M.ridge(Z, y, 0.5), M.ridge(Z, y, 20)]; out.lasso = [M.lasso(Z, y, 0.05), M.lasso(Z, y, 0.5)]; out.path = M.lassoPath(Z, y, [0.6, 0.3, 0.1, 0.02]);
const lg = M.logistic(Z, yb, 1); out.lg = { b0: lg.b0, w: lg.w, p: Z.slice(0, 6).map((x) => lg.p(x)) }; out.lg0 = (({ b0, w }) => ({ b0, w }))(M.logistic(Z, yb));
const sc = Z.map((x) => lg.p(x)); out.sc = sc; out.auc = M.auc(sc, yb); out.auc2 = M.auc(yb.map((v, i) => v + (i % 3)), yb); out.roc = M.roc(sc, yb); out.roc2 = M.roc(yb.map((v, i) => Math.round(v + (i % 3))), yb);
out.ll = M.logLoss(sc, yb); out.cal = M.calibration(sc, yb, 5);
const tr = M.treeFit(Z, yb, { maxDepth: 3, minLeaf: 15 }); out.tree = tr; out.treeP = Z.slice(0, 8).map((x) => M.treePredict(tr, x));
const bo = M.boost(Z, yb, { trees: 30, depth: 2, lr: 0.2 }); out.boostP = Z.slice(0, 8).map((x) => [bo.p(x), bo.raw(x), bo.p(x, 5)]);
out.hmmr = r.slice(0, 300); out.hmm = M.hmm(r.slice(0, 300), 2); out.hmm3 = M.hmm(r.slice(0, 300), 3, 60);
const q = M.quantReg(y, [Z.map((z) => z[0]), Z.map((z) => z[1])], 0.1); out.q = { beta: q.beta, loss: q.loss, pred: q.predict([0.5, -0.3]) };
fs.writeFileSync(path.join(__dirname, 'fixture_ml.json'), JSON.stringify(out, (k, v) => (typeof v === 'function' ? undefined : typeof v === 'number' && !Number.isFinite(v) ? (Number.isNaN(v) ? '__nan__' : v > 0 ? '__inf__' : '__-inf__') : v)));
console.log('fixture ml ok');
