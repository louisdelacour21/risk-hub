'use strict';
/* Risk-profile, stress and discounting analytics, added to Risk (after risk.js). Simple returns: 0.01 = +1%. */
(function (root) {
  const Risk = root.Risk || require('./risk.js');
  const sum = (a) => a.reduce((s, x) => s + x, 0);

  function drawdown(returns) {                        // "underwater" curve: loss since the previous peak
    let peak = 1, v = 1, worst = 0, wi = 0, pi = 0, pk = 0;
    const dd = returns.map((r, i) => { v *= 1 + r; if (v > peak) { peak = v; pk = i; } const d = v / peak - 1; if (d < worst) { worst = d; wi = i; pi = pk; } return d; });
    return { series: dd, max: worst, trough: wi, peak: pi };
  }
  function worstWindows(returns, k) {                 // worst compounded return over k consecutive days
    let best = { ret: Infinity, end: -1 };
    for (let end = k - 1; end < returns.length; end++) {
      let g = 1; for (let i = end - k + 1; i <= end; i++) g *= 1 + returns[i];
      if (g - 1 < best.ret) best = { ret: g - 1, end };
    }
    return { ret: best.ret, start: best.end - k + 1, end: best.end };
  }
  function rollingVol(returns, w, ann = 252) {        // rolling annualised volatility (null until the window is full)
    return returns.map((_, i) => (i + 1 < w ? null : Risk.std(returns.slice(i + 1 - w, i + 1)) * Math.sqrt(ann)));
  }
  function jarqueBera(returns) {                      // normality test: H0 = Gaussian returns
    const { skew, exkurt } = Risk.moments(returns), n = returns.length, jb = n / 6 * (skew * skew + exkurt * exkurt / 4);
    return { jb, p: Risk.chi2sf2(jb) };
  }
  function histogram(returns, bins = 60) {            // frequencies + normal density with the same mean and standard deviation
    const { mean, std } = Risk.moments(returns), lo = mean - 6 * std, hi = mean + 6 * std, w = (hi - lo) / bins, counts = new Array(bins).fill(0);
    let out = 0;
    for (const r of returns) { const k = Math.floor((r - lo) / w); if (k >= 0 && k < bins) counts[k]++; else out++; }
    const n = returns.length;
    return { lo, w, density: counts.map((c) => c / n / w), normal: counts.map((_, i) => Risk.normPdf((lo + (i + 0.5) * w - mean) / std) / std), outside: out };
  }
  function profile(returns, ann = 252) {
    const m = Risk.moments(returns), dd = drawdown(returns), jb = jarqueBera(returns);
    const sorted = returns.slice().sort((a, b) => a - b);
    const beyond = returns.filter((r) => Math.abs(r - m.mean) > 2 * m.std).length / returns.length;
    return { n: returns.length, annVol: m.std * Math.sqrt(ann), annRet: m.mean * ann, skew: m.skew, exkurt: m.exkurt, dd, jb, best: sorted[sorted.length - 1], worst: sorted[0], beyond2: beyond };
  }
  function periodsPerYear(dates) {                // observations per year, from the calendar span of the data (252 when dates are unknown)
    if (!dates || dates.length < 2) return 252;
    const years = (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / (365.25 * 864e5);
    return years > 0 ? Math.round((dates.length - 1) / years) : 252;
  }
  const shock = (value, pct) => value * pct;          // loss from an instant shock on the portfolio value

  function closeOn(asset, date) {                     // last close on or before `date`; null when the series does not cover it (or has a gap of more than 7 days there)
    const d = asset.dates; if (!d || d[0] > date || d[d.length - 1] < date) return null;
    let lo = 0, hi = d.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (d[m] <= date) lo = m; else hi = m - 1; }
    return (Date.parse(date) - Date.parse(d[lo])) / 864e5 > 7 ? null : asset.close[lo];
  }
  function scenarioReturn(assets, weights, from, to) { // buy-and-hold from the close of `from` to the close of `to`, initial weights normalised to 100%; null if any asset lacks data
    const tot = weights.reduce((a, b) => a + b, 0), parts = [];
    for (const [i, a] of assets.entries()) {
      const c0 = closeOn(a, from), c1 = closeOn(a, to); if (c0 == null || c1 == null) return null;
      const w = weights[i] / tot, ret = c1 / c0 - 1; parts.push({ id: a.id, name: a.name, w, ret, contrib: w * ret });
    }
    return { ret: parts.reduce((x, y) => x + y.contrib, 0), parts };
  }

  const TENOR_YEARS = [0.25, 0.5, 0.75, 1, 2, 3, 5, 7, 10, 15, 20, 30];
  function interpRate(years, rates, t) {              // linear interpolation of zero rates, flat beyond the ends
    if (t <= years[0]) return rates[0];
    const n = years.length - 1; if (t >= years[n]) return rates[n];
    let i = 1; while (years[i] < t) i++;
    return rates[i - 1] + (rates[i] - rates[i - 1]) * (t - years[i - 1]) / (years[i] - years[i - 1]);
  }
  function presentValue(flows, years, rates, shift = 0) {   // rates as decimals, continuous compounding: DF = exp(-r t)
    const rows = flows.map((f) => { const r = interpRate(years, rates, f.t) + shift, df = Math.exp(-r * f.t); return { ...f, r, df, pv: f.amount * df }; });
    return { pv: sum(rows.map((x) => x.pv)), rows };
  }
  function duration(flows, years, rates) {            // effective duration: -dPV/PV per unit of rate, central difference with a 1 bp bump
    const up = presentValue(flows, years, rates, 0.0001).pv, dn = presentValue(flows, years, rates, -0.0001).pv, mid = presentValue(flows, years, rates).pv;
    return (dn - up) / (2 * mid * 0.0001);
  }

  function parToZero(years, parPct) {                 // par yields (semi-annual, in %) -> continuously compounded zero rates (decimals) by bootstrapping; maturities up to 6 months use simple discounting. shortcut: longer maturities must be multiples of 0.5 year (true for the Treasury tenors used), upgrade if a curve has a 9-month point
    const par = parPct.map((x) => x / 100), df = [0], T = years[years.length - 1];
    let annuity = 0;
    for (let k = 1; k * 0.5 <= T + 1e-9; k++) {
      const c = interpRate(years, par, k * 0.5) / 2, d = k === 1 ? 1 / (1 + c) : (1 - c * annuity) / (1 + c);
      df[k] = d; annuity += d;
    }
    return years.map((t, i) => -Math.log(t <= 0.5 + 1e-9 ? 1 / (1 + par[i] * t) : df[Math.round(t * 2)]) / t);
  }

  const api = { periodsPerYear, parToZero, drawdown, worstWindows, rollingVol, jarqueBera, histogram, profile, shock, closeOn, scenarioReturn, sum, TENOR_YEARS, interpRate, presentValue, duration };
  Object.assign(Risk, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
