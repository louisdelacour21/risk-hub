// Writes fixture_riskx2.json from the JavaScript: inputs and the outputs engine/riskx2.py must reproduce.
const fs = require('fs'), path = require('path'), Risk = require('../../riskx2.js'), X = Risk.x;
const out = {};
out.bs = [X.bs(100, 95, 1, 0.03, 0.2), X.bs(100, 95, 1, 0.03, 0.2, false), X.bs(100, 100, 0.5, 0.01, 0)];
out.iv = X.impVol(X.bs(100, 105, 0.7, 0.02, 0.27), 100, 105, 0.7, 0.02);
out.mj = X.mertonJump(100, 100, 1, 0.03, 0.2, 0.8, -0.1, 0.15);
const hp = { v0: 0.04, kappa: 1.5, theta: 0.04, xi: 0.5, rho: -0.7 }; out.hp = hp; out.h = [X.hestonCall(100, 100, 1, 0.03, hp), X.hestonCall(100, 120, 0.5, 0.01, hp)];
const ten = [1, 3, 5, 7], spr = [0.008, 0.011, 0.014, 0.015]; out.ten = ten; out.spr = spr;
const hz = X.cdsBootstrap(ten, spr, 0.03, 0.4); out.hz = hz; out.cds = [X.cdsPv(5, 0.01, hz, 0.03, 0.4), X.cdsPv(2.5, 0.012, hz, 0.03, 0.4), X.cdsPv(9, 0.012, hz, 0.03, 0.4)];
out.legs = X.cdsLegs(3, hz, 0.02, 0.4);
const loans = [{ nu: 1, p: 0.02 }, { nu: 2, p: 0.03 }, { nu: 5, p: 0.01 }, { nu: 3, p: 0.05 }, { nu: 1, p: 0.04 }]; out.loans = loans;
out.crp = [0, 0.5, 2].map((s2) => { const c = X.creditRiskPlus(loans, s2, 80); return { pmf: Array.from(c.pmf), cdf: c.cdf, mean: c.mean, mass: c.mass, el: c.el, q: [0.5, 0.99, 0.999].map(c.q), es: [0.9, 0.99].map(c.es) }; });
const tr = [{ N: 100, S: 0, E: 0.5, dir: 1, mtm: 2 }, { N: 200, S: 0, E: 4, dir: -1, mtm: -3 }, { N: 150, S: 1, E: 12, dir: 1, mtm: 5 }]; out.tr = tr;
out.sa = [X.saccr(tr), X.saccr(tr, { margined: true, mpor: 15, th: 1, mta: 0.5, collateral: 2 }), X.saccr(tr, { collateral: 3 }), X.saccr([])];
const x = { t: Array.from({ length: 25 }, (_, i) => i / 12), ee: Array.from({ length: 25 }, (_, i) => 5 * Math.sin(i / 8) + 1) }; out.x = x;
out.km = X.kvaMva(x, { r0: 0.03, sig: 0.012, rw: 0.5, hurdle: 0.1, fund: 0.005 });
fs.writeFileSync(path.join(__dirname, 'fixture_riskx2.json'), JSON.stringify(out, (k, v) => (typeof v === 'function' ? undefined : typeof v === 'number' && !Number.isFinite(v) ? (Number.isNaN(v) ? '__nan__' : v > 0 ? '__inf__' : '__-inf__') : v)));
console.log('fixture riskx2 ok');
