// Writes fixture_analytics.json from the JavaScript: inputs and the outputs engine/analytics.py must reproduce.
const fs = require('fs'), path = require('path'), R = require('../../analytics.js');
const out = {}, r = R.simulate(500);
out.r = r; out.dd = R.drawdown(r); out.ww = R.worstWindows(r, 5); out.rv = R.rollingVol(r, 20); out.jb = R.jarqueBera(r); out.hist = R.histogram(r, 40); out.prof = R.profile(r);
const dates = Array.from({ length: 300 }, (_, i) => new Date(Date.UTC(2020, 0, 1) + i * 86400000 * (i % 5 === 4 ? 3 : 1)).toISOString().slice(0, 10));
out.dates = dates; out.ppy = [R.periodsPerYear(dates), R.periodsPerYear(null), R.periodsPerYear(dates.slice(0, 1))];
const mk = (id, k) => ({ id, name: id.toUpperCase(), dates, close: dates.map((_, i) => 100 + k * i + 5 * Math.sin(i / 11)) });
const assets = [mk('a', 0.2), mk('b', -0.05)]; out.assets = assets;
out.sc = [R.scenarioReturn(assets, [60, 40], dates[10], dates[200]), R.scenarioReturn(assets, [1, 1], '2019-01-01', dates[200])];
out.close = [R.closeOn(assets[0], dates[50]), R.closeOn(assets[0], '2020-02-02'), R.closeOn(assets[0], '2030-01-01')];
const years = R.TENOR_YEARS, par = [4.1, 4.2, 4.25, 4.3, 4.1, 4.0, 4.05, 4.15, 4.3, 4.6, 4.7, 4.5]; out.par = par;
const zr = R.parToZero(years, par); out.zero = zr;
const flows = [{ t: 0.5, amount: 3 }, { t: 1, amount: 3 }, { t: 7.3, amount: 103 }]; out.flows = flows;
out.pv = [R.presentValue(flows, years, zr), R.presentValue(flows, years, zr, 0.01)]; out.durr = R.duration(flows, years, zr); out.ir = [0.1, 0.6, 4.4, 40].map((t) => R.interpRate(years, zr, t)); out.shock = R.shock(1e6, -0.2);
fs.writeFileSync(path.join(__dirname, 'fixture_analytics.json'), JSON.stringify(out, (k, v) => (typeof v === 'function' ? undefined : typeof v === 'number' && !Number.isFinite(v) ? (Number.isNaN(v) ? '__nan__' : v > 0 ? '__inf__' : '__-inf__') : v)));
console.log('fixture analytics ok');
