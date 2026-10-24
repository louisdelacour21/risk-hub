'use strict';
/* Import engine: text (pasted from Excel, CSV, TSV) -> grid -> detected dataset type -> clean series.
   Pure functions, no DOM: tested under Node (test-tables.js). Types: series, curve, chain, table. */
(function (root) {
  const Data = root.Data || require('../data.js'), Risk = root.Risk || require('../risk.js');

  // "1 234,56", "1.234,56", "1,234.56", "12%", "1e-3" -> number (NaN when it is not one). A lone "1,234" is read as 1234 (thousands).
  function toNum(s) {
    if (typeof s === 'number') return s;
    let t = String(s ?? '').trim().replace(/[\s '€$£]/g, ''), pct = false;
    if (t.endsWith('%')) { pct = true; t = t.slice(0, -1); }
    if (!/^[-+]?[\d.,]*\d(e[-+]?\d+)?$/i.test(t)) return NaN;
    if (!/e/i.test(t)) {
      const d = t.lastIndexOf('.'), c = t.lastIndexOf(',');
      if (d >= 0 && c >= 0) t = d > c ? t.replace(/,/g, '') : t.replace(/\./g, '').replace(',', '.');
      else if (c >= 0) t = /^[-+]?\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
      else if (/^[-+]?\d{1,3}(\.\d{3}){2,}$/.test(t)) t = t.replace(/\./g, '');
    }
    const v = Number(t); return pct ? v / 100 : v;
  }

  function parseGrid(text) {
    text = String(text).replace(/^﻿/, '');
    const head = text.split(/\r?\n/).slice(0, 20).join('\n'), has = (c) => head.includes(c);
    const delim = has('\t') ? '\t' : has(';') ? ';' : ',';
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"' && cell === '') q = true;
      else if (ch === delim) { row.push(cell.trim()); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell.trim()); rows.push(row); }
    while (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop();
    const w = Math.max(0, ...rows.map((r) => r.length));
    return { delim, rows: rows.map((r) => Array.from({ length: w }, (_, j) => r[j] ?? '')) };
  }

  // Slash dates are ambiguous: the whole column decides (any first number > 12 -> day/month, any second > 12 -> month/day, otherwise day/month).
  const dateOf = (c, mode) => {
    const t = String(c ?? '').trim().split(/[ T]/)[0], m = t.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/);
    if (!m || !mode) return t ? Data.isoDate(t) : null;
    const [a, b] = mode === 'mdy' ? [m[2], m[1]] : [m[1], m[2]], y = m[3].length === 2 ? '20' + m[3] : m[3];
    return +b > 12 || +a > 31 || +b < 1 || +a < 1 ? null : `${y}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
  };
  function dateMode(cells) {
    let dmy = false, mdy = false;
    for (const c of cells) { const m = String(c).trim().match(/^(\d{1,2})[/.](\d{1,2})[/.]\d{2,4}/); if (m) { if (+m[1] > 12) dmy = true; if (+m[2] > 12) mdy = true; } }
    return mdy && !dmy ? 'mdy' : 'dmy';
  }
  const colName = (j) => 'Column ' + (j < 26 ? String.fromCharCode(65 + j) : j + 1);

  function detect(rows) {
    if (rows.length < 2 || !rows[0].length) return { type: 'table', names: [], body: [], dateCol: -1, numCols: [], header: false };
    const isText = (c) => c !== '' && !(Number.isFinite(toNum(c))) && !dateOf(c);
    const header = rows[0].some(isText), body = header ? rows.slice(1) : rows;
    const names = rows[0].map((c, j) => (header && c ? c : colName(j)));
    const filled = (j) => body.map((r) => r[j]).filter((c) => c !== '');
    const share = (j, f) => { const f0 = filled(j); return f0.length ? f0.filter(f).length / f0.length : 0; };
    const dateCol = rows[0].findIndex((_, j) => share(j, (c) => !!dateOf(c)) >= 0.9 && filled(j).length >= body.length * 0.5);
    const numCols = rows[0].map((_, j) => j).filter((j) => j !== dateCol && share(j, (c) => Number.isFinite(toNum(c))) >= 0.9 && filled(j).length >= body.length * 0.5);
    const low = names.map((n) => n.toLowerCase());
    const tenor = (n) => /^\d+(\.\d+)?\s*(d|w|m|mo|y|yr)?$/i.test(n.trim());
    let type = 'table';
    if (low.some((n) => n.includes('strike')) && low.some((n) => /iv|vol|price|bid|ask|mark|last/.test(n))) type = 'chain';
    else if (header && numCols.filter((j) => tenor(names[j])).length >= 3 && numCols.filter((j) => tenor(names[j])).length >= numCols.length * 0.8) type = 'curve';
    else if (dateCol >= 0 && numCols.length) type = 'series';
    return { type, header, names, body, dateCol, numCols };
  }

  // One price (or return) column of the grid -> a clean series, with what was fixed or refused.
  function seriesFrom(det, col, dateCol = det.dateCol) {
    const name = det.names[col], notes = [], errors = [];
    let pairs = [], dropped = 0;
    const mode = dateCol >= 0 ? dateMode(det.body.map((r) => r[dateCol])) : null;
    det.body.forEach((r, i) => {
      if (r[col] === '' && (dateCol < 0 || r[dateCol] === '')) return;
      const v = toNum(r[col]), d = dateCol >= 0 ? dateOf(r[dateCol], mode) : null;
      if (!Number.isFinite(v) || (dateCol >= 0 && !d)) { dropped++; return; }
      pairs.push([d, v, i]);
    });
    if (dropped) notes.push(`${dropped} row${dropped > 1 ? 's' : ''} skipped (empty or not a number / date)`);
    if (dateCol >= 0) {
      if (pairs.some((p, i) => i && p[0] < pairs[i - 1][0])) { pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[2] - b[2])); notes.push('sorted by date (oldest first)'); }
      const n0 = pairs.length; pairs = pairs.filter((p, i) => !i || p[0] !== pairs[i - 1][0]);
      if (n0 > pairs.length) notes.push(`${n0 - pairs.length} duplicate date${n0 - pairs.length > 1 ? 's' : ''} removed (the first one kept)`);
    }
    const vals = pairs.map((p) => p[1]), dates = dateCol >= 0 ? pairs.map((p) => p[0]) : null;
    if (vals.length < 300) errors.push(`${name}: ${vals.length} usable rows, at least 300 are needed for VaR`);
    if (errors.length) return { name, errors, notes };
    const asReturns = /ret/i.test(name) || !(vals.every((x) => x > 0) && Math.abs(vals.reduce((a, b) => a + b, 0) / vals.length) > 1.5);
    let close;
    if (asReturns) { const pct = Risk.std(vals) > 0.15 ? 100 : 1; let v = 100; close = [100, ...vals.slice(1).map((r) => (v *= 1 + r / pct))]; notes.push(`read as returns${pct === 100 ? ' in %' : ''}, rebuilt into a price path`); }
    else { close = vals; notes.push('read as prices'); if (vals.some((x) => x <= 0)) errors.push(`${name}: prices must be positive`); }
    const big = close.slice(1).filter((x, i) => Math.abs(x / close[i] - 1) > 0.5).length;
    if (big) notes.push(`warning: ${big} daily move${big > 1 ? 's' : ''} above 50% (split, typo or wrong unit?)`);
    if (dates) { let gap = 0; for (let i = 1; i < dates.length; i++) gap = Math.max(gap, (Date.parse(dates[i]) - Date.parse(dates[i - 1])) / 864e5); if (gap > 10) notes.push(`warning: longest gap between two dates is ${Math.round(gap)} days`); }
    return { name, dates, close, notes, errors };
  }

  const api = { toNum, parseGrid, detect, seriesFrom, dateOf, dateMode };
  root.Tables = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
