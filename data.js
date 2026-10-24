'use strict';
/* Market data: catalogue (bundled series + the user's own series kept in the browser), returns, portfolio.
   No API request at visit time: public series are files of the site (data/*.csv, refreshed by a script), the user's series live in IndexedDB. */
(function (root) {
  const Risk = root.Risk || require('./risk.js');

  // ---------- CSV: optional date + price or return ----------
  const DATE = /^\d{4}-\d{2}-\d{2}|^\d{1,2}[/.]\d{1,2}[/.]\d{2,4}/;
  function isoDate(s) {
    s = s.trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/); if (!m) return null;
    const y = m[3].length === 2 ? '20' + m[3] : m[3], a = +m[1], b = +m[2];
    return a > 12 ? `${y}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}` : `${y}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;  // dd/mm when the first number exceeds 12, otherwise mm/dd
  }
  const PRICE_COLUMNS = ['adj close', 'adj_close', 'adjusted close', 'close', 'price', 'last', 'return', 'returns', 'ret', 'daily return'];
  function parseCsv(text) {
    const lines = text.split(/\r?\n/).map((line) => line.split(/[;,\t]/).map((c) => c.trim().replace(/^"|"$/g, '')));
    const isNum = (c) => !DATE.test(c) && /^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(c);
    const header = lines.find((cells) => cells.some((c) => c && !isNum(c) && !DATE.test(c)));      // first line with text that is neither a number nor a date
    const named = header ? header.map((h) => h.toLowerCase()) : [];
    const col = PRICE_COLUMNS.map((n) => named.indexOf(n)).find((i) => i >= 0);                    // prefer "Adj Close", then "Close"... over Volume, Open, High, Low
    const dates = [], vals = [];
    for (const cells of lines) {
      const nums = cells.map((c, i) => [i, c]).filter(([, c]) => isNum(c));
      if (!nums.length) continue;                                                                     // header or blank line
      const d = cells.map((c) => (DATE.test(c) ? isoDate(c) : null)).find(Boolean) || null;
      const pick = col !== undefined ? nums.find(([i]) => i === col) : nums[nums.length - 1];       // without a known header: last numeric column
      if (!pick) continue;
      dates.push(d); vals.push(Number(pick[1]));
    }
    if (vals.length < 300) throw new Error(`Only ${vals.length} numeric rows found: at least 300 are needed.`);
    const dated = dates.every(Boolean) && dates.every((d, i) => i === 0 || d > dates[i - 1]);
    const asc = dated ? dates : null;
    const looksLikeReturns = col !== undefined && named[col].startsWith('ret');
    const prices = !looksLikeReturns && vals.every((x) => x > 0) && Math.abs(vals.reduce((a, b) => a + b, 0) / vals.length) > 1.5;
    if (prices) return { dates: asc, close: vals };
    const pct = Risk.std(vals) > 0.15 ? 100 : 1;     // returns in % or in decimals
    let v = 100; const close = vals.map((r) => (v *= 1 + r / pct));
    return { dates: asc, close };
  }

  // ---------- returns ----------
  function returnsOf(asset) {                        // simple returns; with dates, each return carries the date of the day it ends
    const c = asset.close, r = [];
    for (let i = 1; i < c.length; i++) r.push(c[i] / c[i - 1] - 1);
    return { dates: asset.dates ? asset.dates.slice(1) : null, r };
  }
  function portfolioReturns(assets, weights) {       // constant weights (daily rebalancing)
    const w = weights.map((x) => x / weights.reduce((p, q) => p + q, 0));
    if (assets.length === 1) return returnsOf(assets[0]);
    if (assets.every((x) => x.dates)) {
      // Align the PRICES on the dates every asset trades, then take returns: each return then covers the same calendar interval for all assets
      // (taking returns first would mix a 1-day return with a 3-day return around holidays and weekends).
      const maps = assets.map((x) => new Map(x.dates.map((d, i) => [d, x.close[i]]))), dates = assets[0].dates.filter((d) => maps.every((m) => m.has(d)));
      if (dates.length < 301) throw new Error(`Only ${dates.length - 1} common returns between the selected assets (300 needed).`);
      const r = []; for (let i = 1; i < dates.length; i++) r.push(maps.reduce((s, m, k) => s + w[k] * (m.get(dates[i]) / m.get(dates[i - 1]) - 1), 0));
      const ret = (m) => { const o = []; for (let i = 1; i < dates.length; i++) o.push(m.get(dates[i]) / m.get(dates[i - 1]) - 1); return o; };
      return { dates: dates.slice(1), r, parts: assets.map((a, k) => ({ id: a.id, name: a.name, w: w[k], r: ret(maps[k]) })) };
    }
    const rs = assets.map(returnsOf), n = Math.min(...rs.map((x) => x.r.length));    // simulated series without dates: aligned from the end
    return { dates: null, r: Array.from({ length: n }, (_, i) => rs.reduce((s, x, k) => s + w[k] * x.r[x.r.length - n + i], 0)), parts: assets.map((a, k) => ({ id: a.id, name: a.name, w: w[k], r: rs[k].r.slice(-n) })) };
  }

  const api = { parseCsv, returnsOf, portfolioReturns, isoDate };

  // ---------- browser part: site files, IndexedDB ----------
  if (typeof window !== 'undefined') {
    const mem = new Map(), tmem = new Map(); let dbp = null, persistent = true;
    const open = () => (dbp ||= new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('IndexedDB unavailable'));
      const q = indexedDB.open('riskhub', 2);
      q.onupgradeneeded = () => { for (const n of ['series', 'tables']) if (!q.result.objectStoreNames.contains(n)) q.result.createObjectStore(n, { keyPath: 'id' }); };   // 'tables' = typed datasets from the Import screen
      q.onsuccess = () => { q.result.onversionchange = () => { q.result.close(); dbp = null; }; res(q.result); };   // let another tab upgrade the database
      q.onerror = () => rej(q.error); q.onblocked = () => setTimeout(() => rej(new Error('blocked')), 3000);   // an old tab holds it: do not hang, use memory
    }));
    const run = async (mode, fn, name = 'series') => {
      try { const db = await open(); return await new Promise((res, rej) => { const t = db.transaction(name, mode), q = fn(t.objectStore(name)); t.oncomplete = () => res(q.result); t.onerror = () => rej(t.error); }); }
      catch { persistent = false; return null; }    // private window: keep the data in memory for the session
    };
    api.store = {
      persistent: () => persistent,
      async list() { return (await run('readonly', (s) => s.getAll())) || [...mem.values()]; },
      async put(x) { mem.set(x.id, x); await run('readwrite', (s) => s.put(x)); },
      async remove(id) { mem.delete(id); await run('readwrite', (s) => s.delete(id)); },
    };
    api.tables = {
      async list() { return (await run('readonly', (s) => s.getAll(), 'tables')) || [...tmem.values()]; },
      async put(x) { tmem.set(x.id, x); await run('readwrite', (s) => s.put(x), 'tables'); },
      async remove(id) { tmem.delete(id); await run('readwrite', (s) => s.delete(id), 'tables'); },
    };
    api.loadBundled = async () => {                  // manifest + CSV du site (servis comme des fichiers statiques, mis en cache par le navigateur)
      const man = await (await fetch('data/manifest.json')).json();
      ohlcvIds = man.ohlcv || [];
      return { updated: man.updated, rates: man.rates, series: man.series.map((m) => ({ ...m, kind: 'bundled', dates: null, close: null })) };   // prices are only read when needed
    };
    const ohlcvMem = new Map();
    let ohlcvIds = [];
    api.hasOhlcv = (id) => ohlcvIds.includes(id);                  // series with daily open/high/low/volume (data/ohlcv/*.csv)
    api.ohlcv = async (id) => {                                          // {dates, open, high, low, close, volume, volumeUsd}
      if (!ohlcvMem.has(id)) {
        const r = await fetch(`data/ohlcv/${id}.csv`);   // absent from the public build: the browser then asks Deribit directly (live.js)
        if (r.ok) {
          const rows = (await r.text()).trim().split('\n').slice(1).map((l) => l.split(',')), col = (i) => rows.map((x) => +x[i]);
          ohlcvMem.set(id, { dates: rows.map((x) => x[0]), open: col(1), high: col(2), low: col(3), close: col(4), volume: col(5), volumeUsd: col(6) });
        } else ohlcvMem.set(id, await root.Live.ohlcv(id));
      }
      return ohlcvMem.get(id);
    };
    api.ensure = async (a) => {                      // loads a bundled series' CSV the first time it is needed
      if (a.close) return a;
      const r = await fetch(`data/${a.id}.csv`);
      if (!r.ok) {
        if (!(root.Live && root.Live.INST[a.id])) throw new Error(`${a.name}: data file missing`);
        const o = await api.ohlcv(a.id); a.dates = o.dates; a.close = o.close; return a;
      }
      const rows = (await r.text()).trim().split('\n').slice(1).map((l) => l.split(','));
      a.dates = rows.map((x) => x[0]); a.close = rows.map((x) => +x[1]); return a;
    };
    // option chain and DVOL history: site files when present (local build), otherwise live from Deribit
    api.optionChain = async (cur) => { const r = await fetch(`data/options/${cur}.json`, { cache: 'no-cache' }); return r.ok ? r.json() : root.Live.options(cur.toUpperCase()); };
    api.ivCsv = async (cur) => { const r = await fetch(`data/options/iv_${cur}.csv`, { cache: 'no-cache' }); return r.ok ? r.text() : root.Live.dvol(cur.toUpperCase()); };
    const tenorYears = (t) => (t.endsWith('M') ? parseInt(t, 10) / 12 : parseInt(t, 10));
    const CURVES = {   // the site's curves: file, key rates shown, nature of the rates (zero-coupon or par yield)
      eur: { file: 'ecb_aaa.csv', pol: 'ecb_policy.csv', kind: 'zero', label: 'Euro area (ECB AAA zero curve)', polNames: ['MRO', 'deposit facility'] },
      usd: { file: 'ust_par.csv', pol: 'us_policy.csv', kind: 'par', label: 'US Treasury (par yields, bootstrapped to zero)', polNames: ['EFFR', 'SOFR'] },
    };
    api.CURVES = CURVES;
    api.loadRates = async (key) => {                 // one row per day, one column per maturity (in %)
      const c = CURVES[key], rows = (await (await fetch('data/rates/' + c.file)).text()).trim().split('\n').map((l) => l.split(','));
      const pol = (await (await fetch('data/rates/' + c.pol)).text()).trim().split('\n').slice(1).map((l) => l.split(','));
      const tenors = rows[0].slice(1), years = tenors.map(tenorYears), rates = rows.slice(1).map((r) => r.slice(1).map(Number));
      const last = pol[pol.length - 1];
      return { key, kind: c.kind, label: c.label, tenors, years, dates: rows.slice(1).map((r) => r[0]), rates, polNames: c.polNames, policy: { date: last[0], a: last[1], b: last[2] },
        zero: (i) => (c.kind === 'par' ? Risk.parToZero(years, rates[i]).map((x) => x * 100) : rates[i]) };   // continuously compounded zero rates in %
    };
    api.simulated = () => [{ id: 'simA', name: 'Simulated asset A (fat tails)', class: 'Simulated', source: 'GARCH(1,1), Student-t 5 d.o.f.', kind: 'sim', seed: 20261023 }, { id: 'simB', name: 'Simulated asset B (fat tails)', class: 'Simulated', source: 'GARCH(1,1), Student-t 5 d.o.f.', kind: 'sim', seed: 7 }].map((a) => {
      const r = Risk.simulate(3000, a.seed); let v = 100; return { ...a, dates: null, close: [100, ...r.map((x) => (v *= 1 + x))], n: 3000 };
    });
  }
  root.Data = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
