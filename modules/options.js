'use strict';
/* Screen: option chains, smile and pricer. */
async function renderOptions() {
  const st = S.op ||= { cur: 'btc', exp: 3, tab: 'surf' };
  $('#app').innerHTML = '<div class="running"><span class="spin"></span><p>Loading the option chain…</p></div>';
  let C;
  S.opList ||= await fetch('data/manifest.json').then((r) => r.json()).then((m) => m.options).catch(() => null) || [{ id: 'btc', label: 'Bitcoin' }, { id: 'eth', label: 'Ether' }];
  if (!S.opList.some((o) => o.id === st.cur)) st.cur = S.opList[0].id;
  try { S.opData ||= {}; C = S.opData[st.cur] ||= await Data.optionChain(st.cur); }
  catch { $('#app').innerHTML = '<div class="card"><p class="fail">The option chain is missing (data/options). Run tools/refresh_data.py.</p></div>'; return; }
  st.exp = Math.min(st.exp, C.expiries.length - 1);
  const pr = S.pr ||= { S: 100, K: 100, days: 90, vol: 25, r: 3, q: 0, type: 'C', mkt: '' };
  $('#app').innerHTML = `<section class="hero compact"><p class="kicker">Options</p><h1>${esc(S.opList.find((o) => o.id === st.cur).label)} implied volatility</h1>
    <p class="lead">What the options market prices in: the volatility smile for each expiry, the term structure, and Black-Scholes prices and greeks computed from ${esc(C.source)}. Snapshot taken ${esc(C.updated)}. The pricer below runs entirely in your browser.</p></section>
    <section class="lab"><aside class="card controls">${seg('ocur', 'Underlying', S.opList.map((o) => [o.id, o.label]), st.cur)}
      <div class="field"><label class="lab-t" for="oexp">Expiry${tip('forward')}</label><select id="oexp">${C.expiries.map((e, i) => `<option value="${i}">${e.date} · ${Math.round(e.T * 365)} d</option>`).join('')}</select></div>
      <small class="mut">Each expiry uses its own future as the underlying (Black-76: S = forward, no rate). Only out-of-the-money options are used: puts below the forward, calls above.</small></aside>
    <div class="out"><div class="tabs sub" id="otabs">${[['surf', 'Smile & chain'], ['calc', 'Calculator'], ['stress', 'Stress a position']].map(([k, t]) => `<a href="#/options" data-k="${k}">${t}</a>`).join('')}</div><div class="kpis" data-t="surf" id="ok"></div>
    <div class="card chart-card" data-t="surf"><div class="chart-head"><h2>Smile<span id="ot"></span>${tip('smile')}</h2><div class="legend"><span><i class="dot var"></i>implied volatility by strike / forward${tip('moneyness')}</span></div></div><canvas id="osm"></canvas></div>
    <div class="card chart-card" data-t="surf"><div class="chart-head"><h2>Term structure${tip('termstruct')}</h2><div class="legend"><span><i class="dot var"></i>at-the-money volatility by days to expiry</span></div></div><canvas id="ots"></canvas></div>
    <div class="card table-card" data-t="surf"><table class="plain" id="otb"></table></div>
    <div class="card" data-t="calc"><div class="chart-head"><h2>Black-Scholes calculator${tip('bs')}</h2></div><div class="pricer" id="pf"></div><div class="kpis" id="pk"></div><p class="mut" id="pn"></p></div><div class="card" data-t="stress" id="ostress"></div></div></section>`;
  $('#oexp').value = st.exp;
  const drawChain = () => {
    const e = C.expiries[st.exp], F = e.F, atm = Risk.ivAt(e.pts, F), sk = Risk.ivAt(e.pts, 0.9 * F) - Risk.ivAt(e.pts, 1.1 * F);
    $('#ot').textContent = ` · ${e.date}`;
    $('#ok').innerHTML = kpi('Spot', fmtUsd(C.spot), `forward ${fmtUsd(F)}${e.q != null ? ` · parity, q ${(e.q * 100).toFixed(1)}%` : ''}`, 'forward') + kpi('ATM volatility', pct(atm, 1), `${Math.round(e.T * 365)} days to expiry`, 'atmiv') + kpi('Skew (90–110)', (sk >= 0 ? '+' : '') + (sk * 100).toFixed(1) + ' pts', sk > 0 ? 'downside richer' : 'upside richer', 'skewkpi') + kpi('Strikes', e.pts.length, `${Math.round(e.pts[0].k)} to ${Math.round(e.pts[e.pts.length - 1].k)}`);
    xyChart($('#osm'), [{ x: e.pts.map((p) => p.k / F), y: e.pts.map((p) => p.iv), dots: true }], { xfmt: (v) => (v * 100).toFixed(0) + '%', yfmt: (v) => (v * 100).toFixed(0) + '%', vline: 1 });
    xyChart($('#ots'), [{ x: C.expiries.map((x) => x.T * 365), y: C.expiries.map((x) => Risk.ivAt(x.pts, x.F)), dots: true }], { xfmt: (v) => Math.round(v) + ' d', yfmt: (v) => (v * 100).toFixed(0) + '%' });
    const near = e.pts.slice().sort((a, b) => Math.abs(Math.log(a.k / F)) - Math.abs(Math.log(b.k / F))).slice(0, 15).sort((a, b) => a.k - b.k);
    $('#otb').innerHTML = `<thead><tr><th>Strike</th><th>Type</th><th>K/F${tip('moneyness')}</th><th>IV${tip('iv')}</th><th>Price (USD)</th><th>Delta${tip('delta')}</th><th>Gamma × 1%${tip('gamma')}</th><th>Vega / pt${tip('vega')}</th><th>Theta / day${tip('theta')}</th><th>Open interest</th></tr></thead><tbody>${near.map((p) => {
      const r = e.r || 0, o = Risk.bs(F, p.k, e.T, p.iv, r, r, p.type);   // Black-76: forward as underlying, discounted at r
      return `<tr><td>${p.k.toLocaleString('en')}</td><td>${p.type === 'C' ? 'Call' : 'Put'}</td><td>${(p.k / F * 100).toFixed(1)}%</td><td>${pct(p.iv, 1)}</td><td>${fmtUsd(o.price)}</td><td>${num(o.delta, 3)}</td><td>${num(o.gamma * F * 0.01, 4)}</td><td>${fmtUsd(o.vega / 100)}</td><td>${fmtUsd(o.theta / 365)}</td><td>${Math.round(p.oi).toLocaleString('en')}</td></tr>`; }).join('')}</tbody>`;
  };
  const f = (id, label, v) => `<div class="field"><label class="lab-t" for="${id}">${label}</label><input id="${id}" type="number" step="any" value="${v}"></div>`;
  $('#pf').innerHTML = `${f('pS', 'Spot S', pr.S)}${f('pK', 'Strike K', pr.K)}${f('pD', 'Days to expiry', pr.days)}${f('pV', 'Volatility σ (%)', pr.vol)}${f('pR', 'Rate r (%)', pr.r)}${f('pQ', 'Dividend yield q (%)', pr.q)}
    ${seg('ptype', 'Type', [['C', 'Call'], ['P', 'Put']], pr.type)}<div class="field"><label class="lab-t" for="pM">Market price (optional)${tip('ivsolve')}</label><input id="pM" type="number" step="any" placeholder="solve for σ" value="${pr.mkt}"></div>`;
  const drawPricer = () => {
    const T = pr.days / 365, v = pr.vol / 100, r = pr.r / 100, q = pr.q / 100;
    if (!(pr.S > 0 && pr.K > 0 && T > 0 && v > 0)) { $('#pk').innerHTML = ''; $('#pn').textContent = 'Spot, strike, days and volatility must be positive.'; return; }
    const o = Risk.bs(pr.S, pr.K, T, v, r, q, pr.type), c = Risk.bs(pr.S, pr.K, T, v, r, q, 'C').price, p = Risk.bs(pr.S, pr.K, T, v, r, q, 'P').price;
    const par = pr.S * Math.exp(-q * T) - pr.K * Math.exp(-r * T), mk = Number(pr.mkt), iv = pr.mkt !== '' && mk > 0 ? Risk.impliedVol(mk, pr.S, pr.K, T, r, q, pr.type) : undefined;
    $('#pk').innerHTML = kpi('Price', o.price.toFixed(4), pr.type === 'C' ? 'call' : 'put', 'bs') + kpi('Delta', num(o.delta), 'per 1 of spot', 'delta') + kpi('Gamma', num(o.gamma), 'per 1 of spot', 'gamma') + kpi('Vega', num(o.vega / 100), 'per vol point', 'vega') + kpi('Theta', num(o.theta / 365), 'per day', 'theta') + kpi('Rho', num(o.rho / 100), 'per 1% rate', 'rho')
      + (iv === undefined ? '' : kpi('Implied σ', iv === null ? 'no solution' : pct(iv, 2), 'from the market price', 'ivsolve'));
    $('#pn').innerHTML = `Put-call parity${tip('parity')}: C − P = ${(c - p).toFixed(6)} and S·e^(−qT) − K·e^(−rT) = ${par.toFixed(6)}.`;
  };
  $('#ocur').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || b.dataset.v === st.cur) return; st.cur = b.dataset.v; renderOptions(); });
  $('#oexp').addEventListener('change', (e) => { st.exp = Number(e.target.value); drawChain(); });
  $('#ptype').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; pr.type = b.dataset.v; [...$('#ptype').children].forEach((x) => x.setAttribute('aria-pressed', String(x === b))); drawPricer(); drawStress(); });
  for (const [id, k] of [['pS', 'S'], ['pK', 'K'], ['pD', 'days'], ['pV', 'vol'], ['pR', 'r'], ['pQ', 'q']]) $('#' + id).addEventListener('input', (e) => { pr[k] = Number(e.target.value); drawPricer(); drawStress(); });
  $('#pM').addEventListener('input', (e) => { pr.mkt = e.target.value; drawPricer(); });
  // ---- position stress: spot x volatility grid, full repricing vs greeks
  const PRESETS = [['Crash', -20, 20], ['Correction', -10, 10], ['Slow bleed', -5, 0], ['Vol spike', 0, 15], ['Vol crush', 0, -10], ['Rally', 10, -5], ['Squeeze', 20, 10]];
  const ps = S.ps ||= { qty: 1, spots: '-20, -10, -5, 0, 5, 10, 20', vols: '-10, 0, 10, 20', vmode: 'pts', days: 0 };
  const list5 = (t) => t.split(/[,;\s]+/).map(Number).filter((x) => Number.isFinite(x)).slice(0, 9);
  $('#ostress').innerHTML = `<div class="chart-head"><h2>Stress the position${tip('optstress')}</h2></div><div class="pricer">
    <div class="field"><label class="lab-t" for="sQ">Quantity (negative = short)</label><input id="sQ" type="number" step="any" value="${ps.qty}"></div>
    <div class="field"><label class="lab-t" for="sS">Spot shocks (%)</label><input id="sS" type="text" value="${ps.spots}"></div>
    <div class="field"><label class="lab-t" for="sV">Volatility shocks</label><input id="sV" type="text" value="${ps.vols}"></div>
    ${seg('vmode', 'Volatility shock is in', [['pts', 'vol points'], ['rel', '% of current σ']], ps.vmode)}
    <div class="field"><label class="lab-t" for="sD">Days elapsed</label><input id="sD" type="number" min="0" step="1" value="${ps.days}"></div></div>
    <div class="presets" id="spre">${PRESETS.map(([n, a, b], i) => `<button class="pill" data-i="${i}">${n}<small>${a > 0 ? '+' : ''}${a}% spot · ${b > 0 ? '+' : ''}${b} vol pts</small></button>`).join('')}</div><div id="ssel"></div>
    <div class="table-card"><table class="plain heat" id="sg"></table></div><div class="table-card"><table class="plain" id="sa"></table></div><p class="mut" id="sn"></p>`;
  const drawStress = () => {
    const T = pr.days / 365, v = pr.vol / 100, r = pr.r / 100, q = pr.q / 100, sp = list5(ps.spots), vs = list5(ps.vols), Q = Number(ps.qty) || 0, dd = Math.max(0, Number(ps.days) || 0);
    if (!(pr.S > 0 && pr.K > 0 && T > 0 && v > 0)) { $('#sg').innerHTML = $('#sa').innerHTML = ''; $('#sn').textContent = 'Fill the calculator above first.'; return; }
    const dv = (x) => (ps.vmode === 'pts' ? x / 100 : v * x / 100), cell = (a, b) => Risk.optionScenario(pr.S, pr.K, T, v, r, q, pr.type, a / 100, dv(b), dd);
    const base = Risk.bs(pr.S, pr.K, T, v, r, q, pr.type).price * Q, col = (x) => (x < 0 ? 'fail' : x > 0 ? 'pass' : '');
    const fm = (x) => `${x < 0 ? '−' : x > 0 ? '+' : ''}${Math.abs(x).toFixed(Math.abs(x) >= 100 ? 0 : 2)}`;
    const mx = Math.max(1e-9, ...sp.flatMap((a) => vs.map((b) => Math.abs(cell(a, b).pnl * Q)))), tint = (p) => `style="background:color-mix(in srgb, var(${p < 0 ? '--red' : '--green'}) ${Math.round(Math.abs(p) / mx * 70)}%, transparent)"`;
    const sel = ps.sel; $('#ssel').innerHTML = sel ? (() => { const c = Risk.optionScenario(pr.S, pr.K, T, v, r, q, pr.type, sel[0] / 100, sel[1] / 100, dd), p = c.pnl * Q; return `<div class="card selres"><b>${sel[2]}</b><span class="${col(p)}">${fm(p)}</span><small>spot ${sel[0] > 0 ? '+' : ''}${sel[0]}% → ${(pr.S * (1 + sel[0] / 100)).toFixed(2)}, vol ${sel[1] > 0 ? '+' : ''}${sel[1]} pts → ${((v + sel[1] / 100) * 100).toFixed(1)}% · P&L on a position worth ${base.toFixed(2)} today</small></div>`; })() : '';
    document.querySelectorAll('#spre button').forEach((b) => b.classList.toggle('on', !!sel && PRESETS[b.dataset.i][0] === sel[2]));
    $('#sg').innerHTML = `<caption class="cap">P&L of the position (value today ${base.toFixed(2)}); rows = spot shock, columns = volatility shock</caption><thead><tr><th>Spot</th>${vs.map((x) => `<th>${x > 0 ? '+' : ''}${x}${ps.vmode === 'pts' ? ' pts' : '%'}</th>`).join('')}</tr></thead><tbody>${sp.map((a) => `<tr><th>${a > 0 ? '+' : ''}${a}% (${(pr.S * (1 + a / 100)).toFixed(2)})</th>${vs.map((b) => { const p = cell(a, b).pnl * Q; return `<td class="${col(p)}" ${tint(p)}>${fm(p)}</td>`; }).join('')}</tr>`).join('')}</tbody>`;
    $('#sa').innerHTML = `<caption class="cap">Greeks versus full repricing (volatility unchanged${dd ? `, ${dd} days elapsed` : ''})</caption><thead><tr><th>Spot</th><th>Full repricing</th><th>Delta only</th><th>Delta + gamma</th><th>Delta + gamma + theta</th></tr></thead><tbody>${sp.map((a) => { const c = cell(a, 0); return `<tr><th>${a > 0 ? '+' : ''}${a}%</th><td>${fm(c.pnl * Q)}</td><td>${fm(c.delta * Q)}</td><td>${fm(c.deltaGamma * Q)}</td><td>${fm(c.deltaGammaTheta * Q)}</td></tr>`; }).join('')}</tbody>`;
    $('#sn').textContent = 'Every cell reprices the option with Black-Scholes at the shocked spot, volatility and time. The greek columns are the first- and second-order estimates, so the gap with the full repricing is the error of the approximation: it grows with the size of the move.';
  };
  $('#vmode').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; ps.vmode = b.dataset.v; [...$('#vmode').children].forEach((x) => x.setAttribute('aria-pressed', String(x === b))); drawStress(); });
  $('#spre').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const [n, a, v] = PRESETS[b.dataset.i]; ps.vmode = 'pts'; [...$('#vmode').children].forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === 'pts'))); ps.sel = ps.sel && ps.sel[2] === n ? null : [a, v, n]; drawStress(); });
  for (const [id, k] of [['sQ', 'qty'], ['sS', 'spots'], ['sV', 'vols'], ['sD', 'days']]) $('#' + id).addEventListener('input', (e) => { ps[k] = e.target.value; drawStress(); });
  const showTab = () => { document.querySelectorAll('#otabs a').forEach((a) => a.classList.toggle('on', a.dataset.k === st.tab)); document.querySelectorAll('.out [data-t]').forEach((e) => (e.hidden = e.dataset.t !== st.tab)); if (st.tab === 'surf') drawChain(); };
  $('#otabs').addEventListener('click', (e) => { const a = e.target.closest('a'); if (!a) return; e.preventDefault(); st.tab = a.dataset.k; showTab(); });
  drawPricer(); drawStress(); showTab();
}
