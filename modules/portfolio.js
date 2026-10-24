'use strict';
/* Screen: build a portfolio (asset search, weights, preview). */
const matches = () => { const q = S.st.q.trim().toLowerCase(); return S.assets.filter((a) => !q || `${a.name} ${a.class} ${a.source}`.toLowerCase().includes(q)).sort((a, b) => ORDER.indexOf(a.class) - ORDER.indexOf(b.class)); };
function listHtml() {
  const m = matches(); S.st.i = Math.max(0, Math.min(S.st.i, m.length - 1));
  if (!m.length) return '<li class="none" role="presentation">No asset matches.</li>';
  let last = '';
  return m.map((a, k) => {
    const on = S.sel.includes(a.id), dis = !on && S.sel.length >= 6, gh = a.class !== last ? `<li class="gh" role="presentation">${esc(a.class)}</li>` : ''; last = a.class;
    return `${gh}<li role="option" id="o${k}" data-id="${esc(a.id)}" aria-selected="${on}" ${dis ? 'aria-disabled="true"' : ''} class="${k === S.st.i ? 'act' : ''}"><span>${esc(a.name)}</span><small>${on ? 'added' : a.from ? `${a.from.slice(0, 4)}–${a.to.slice(0, 4)}` : 'synthetic'}</small></li>`;
  }).join('');
}

async function preview(list, w) {
  const el = $('#prev'), tok = S.pvTok = (S.pvTok || 0) + 1;
  el.innerHTML = '<p class="mut">Loading…</p>';
  try {
    await Promise.all(list.map(Data.ensure)); if (tok !== S.pvTok) return;
    const port = Data.portfolioReturns(list, w), ppy = Risk.periodsPerYear(port.dates), pf = Risk.profile(port.r, ppy);
    let v = 100; const cum = [v, ...port.r.map((x) => (v *= 1 + x))], d = port.dates;
    el.innerHTML = `<div class="chart-head"><h2>${list.length > 1 ? 'Portfolio' : esc(list[0].name)} · value of 100</h2></div><canvas id="pvc"></canvas>
      <div class="pstats"><div><span>Volatility</span><b>${pct(pf.annVol, 1)}</b></div><div><span>Return / year</span><b>${pct(pf.annRet, 1)}</b></div><div><span>Max drawdown</span><b>${pct(pf.dd.max, 1)}</b></div></div>
      <p class="hint">${d ? `${d[0]} → ${d[d.length - 1]} · ` : ''}${port.r.length} daily returns</p>`;
    lineChart($('#pvc'), cum, { h: 200, dates: d ? [d[0], d[d.length - 1]] : null, yfmt: (x) => x.toFixed(0) });
  } catch (e) { if (tok === S.pvTok) el.innerHTML = `<p class="fail">${esc(e.message)}</p>`; }
}

function renderStart() {
  const st = S.st ||= { q: '', open: false, i: 0, refocus: false }, sel = selected(), w = weightsFor(sel), tot = w.reduce((a, b) => a + b, 0);
  const holdings = `<div class="card hold"><div class="hold-h"><b>${sel.length} asset${sel.length > 1 ? 's' : ''}${sel.length > 1 ? tip('weights') : ''}</b>${sel.length > 1 ? '<button class="link" id="eq">Equal weights</button>' : ''}</div>
      ${sel.length > 1 ? `<div class="alloc" aria-hidden="true">${sel.map((a, i) => `<i style="flex:${w[i]};background:${PALETTE[i]}"></i>`).join('')}</div>` : ''}
      ${sel.map((a, i) => `<div class="hrow"><i class="sw" style="background:${PALETTE[i]}"></i><div class="hn"><b>${esc(a.name)}</b><small>${esc(a.class)}</small></div><canvas aria-hidden="true"></canvas>
        ${sel.length > 1 ? `<label class="wi"><span class="sr">Weight of ${esc(a.name)}</span><input type="number" min="0" step="5" value="${w[i].toFixed(1)}" data-w="${esc(a.id)}">%</label>` : '<span class="wi">100%</span>'}
        <button class="x" data-rm="${esc(a.id)}" aria-label="Remove ${esc(a.name)}">×</button></div>`).join('')}
      ${sel.length > 1 ? `<p class="hint">${Math.abs(tot - 100) < 0.05 ? 'Weights add up to 100%.' : `Weights add up to ${tot.toFixed(1)}% and are normalised to 100%.`} Constant weights, rebalanced daily.</p>` : ''}</div>`;
  const ex = EXAMPLES.map((e, i) => [e, i]).filter(([[, m]]) => Object.keys(m).every(byId));
  $('#app').innerHTML = `<div class="launch ${sel.length ? '' : 'solo'}"><section>
      <h1>Build a portfolio</h1>
      <p class="lead">Add one asset or several, set the weights, then run an analysis. Everything is computed in your browser.</p>
      <div class="combo"><label class="sr" for="q">Add an asset</label><input id="q" role="combobox" aria-expanded="${st.open}" aria-controls="lb" aria-autocomplete="list" placeholder="Add an asset: search or pick from the list" autocomplete="off" value="${esc(st.q)}"><ul id="lb" role="listbox" ${st.open ? '' : 'hidden'}>${listHtml()}</ul></div>
      ${sel.length ? holdings : (ex.length ? `<div class="ex"><span class="lab-t">Or start from an example</span><div class="chips">${ex.map(([[n], i]) => `<button class="pill" data-ex="${i}">${n}</button>`).join('')}</div></div>` : '')}
      <div class="runs">${Object.entries(ANALYSES).map(([k, v]) => `<button class="action" data-run="${k}" title="${esc(v.sub)}" ${sel.length ? '' : 'disabled'}><b>${v.title}</b></button>`).join('')}</div>
      <p class="hint"><a href="#/options">Option chains</a> · <a href="#/rates">Yield curves</a> · <a href="#/data">Manage market data</a></p></section>
    ${sel.length ? '<aside class="card prev" id="prev"></aside>' : ''}</div>`;
  const q = $('#q'), lb = $('#lb');
  const refresh = () => { lb.innerHTML = listHtml(); lb.hidden = !st.open; q.setAttribute('aria-expanded', String(st.open)); const act = $('.act', lb); if (act) { act.scrollIntoView({ block: 'nearest' }); q.setAttribute('aria-activedescendant', act.id); } };
  const pick = (id) => { st.q = ''; st.i = 0; st.refocus = true; toggle(id); };
  q.addEventListener('focus', () => { st.open = true; refresh(); });
  q.addEventListener('blur', () => { st.open = false; refresh(); });
  q.addEventListener('input', () => { st.q = q.value; st.i = 0; st.open = true; refresh(); });
  q.addEventListener('keydown', (e) => {
    const m = matches();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); st.open = true; if (m.length) st.i = (st.i + (e.key === 'ArrowDown' ? 1 : m.length - 1)) % m.length; refresh(); }
    else if (e.key === 'Enter') { e.preventDefault(); const a = m[st.i]; if (a && st.open && !(S.sel.length >= 6 && !S.sel.includes(a.id))) pick(a.id); }
    else if (e.key === 'Escape') { st.open = false; refresh(); }
  });
  lb.addEventListener('mousedown', (e) => { e.preventDefault(); const li = e.target.closest('[data-id]'); if (li && li.getAttribute('aria-disabled') !== 'true') pick(li.dataset.id); });
  document.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => toggle(b.dataset.rm)));
  document.querySelectorAll('[data-ex]').forEach((b) => b.addEventListener('click', () => { const m = EXAMPLES[b.dataset.ex][1]; S.sel = Object.keys(m); S.weights = { ...m }; pref.set('sel', S.sel); pref.set('weights', S.weights); renderStart(); }));
  document.querySelectorAll('[data-w]').forEach((i) => i.addEventListener('change', renderStart));
  $('#eq')?.addEventListener('click', () => { S.weights = {}; pref.set('weights', S.weights); renderStart(); });
  document.querySelectorAll('.hrow').forEach((row, i) => { const sp = sel[i].spark || sel[i].close; if (sp) spark($('canvas', row), sp); });
  if (sel.length) preview(sel, w);
  if (st.refocus) { st.refocus = false; q.focus(); }
}

/* ------------------------------------------------------------------ screen 2: market data */
