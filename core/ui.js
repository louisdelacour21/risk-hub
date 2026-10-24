'use strict';
/* Shared helpers: state S, preferences, formatters, canvas charts, selection helpers, segmented control. */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pref = {
  get(k, d) { try { const v = localStorage.getItem('rh.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('rh.' + k, JSON.stringify(v)); } catch { /* storage unavailable: preferences are simply not remembered */ } },
};
const pct = (x, d = 2) => (x * 100).toFixed(d) + '%';
const fmtP = (p) => (p < 0.001 ? '<0.001' : p.toFixed(3));
const tick = () => new Promise((r) => setTimeout(r, 60));
const LABEL = { historical: 'Historical', normal: 'Normal', cornishFisher: 'Cornish-Fisher', ewma: 'EWMA (λ 0.94)', ewmaMle: 'EWMA (λ fitted)', garch: 'GARCH(1,1)', fhs: 'Filtered hist. sim.', ageWeighted: 'Age-weighted hist. (λ 0.98)', volWeighted: 'Vol-weighted hist. (Hull-White)' };
const ANALYSES = {
  var: { title: 'VaR & Expected Shortfall', sub: 'Four methods, daily out-of-sample backtest, Kupiec, Christoffersen, Basel traffic light.' },
  profile: { title: 'Risk profile', sub: 'Volatility, drawdown, fat tails and a normality test.' },
  stress: { title: 'Stress test', sub: 'Named crises replayed on your assets, your own shocks, worst windows.' },
};
const S = { assets: [], bundledUpdated: '', sel: pref.get('sel', []), weights: pref.get('weights', {}), conf: pref.get('conf', 0.99), win: pref.get('win', 500), method: pref.get('method', 'historical'), value: pref.get('value', 1000000), ccy: pref.get('ccy', 'EUR') };
const PF_ID = '__pf';
const byId = (id) => (id === PF_ID ? S.pf : S.assets.find((a) => a.id === id));
/* The portfolio built in Market Data as a virtual asset (value of 100, constant weights), so every lab that takes an asset can take it. */
async function pfAsset() {
  const list = S.sel.map((id) => S.assets.find((a) => a.id === id)).filter(Boolean); if (!list.length) throw new Error('Build a portfolio in Market Data first.');
  await Promise.all(list.map(Data.ensure));
  const p = Data.portfolioReturns(list, weightsFor(list)); let v = 100;
  S.pf = { id: PF_ID, name: list.length > 1 ? `My portfolio (${list.map((a) => a.name.split(' ')[0]).join(' / ')})` : `My portfolio (${list[0].name})`, class: 'Portfolio', kind: 'pf', dates: p.dates, close: p.dates ? p.r.map((r) => (v *= 1 + r)) : [100, ...p.r.map((r) => (v *= 1 + r))], parts: p.parts };
  return S.pf;
}
const resolveAsset = async (id) => (id === PF_ID ? pfAsset() : Data.ensure(byId(id)));
const isSim = (a) => a.kind === 'sim';
const kpi = (label, value, sub, g) => `<div class="kpi"><span>${label}${g ? tip(g) : ''}</span><b>${value}</b><small>${sub}</small></div>`;

/* ------------------------------------------------------------------ charts (plain canvas) */

function setup(cv, h) {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth;
  cv.width = W * dpr; cv.height = h * dpr; cv.style.height = h + 'px';
  const g = cv.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, W, h);
  const css = getComputedStyle(document.documentElement);
  return { g, W, H: h, col: (n) => css.getPropertyValue(n).trim() };
}
function frame(c, lo, hi, yfmt, dates, n, pad = { l: 48, r: 8, t: 8, b: 20 }) {
  const { g, W, H, col } = c, X = (i) => pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r), Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  g.font = '11px system-ui'; g.fillStyle = col('--muted'); g.strokeStyle = col('--border'); g.lineWidth = 1;
  for (let k = 0; k <= 3; k++) { const v = lo + (hi - lo) * k / 3; g.beginPath(); g.moveTo(pad.l, Y(v)); g.lineTo(W - pad.r, Y(v)); g.stroke(); g.fillText(yfmt(v), 4, Y(v) + 4); }
  if (dates) { g.textAlign = 'left'; g.fillText(dates[0], pad.l, H - 5); g.textAlign = 'right'; g.fillText(dates[dates.length - 1], W - pad.r, H - 5); g.textAlign = 'left'; }
  return { X, Y };
}
function lineChart(cv, ys, { color = '--accent', fill = false, yfmt = (v) => v.toFixed(2), dates = null, h = 220, lo = null, hi = null } = {}) {
  const c = setup(cv, h), vals = ys.filter((v) => v != null), a = lo ?? Math.min(...vals), b = hi ?? Math.max(...vals), pad = (b - a) * 0.06 || 1;
  const { X, Y } = frame(c, a - (lo == null ? pad : 0), b + (hi == null ? pad : 0), yfmt, dates, ys.length);
  const { g, col } = c; g.strokeStyle = col(color); g.lineWidth = 1.6; g.beginPath(); let first = true;
  ys.forEach((v, i) => { if (v == null) return; first ? g.moveTo(X(i), Y(v)) : g.lineTo(X(i), Y(v)); first = false; }); g.stroke();
  if (fill) { g.lineTo(X(ys.length - 1), Y(0)); g.lineTo(X(ys.findIndex((v) => v != null)), Y(0)); g.closePath(); g.globalAlpha = 0.18; g.fillStyle = col(color); g.fill(); g.globalAlpha = 1; }
}
function histChart(cv, hist) {
  const c = setup(cv, 220), n = hist.density.length, top = Math.max(...hist.density, ...hist.normal) * 1.08;
  const { X, Y } = frame(c, 0, top, () => '', null, n, { l: 8, r: 8, t: 8, b: 20 }), { g, col, W } = c, bw = (W - 16) / n;
  g.fillStyle = col('--accent'); g.globalAlpha = 0.55; hist.density.forEach((d, i) => g.fillRect(X(i) - bw / 2 + 1, Y(d), bw - 1.5, Y(0) - Y(d))); g.globalAlpha = 1;
  g.strokeStyle = col('--red'); g.lineWidth = 1.8; g.beginPath(); hist.normal.forEach((d, i) => (i ? g.lineTo(X(i), Y(d)) : g.moveTo(X(i), Y(d)))); g.stroke();
  g.fillStyle = col('--muted'); g.font = '11px system-ui'; g.fillText((hist.lo * 100).toFixed(1) + '%', 8, 214); g.textAlign = 'right'; g.fillText(((hist.lo + hist.w * n) * 100).toFixed(1) + '%', W - 8, 214); g.textAlign = 'left';
}
function varChart(cv, bt, rets, dates) {
  const c = setup(cv, 280), lim = Math.max(...bt.var, ...rets.map((x) => -x)) * 1.05, { X, Y } = frame(c, -lim, lim, (v) => (v * 100).toFixed(1) + '%', dates, bt.t.length), { g, col } = c;
  g.strokeStyle = col('--muted'); g.globalAlpha = 0.45; g.beginPath(); rets.forEach((x, i) => { g.moveTo(X(i), Y(0)); g.lineTo(X(i), Y(x)); }); g.stroke(); g.globalAlpha = 1;
  g.strokeStyle = col('--accent'); g.lineWidth = 1.8; g.beginPath(); bt.var.forEach((v, i) => (i ? g.lineTo(X(i), Y(-v)) : g.moveTo(X(i), Y(-v)))); g.stroke();
  g.fillStyle = col('--red'); bt.hit.forEach((h, i) => { if (h) { g.beginPath(); g.arc(X(i), Y(rets[i]), 3.2, 0, 7); g.fill(); } });
}
function spark(cv, close) {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = 40; cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const step = Math.max(1, Math.floor(close.length / 90)), ys = close.filter((_, i) => i % step === 0), a = Math.min(...ys), b = Math.max(...ys);
  g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(); g.lineWidth = 1.5; g.beginPath();
  ys.forEach((v, i) => { const x = i / (ys.length - 1) * (W - 2) + 1, y = H - 3 - (v - a) / (b - a || 1) * (H - 6); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
}

/* ------------------------------------------------------------------ screen 1: build a portfolio, then the analysis */

function selected() { return S.sel.map(byId).filter(Boolean); }
function toggle(id) {
  const a = byId(id), cur = selected();
  if (S.sel.includes(id)) S.sel = S.sel.filter((x) => x !== id);
  else {
    if (cur.length && isSim(cur[0]) !== isSim(a)) S.sel = [];           // simulated assets never mix with real ones
    if (S.sel.length >= 6) return;
    S.sel = [...S.sel, id];
  }
  S.weights = {};                                                      // a new composition starts from equal weights
  pref.set('sel', S.sel); pref.set('weights', S.weights); renderStart();
}
function weightsFor(list) { const w = list.map((a) => S.weights[a.id] ?? 100 / list.length); return w.some((x) => !(x > 0)) ? list.map(() => 1) : w; }

const ORDER = ['Equity indices', 'Single stocks', 'Bonds & commodities', 'FX', 'Crypto', 'Volatility', 'My data', 'Simulated'];
const PALETTE = ['#7cf0c4', '#3aa3ff', '#f5c451', '#ff8f6b', '#b48cff', '#8d8d94'];
const EXAMPLES = [['Crypto majors', { btc: 50, eth: 30, sol: 20 }], ['Euro vs dollar', { eurusd: 100 }], ['Simulated asset', { simA: 100 }]];

const seg = (id, label, opts, cur, g) => `<div class="field"><span class="lab-t">${label}${g ? tip(g) : ''}</span><div class="seg" id="${id}" role="group" aria-label="${label}">${opts.map(([v, t, dis]) => `<button data-v="${v}" aria-pressed="${String(v) === String(cur)}" ${dis ? 'disabled' : ''}>${t}</button>`).join('')}</div></div>`;

function xyChart(cv, series, { xfmt, yfmt, vline = null, h = 240 }) {
  const c = setup(cv, h), { g, W, col } = c, pad = { l: 48, r: 12, t: 10, b: 22 };
  const xs = series.flatMap((s) => s.x), ys = series.flatMap((s) => s.y), x0 = Math.min(...xs), x1 = Math.max(...xs), yl = Math.min(...ys), yh = Math.max(...ys), yp = (yh - yl) * 0.12 || 0.02;
  const X = (v) => pad.l + (v - x0) / (x1 - x0 || 1) * (W - pad.l - pad.r), Y = (v) => pad.t + (1 - (v - (yl - yp)) / (yh - yl + 2 * yp)) * (h - pad.t - pad.b);
  g.font = '11px system-ui'; g.fillStyle = col('--muted'); g.strokeStyle = col('--border'); g.lineWidth = 1;
  for (let k = 0; k <= 3; k++) { const v = yl - yp + (yh - yl + 2 * yp) * k / 3; g.beginPath(); g.moveTo(pad.l, Y(v)); g.lineTo(W - pad.r, Y(v)); g.stroke(); g.textAlign = 'left'; g.fillText(yfmt(v), 4, Y(v) + 4); }
  g.textAlign = 'center'; for (let k = 0; k <= 4; k++) { const v = x0 + (x1 - x0) * k / 4; g.fillText(xfmt(v), Math.min(Math.max(X(v), pad.l + 14), W - pad.r - 14), h - 6); } g.textAlign = 'left';
  if (vline != null) { g.setLineDash([4, 4]); g.beginPath(); g.moveTo(X(vline), pad.t); g.lineTo(X(vline), h - pad.b); g.stroke(); g.setLineDash([]); }
  series.forEach((s) => {
    g.strokeStyle = col(s.color || '--accent'); g.fillStyle = g.strokeStyle; g.lineWidth = 1.8; g.beginPath(); s.x.forEach((x, i) => (i ? g.lineTo(X(x), Y(s.y[i])) : g.moveTo(X(x), Y(s.y[i])))); g.stroke();
    if (s.dots) s.x.forEach((x, i) => { g.beginPath(); g.arc(X(x), Y(s.y[i]), 3, 0, 7); g.fill(); });
  });
}
const fmtUsd = (v) => (v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(2) : v.toFixed(4));
const num = (v, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : '–');
