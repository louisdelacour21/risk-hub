// Writes fixture_riskx6.json from riskx6.js: inputs and the outputs engine/riskx6.py must reproduce.
const fs = require('fs'), path = require('path'); require('../../reference_js/riskx6.js'); const Risk = require('../../reference_js/riskx.js'), X = Risk.x;
const out = {};
const so = { horizon: 90, deposits: [{ amount: 500, cap: 0.3, tau: 10 }, { amount: 300, cap: 0.5, tau: 20 }], wholesale: 200, rollover: 0.4, wholesaleLife: 60, commit: 100, draw: 0.3, loans: 900, inflow: 0.001, inflowKeep: 0.6, cash: 40, hqla: 150, haircut: 0.15 };
out.so = so; out.sv = [X.survival(so), X.survival({ ...so, cash: 1000 }), X.survival({ ...so, horizon: 0, hqla: 0, cash: 0 })];
out.lad = [X.ladder([10, 20, 30, 5], [15, 25, 10, 40], [0.5, 0, 0.9]), X.ladder([1], [2], [])];
const fo = { base: 0.004, liq: 0.012, theta: 3, T: 10, pool: 5, notional: 1e6 }; out.fo = fo; out.ftp = [X.ftp(fo), X.ftp({ ...fo, slices: 12 })]; out.curve = [0, 1, 5, 20].map((t) => X.ftp(fo).curve(t));
const r = [0.01, -0.02, 0.005, 0.03]; out.r = r; out.hd = [X.hedged(r, 0.5, -0.001), X.hedged(r, 0, 0.002), X.hedged(r, 1, 0.002)];
let s = 99; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; const nrm = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const n = 120, x = Array.from({ length: n }, () => nrm()), y = x.map((v, i) => (i < 60 ? 0.2 + 0.5 * v : -0.1 + 1.2 * v) + 0.4 * nrm()); out.x = x; out.y = y;
out.o2 = X.ols2(y, x); out.sf = [X.supF(y, x), X.supF(y, x, { trim: 0.2, B: 49, seed: 3 })]; out.cu = X.cusum(out.o2.res);
fs.writeFileSync(path.join(__dirname, 'fixture_riskx6.json'), JSON.stringify(out, (k, v) => (typeof v === 'function' ? undefined : typeof v === 'number' && !Number.isFinite(v) ? (Number.isNaN(v) ? '__nan__' : v > 0 ? '__inf__' : '__-inf__') : v)));
console.log('fixture riskx6 ok');
