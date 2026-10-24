// Writes engine/tests/fixture_risk.json from the JavaScript engine: inputs and the outputs Python must reproduce.
const fs = require('fs'), path = require('path'), R = require('../../risk.js');
const r = R.simulate(800), w = r.slice(0, 500), out = { sim: r.slice(0, 40), cases: [] };
for (const conf of [0.95, 0.99]) for (const m of Object.keys(R.METHODS)) out.cases.push({ method: m, conf, win: 500, res: R.METHODS[m](w, conf) });
const bt = R.rollingBacktest(r, 'historical', 0.99, 250), x = bt.hit.reduce((s, v) => s + v, 0);
out.bt = { n: bt.t.length, hits: x, var: bt.var.slice(0, 20), hit: bt.hit };
out.kupiec = R.kupiec(bt.t.length, x, 0.01); out.chr = R.christoffersen(bt.hit, 0.01); out.zone = R.baselZone(250, 5, 0.01);
out.inv = [0.001, 0.02, 0.3, 0.5, 0.97, 0.999].map((p) => [p, R.normInv(p)]);
fs.writeFileSync(path.join(__dirname, 'fixture_risk.json'), JSON.stringify(out));
console.log('fixture ok', out.cases.length, 'cases');
