'use strict';
/* Risk Hub interface: asset selection, market data, results and rates screens. The maths lives in risk.js, analytics.js and data.js; the "i" explanations in glossary.js. */

/* Screens live in modules/*.js and load on first visit; shared helpers are in core/ui.js. */
/* ------------------------------------------------------------------ navigation and start-up */

async function route() {
  const h = location.hash || '#/', m = h.match(/^#\/run\/(var|profile|stress)$/);
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === 'home' && (h === '#/home' || !location.hash)));
  Shell.sync(); window.scrollTo(0, 0);
  if (h === '#/home' || !location.hash) return Shell.home();
  const lm = h.match(/^#\/m\/([a-z0-9]+)/), lab = lm && REGISTRY.mods.find((x) => x.id === lm[1] && x.file);
  if (lab) {
    try { await loadModule(lab.file); } catch { $('#app').innerHTML = '<div class="card"><p class="fail">Could not load this module. Check your connection and reload.</p></div>'; return; }
    if ((location.hash || '#/') !== h) return;
    return Lab.mount(lab.id);
  }
  const file = m ? 'run' : h.startsWith('#/rates') ? 'rates' : h.startsWith('#/options') ? 'options' : h.startsWith('#/data') ? 'data' : h.startsWith('#/import') ? 'import' : h.startsWith('#/tables') ? 'tables' : 'portfolio';
  try { await loadModule(file); } catch { $('#app').innerHTML = '<div class="card"><p class="fail">Could not load this module. Check your connection and reload.</p></div>'; return; }
  if ((location.hash || '#/') !== h) return;   // the user moved on while the module was loading
  if (m) return renderRun(m[1]);
  if (file === 'rates') return renderRates();
  if (file === 'options') return renderOptions();
  if (file === 'data') return renderData();
  if (file === 'import') return renderImport();
  if (file === 'tables') return renderTables();
  renderStart();
}
const modLoaded = {};
const loadModule = (f) => modLoaded[f] ||= new Promise((ok, no) => { const s = document.createElement('script'); s.src = `modules/${f}.js`; s.onload = ok; s.onerror = () => { delete modLoaded[f]; no(new Error(f)); }; document.head.appendChild(s); });
document.addEventListener('click', async (e) => {
  if (e.target.closest('.info')) return;
  const r = e.target.closest('[data-run]'); if (r && !r.disabled) { location.hash = `#/run/${r.dataset.run}`; return; }
  const del = e.target.closest('[data-del]');
  if (del) { await Data.store.remove(del.dataset.del); S.assets = S.assets.filter((x) => x.id !== del.dataset.del); S.sel = S.sel.filter((x) => x !== del.dataset.del); pref.set('sel', S.sel); renderData(); return; }
  if (e.target.id === 'uadd') {
    const f = $('#ufile').files[0], msg = $('#umsg');
    if (!f) { msg.textContent = 'Choose a CSV file first.'; msg.classList.add('fail'); return; }
    try {
      const p = Data.parseCsv(await f.text()), name = ($('#uname').value.trim() || f.name.replace(/\.[^.]+$/, '')).slice(0, 40);
      const rec = { id: 'u' + Date.now(), name, class: 'My data', source: 'Uploaded CSV', kind: 'user', dates: p.dates, close: p.close, from: p.dates?.[0], to: p.dates?.[p.dates.length - 1], n: p.close.length, added: new Date().toISOString() };
      await Data.store.put(rec); S.assets.splice(S.assets.findIndex((x) => x.kind === 'sim'), 0, rec); renderData();
    } catch (err) { msg.textContent = err.message; msg.classList.add('fail'); }
  }
});
document.addEventListener('input', (e) => {
  const w = e.target.dataset?.w; if (!w) return;
  S.weights[w] = Number(e.target.value); pref.set('weights', S.weights);
});
addEventListener('hashchange', route);
addEventListener('pyready', () => {   // the Python engine is in: show it and redraw the screen on Python
  const n = document.querySelector('header.top nav'); if (n && !$('#pybadge')) n.insertAdjacentHTML('afterbegin', `<span id="pybadge" class="tag" title="${Py.active()} functions now run as Python in your browser (Pyodide); the JavaScript math is the fallback">Python active</span>`);
  if (S.assets.length) route();
});
addEventListener('themechange', () => { if (S.assets.length) route(); });   // canvases read their colours at draw time
addEventListener('resize', () => { clearTimeout(S.rz); S.rz = setTimeout(() => { const h = location.hash || '#/'; if (h === '#/' || h.startsWith('#/run') || h.startsWith('#/rates') || h.startsWith('#/options') || h.startsWith('#/m/')) route(); }, 250); });

(async function boot() {
  $('#app').innerHTML = '<div class="running"><span class="spin"></span><p>Starting Python…</p></div>';
  await glossReady;
  const ok = await Py.ready;   // the maths is Python: nothing is drawn or simulated before it is in
  let bundled = { updated: '', series: [] }, user = [];
  try { bundled = await Data.loadBundled(); } catch { /* opened without a web server: the bundled series are missing, the user's own series still work */ }
  try { user = (await Data.store.list()).map((u) => ({ ...u, kind: 'user' })); } catch { /* storage unavailable */ }
  S.bundledUpdated = bundled.updated;
  S.assets = [...bundled.series, ...user, ...Data.simulated()];
  S.sel = S.sel.filter((id) => byId(id));
  if (!ok) $('#app').insertAdjacentHTML('afterbegin', '<p class="tag">Python could not start (offline?). Only the heavy functions, which stay JavaScript, will work.</p>');
  route();
})();
