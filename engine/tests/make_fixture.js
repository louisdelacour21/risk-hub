// Writes engine/tests/fixture_risk.json from the JavaScript engine: inputs and the outputs Python must reproduce.
const fs = require('fs'), path = require('path'), R = require('../../risk.js');
const r = R.simulate(800), w = r.slice(0, 500), out = { sim: r.slice(0, 40), cases: [] };
for (const conf of [0.95, 0.99]) for (const m of Object.keys(R.METHODS)) out.cases.push({ method: m, conf, win: 500, res: R.METHODS[m](w, conf) });
const bt = R.rollingBacktest(r, 'historical', 0.99, 250), x = bt.hit.reduce((s, v) => s + v, 0);
out.bt = { n: bt.t.length, hits: x, var: bt.var.slice(0, 20), hit: bt.hit };
out.kupiec = R.kupiec(bt.t.length, x, 0.01); out.chr = R.christoffersen(bt.hit, 0.01); out.zone = R.baselZone(250, 5, 0.01);
out.inv = [0.001, 0.02, 0.3, 0.5, 0.97, 0.999].map((p) => [p, R.normInv(p)]);
out.es = R.esBacktest(r, bt, 0.01);
out.hor = R.horizonVar(w, 0.99, 10);
const iv = r.map((x, i) => (i % 7 === 3 ? null : 0.4 + 0.2 * Math.abs(Math.sin(i / 9)))); out.ivb = R.ivBacktest(r, iv, 0.99, 365); out.iv = iv;
const parts = [{ r: r.slice(0, 600), w: 0.5 }, { r: r.slice(100, 700).map((x, i) => 0.6 * x + 0.4 * r[i]), w: 0.3 }, { r: r.slice(50, 800).map((x) => 1.5 * x), w: 0.2 }];
out.comp = R.componentRisk(parts, 0.99, 500); out.compIn = parts;
fs.writeFileSync(path.join(__dirname, 'fixture_risk.json'), JSON.stringify(out));
console.log('fixture ok', out.cases.length, 'cases');
