'use strict';
/* Screen: My tables. Datasets imported as curve / option chain / free table, with the browser storage in use. */
async function renderTables() {
  $('#app').innerHTML = '<div class="running"><span class="spin"></span></div>';
  const list = await Data.tables.list(), user = S.assets.filter((a) => a.kind === 'user');
  let usage = '';
  try { const e = await navigator.storage.estimate(); usage = `Browser storage used by this site: ${(e.usage / 1048576).toFixed(1)} MB of about ${(e.quota / 1073741824).toFixed(1)} GB available.`; } catch { /* not supported */ }
  $('#app').innerHTML = `<section class="hero compact"><p class="kicker">Data</p><h1>My tables</h1>
    <p class="lead">Everything you import stays in this browser (IndexedDB), never on a server. ${esc(usage)} <a href="#/import">Import more</a></p></section>
    <h2 class="grp">Tables</h2>
    <div class="card table-card">${list.length ? `<table class="plain"><thead><tr><th>Name</th><th>Type</th><th>Columns</th><th>Rows</th><th></th></tr></thead><tbody>${list.map((t) => `<tr><td>${esc(t.name)}</td><td>${esc(t.type)}</td><td>${esc(t.cols.join(', ').slice(0, 70))}</td><td>${t.n}</td><td><button class="link" data-csv="${esc(t.id)}">Export CSV</button> <button class="link danger" data-tdel="${esc(t.id)}">Delete</button></td></tr>`).join('')}</tbody></table>` : '<p class="empty">No table yet. Curves, option chains and free tables you import appear here.</p>'}</div>
    <h2 class="grp">Series</h2>
    <div class="card table-card">${user.length ? `<table class="plain"><thead><tr><th>Name</th><th>Period</th><th>Rows</th></tr></thead><tbody>${user.map((a) => `<tr><td>${esc(a.name)}</td><td>${a.dates ? `${a.dates[0]} → ${a.dates[a.dates.length - 1]}` : 'no dates'}</td><td>${a.close.length}</td></tr>`).join('')}</tbody></table><p class="hint">Series are managed in <a href="#/data">Market data</a>.</p>` : '<p class="empty">No imported series.</p>'}</div>`;
  $('#app').querySelectorAll('[data-tdel]').forEach((b) => b.addEventListener('click', async () => { await Data.tables.remove(b.dataset.tdel); renderTables(); }));
  $('#app').querySelectorAll('[data-csv]').forEach((b) => b.addEventListener('click', () => {
    const t = list.find((x) => x.id === b.dataset.csv), q = (c) => (/[",\n;]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c);
    const blob = new Blob([[t.cols, ...t.rows].map((r) => r.map(q).join(',')).join('\n')], { type: 'text/csv' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = t.name.replace(/[^\w-]+/g, '_') + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }));
}
