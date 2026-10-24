'use strict';
/* Options labs: strategies, SVI/SABR calibration, American options, exotics, implied density, second-order greeks. */
const chainList = async () => (S.opList ||= await fetch('data/manifest.json').then((r) => r.json()).then((m) => m.options).catch(() => null) || [{ id: 'btc', label: 'Bitcoin' }, { id: 'eth', label: 'Ether' }]);
const chainOf = async (id) => (S.opData ||= {})[id] ||= await Data.optionChain(id);
/* out-of-the-money quotes of one expiry as {k: ln(K/F), iv}; junk vols are dropped */
const otmSmile = (e) => e.pts.filter((p) => (p.type === 'P' ? p.k < e.F : p.k >= e.F) && p.iv > 0.05 && p.iv < 2).sort((a, b) => a.k - b.k).map((p) => ({ k: Math.log(p.k / e.F), iv: p.iv, K: p.k }));
const chainControls = [{ id: 'und', label: 'Underlying', sel: () => (S.opList || []).map((o) => [o.id, o.label]), val: () => (S.opList && S.opList[0] ? S.opList[0].id : 'btc') }, { id: 'exp', label: 'Expiry (index)', min: 0, max: 9, step: 1, val: 3, fmt: String }];
async function chainFor(v) { await chainList(); if (!S.opList.some((o) => o.id === v.und)) v.und = S.opList[0].id; const C = await chainOf(v.und); const i = Math.min(v.exp, C.expiries.length - 1), e = C.expiries[i]; return { C, e, sm: otmSmile(e) }; }

const LEGS = {
  call: ['Long call', [[1, 'C', 1.0]]], put: ['Long put', [[1, 'P', 1.0]]], straddle: ['Long straddle', [[1, 'C', 1], [1, 'P', 1]]], strangle: ['Long strangle', [[1, 'C', 1.1], [1, 'P', 0.9]]],
  bull: ['Bull call spread', [[1, 'C', 0.95], [-1, 'C', 1.05]]], fly: ['Butterfly', [[1, 'C', 0.9], [-2, 'C', 1], [1, 'C', 1.1]]], condor: ['Iron condor', [[1, 'P', 0.85], [-1, 'P', 0.95], [-1, 'C', 1.05], [1, 'C', 1.15]]],
  covered: ['Covered call (stock + short call)', [[1, 'S', 1], [-1, 'C', 1.05]]], collar: ['Collar (stock + put − call)', [[1, 'S', 1], [1, 'P', 0.95], [-1, 'C', 1.05]]], rr: ['Risk reversal', [[1, 'C', 1.05], [-1, 'P', 0.95]]],
};





Lab.reg('greeks2', {
  kicker: 'Options', title: 'Second-order greeks: vanna and volga',
  lead: 'Delta and vega are not constant. Vanna says how delta changes when volatility moves; volga (or vomma) how vega changes. They are what explains why smiles cost money to hedge.',
  controls: [{ id: 'vol', label: 'Volatility', min: 0.1, max: 0.8, step: 0.01, val: 0.25, fmt: (x) => pct(x, 0) }, { id: 'T', label: 'Maturity (years)', min: 0.05, max: 2, step: 0.05, val: 0.5, fmt: (x) => x.toFixed(2) }, { id: 'dv', label: 'Vol shock (points)', min: -10, max: 10, step: 1, val: 5, fmt: (x) => (x > 0 ? '+' : '') + x }],
  note: 'Vanna = ∂Δ/∂σ = ∂vega/∂S. Volga = ∂vega/∂σ = vega·d₁·d₂/σ. Volga is positive for out-of-the-money options, so owning wings means being long convexity in volatility: that is why wings trade above the at-the-money vol (the smile). The table compares the exact change in vega after a vol shock with the volga estimate (second-order Taylor).',
  draw(v) {
    const S0 = 100, r = 0.02, ks = Array.from({ length: 61 }, (_, i) => 60 + i * 1.3333), g = ks.map((K) => Risk.greeks2(S0, K, v.T, v.vol, r, 0)), dv = v.dv / 100;
    const rows = [80, 90, 100, 110, 120].map((K) => { const g0 = Risk.greeks2(S0, K, v.T, v.vol, r, 0), g1 = Risk.greeks2(S0, K, v.T, v.vol + dv, r, 0), d0 = Risk.bs(S0, K, v.T, v.vol, r, 0, 'C').delta, d1 = Risk.bs(S0, K, v.T, v.vol + dv, r, 0, 'C').delta; return [K, (d1 - d0).toFixed(4), (g0.vanna * dv).toFixed(4), (g1.vega - g0.vega).toFixed(3), (g0.volga * dv).toFixed(3)]; });
    later(() => {
      Lab.plot($('#c1'), { series: [{ x: ks, y: g.map((x) => x.vanna), c: 'a', w: 2.2 }], hlines: [{ y: 0 }], vlines: [{ x: 100, c: 'm' }], xfmt: (z) => z.toFixed(0), yfmt: (z) => z.toFixed(2), h: 230 });
      Lab.plot($('#c2'), { series: [{ x: ks, y: g.map((x) => x.volga), c: 'y', w: 2.2 }, { x: ks, y: g.map((x) => x.vega), c: 'b', w: 1.5, dash: [5, 4] }], hlines: [{ y: 0 }], vlines: [{ x: 100, c: 'm' }], xfmt: (z) => z.toFixed(0), yfmt: (z) => z.toFixed(0), h: 230 });
    });
    return `<div class="kpis">${kpi('ATM vega', g[30].vega.toFixed(2), 'per 1.00 of vol')}${kpi('ATM volga', g[30].volga.toFixed(2), 'near zero at the money')}${kpi('Vanna at 90%', g[7].vanna.toFixed(3), 'delta change per 1.00 of vol')}${kpi('Volga at 70%', g[0].volga.toFixed(1), 'wings are convex in vol')}</div>
      <div class="duo">${Lab.card('c1', 'Vanna by strike', null)}${Lab.card('c2', 'Volga (yellow) and vega (dashed) by strike', null)}</div>
      ${Lab.table(['Strike', 'Δ change (exact)', 'Δ change (vanna)', 'Vega change (exact)', 'Vega change (volga)'], rows)}`;
  },
});
