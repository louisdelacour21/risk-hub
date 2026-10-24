'use strict';
/* Live crypto data from the Deribit public API, fetched by the visitor's own browser. The published site carries no Deribit data (their terms, clause 4.6, limit market data to personal use), so
   nothing is redistributed here: the page asks Deribit directly. Daily candles go through the WebSocket API (the REST chart endpoint sends no CORS header, the WebSocket is not subject to it);
   option summaries and the DVOL index come from the REST endpoints, which allow cross-origin reads. The parsing functions are pure and tested offline (test-live.js). */
((G) => {
  const INST = { btc: 'BTC-PERPETUAL', eth: 'ETH-PERPETUAL', sol: 'SOL_USDC-PERPETUAL', xrp: 'XRP_USDC-PERPETUAL', doge: 'DOGE_USDC-PERPETUAL', ada: 'ADA_USDC-PERPETUAL', avax: 'AVAX_USDC-PERPETUAL', ltc: 'LTC_USDC-PERPETUAL', dot: 'DOT_USDC-PERPETUAL', bch: 'BCH_USDC-PERPETUAL' };
  const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
  const iso = (t) => new Date(t).toISOString().slice(0, 10), START = Date.UTC(2019, 1, 1);

  // result of get_tradingview_chart_data -> the same columns as data/ohlcv/<id>.csv (one row per UTC day, ascending, last duplicate wins)
  function chartRows(r) {
    const seen = new Map();
    r.ticks.forEach((t, i) => seen.set(iso(t), i));
    const idx = [...seen.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)), col = (k) => idx.map(([, i]) => r[k][i]);
    return { dates: idx.map(([d]) => d), open: col('open'), high: col('high'), low: col('low'), close: col('close'), volume: col('volume'), volumeUsd: col('cost') };
  }
  // result of get_book_summary_by_currency (kind=option) -> chain object of data/options/<cur>.json: out-of-the-money mark implied volatility per strike and expiry
  function optionChain(cur, res, nowMs) {
    const by = new Map();
    for (const o of res) {
      const iv = o.mark_iv; if (!iv || iv <= 0) continue;
      const [, exp, strike, typ] = o.instrument_name.split('-'), F = +o.underlying_price, k = +strike;
      if ((typ === 'P') !== (k < F)) continue;
      if (!by.has(exp)) by.set(exp, { F, pts: [] });
      by.get(exp).pts.push({ k, iv: Math.round(iv * 100) / 1e4, type: typ, oi: o.open_interest || 0 });
    }
    const out = [];
    for (const [exp, e] of by) {
      const m = /^(\d{1,2})([A-Z]{3})(\d{2})$/.exec(exp); if (!m) continue;
      const d = Date.UTC(2000 + +m[3], MONTHS[m[2]], +m[1], 8), T = (d - nowMs) / (365 * 864e5);   // Deribit options expire at 08:00 UTC
      if (T > 1 / 365 && e.pts.length >= 5) out.push({ date: iso(d), T: Math.round(T * 1e5) / 1e5, F: e.F, pts: e.pts.sort((a, b) => a.k - b.k) });
    }
    if (!out.length) throw new Error('no option expiry returned');
    return { currency: cur, updated: new Date(nowMs).toISOString().slice(0, 16).replace('T', ' ') + ' UTC', spot: +res[0].estimated_delivery_price, source: 'Deribit public API (mark implied volatilities), fetched live', expiries: out.sort((a, b) => a.T - b.T) };
  }
  // result.data of get_volatility_index_data -> the text of data/options/iv_<cur>.csv (date,iv30,spot)
  function dvolCsv(data) {
    const byDay = new Map(); for (const [t, , , , c] of data) byDay.set(iso(t), c / 100);
    return 'date,iv30,spot\n' + [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([d, v]) => `${d},${v.toFixed(5)},`).join('\n') + '\n';
  }

  // ---- network (browser only)
  let sock = null, nextId = 1; const waiting = new Map();
  const open = () => sock ||= new Promise((res, rej) => {
    const w = new WebSocket('wss://www.deribit.com/ws/api/v2');
    w.onopen = () => res(w); w.onerror = () => { sock = null; rej(new Error('Deribit is unreachable (WebSocket).')); };
    w.onclose = () => { sock = null; for (const [, p] of waiting) p.rej(new Error('Deribit closed the connection.')); waiting.clear(); };
    w.onmessage = (m) => { const j = JSON.parse(m.data), p = waiting.get(j.id); if (!p) return; waiting.delete(j.id); j.error ? p.rej(new Error(j.error.message)) : p.res(j.result); };
  });
  const rpc = async (method, params) => { const w = await open(), id = nextId++; return new Promise((res, rej) => { waiting.set(id, { res, rej }); w.send(JSON.stringify({ jsonrpc: '2.0', id, method, params })); setTimeout(() => { if (waiting.delete(id)) rej(new Error('Deribit did not answer in time.')); }, 20000); }); };
  const rest = async (path) => { const r = await fetch('https://www.deribit.com/api/v2/public/' + path); if (!r.ok) throw new Error('Deribit answered ' + r.status); return (await r.json()).result; };
  const memo = new Map(), once = (k, f) => { if (!memo.has(k)) memo.set(k, f().catch((e) => { memo.delete(k); throw e; })); return memo.get(k); };
  const api = {
    INST, chartRows, optionChain, dvolCsv,
    ohlcv: (id) => once('o' + id, async () => chartRows(await rpc('public/get_tradingview_chart_data', { instrument_name: INST[id], start_timestamp: START, end_timestamp: Date.now(), resolution: '1D' }))),
    options: (cur) => once('c' + cur, async () => optionChain(cur, await rest(`get_book_summary_by_currency?currency=${cur}&kind=option`), Date.now())),
    dvol: (cur) => once('v' + cur, async () => dvolCsv((await rest(`get_volatility_index_data?currency=${cur}&start_timestamp=${START}&end_timestamp=${Date.now()}&resolution=1D`)).data)),
  };
  G.Live = api; if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
