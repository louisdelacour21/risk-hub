'use strict';
/* Screen: import your own data. Paste from Excel or load a CSV, check the detected type and columns, save.
   "series" columns become assets usable everywhere (Portfolio, VaR...); curves, option chains and free tables go to My tables. */
const IMP = { det: null, type: 'series', file: '' };
const TYPE_INFO = {
  series: ['Price or return series', 'A date column and one or more price (or return) columns. Each column becomes an asset.'],
  curve: ['Yield curve history', 'One row per date, one column per maturity (3M, 2Y, 10Y…), rates in %.'],
  chain: ['Option chain', 'Columns such as expiry, strike, type (C/P), implied vol or price.'],
  table: ['Free table', 'Anything else. Stored as is, for the modules that will read it.'],
};

function renderImport() {
  $('#app').innerHTML = `<section class="hero compact"><p class="kicker">Data</p><h1>Import your data</h1>
    <p class="lead">Copy cells in Excel and paste them below, or open a CSV file. Nothing is uploaded: the data stays in this browser.</p></section>
    <div class="card import">
      <div class="field"><label class="lab-t" for="itxt">Paste here (Excel, Google Sheets, CSV text)</label><textarea id="itxt" rows="7" spellcheck="false" placeholder="Date\tAAA\tBBB\n2024-01-02\t101,5\t48,2\n…"></textarea></div>
      <div class="field"><label class="lab-t" for="ifile">…or a file</label><input id="ifile" type="file" accept=".csv,.tsv,.txt"><small>.xlsx files are not read yet: in Excel, choose Save as → CSV, or just copy and paste the cells.</small></div>
      <button class="primary" id="iread">Read the data</button><p class="hint" id="imsg"></p>
    </div><div id="iout"></div>`;
  $('#ifile').addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) { IMP.file = f.name.replace(/\.[^.]+$/, ''); $('#itxt').value = await f.text(); readImport(); } });
  $('#iread').addEventListener('click', readImport);
}

function readImport() {
  const msg = $('#imsg'), text = $('#itxt').value;
  msg.className = 'hint';
  if (!text.trim()) { msg.textContent = 'Paste some cells or choose a file first.'; msg.classList.add('fail'); return; }
  const g = Tables.parseGrid(text);
  if (g.rows.length < 2) { msg.textContent = 'Only one line found: a header and at least one row are needed.'; msg.classList.add('fail'); return; }
  IMP.det = Tables.detect(g.rows); IMP.type = IMP.det.type;
  msg.textContent = `${g.rows.length} lines, ${g.rows[0].length} columns read.`;
  drawImport();
}

function drawImport() {
  const d = IMP.det, out = $('#iout'), t = IMP.type, prev = [d.names, ...d.body.slice(0, 8)];
  const colSel = `<select id="idate"><option value="-1">(none)</option>${d.names.map((n, j) => `<option value="${j}" ${j === d.dateCol ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  out.innerHTML = `<h2 class="grp">Preview</h2>
    <div class="card table-card"><table class="plain"><thead><tr>${d.names.map((n) => `<th>${esc(n)}</th>`).join('')}</tr></thead><tbody>${prev.slice(1).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table><p class="hint">${d.body.length} data rows${d.header ? '' : ', no header line found'}.</p></div>
    <h2 class="grp">What is it?</h2>
    <div class="card"><div class="seg" id="itype" role="group" aria-label="Type of data">${Object.entries(TYPE_INFO).map(([k, [n]]) => `<button data-v="${k}" aria-pressed="${k === t}">${n}</button>`).join('')}</div>
      <p class="hint">${TYPE_INFO[t][1]} Detected: <b>${TYPE_INFO[d.type][0]}</b>.</p>
      <div id="imap">${t === 'series' ? `<div class="field"><span class="lab-t">Date column</span>${colSel}</div>
        <div class="field"><span class="lab-t">Columns to import (one asset each)</span><div class="icols">${d.names.map((n, j) => `<label class="check"><input type="checkbox" data-c="${j}" ${d.numCols.includes(j) ? 'checked' : ''}> <input type="text" class="cn" data-n="${j}" value="${esc(n)}" maxlength="40" aria-label="Name of column ${esc(n)}"></label>`).join('')}</div></div>`
        : `<div class="field"><label class="lab-t" for="itn">Name</label><input id="itn" type="text" maxlength="40" value="${esc(IMP.file || TYPE_INFO[t][0])}"></div>`}</div>
      <button class="primary" id="isave">Check and save</button><div id="ires" class="chk" aria-live="polite"></div></div>`;
  $('#itype').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { IMP.type = b.dataset.v; drawImport(); } });
  $('#isave').addEventListener('click', saveImport);
}

async function saveImport() {
  const d = IMP.det, res = $('#ires'), t = IMP.type, items = [];
  res.innerHTML = '';
  try {
    if (t === 'series') {
      const dateCol = +$('#idate').value, cols = [...document.querySelectorAll('[data-c]')].filter((c) => c.checked).map((c) => +c.dataset.c);
      if (!cols.length) throw new Error('Tick at least one column to import.');
      const bad = [];
      for (const j of cols) {
        const nm = ($(`[data-n="${j}"]`).value.trim() || d.names[j]).slice(0, 40), s = Tables.seriesFrom({ ...d, names: d.names.map((n, k) => (k === j ? nm : n)) }, j, dateCol);
        if (s.errors.length) bad.push(...s.errors); else items.push(s);
      }
      if (bad.length) throw new Error(bad.join('. '));
      for (const s of items) {
        const rec = { id: 'u' + Date.now() + Math.random().toString(36).slice(2, 5), name: s.name, class: 'My data', source: 'Imported table', kind: 'user', dates: s.dates, close: s.close, from: s.dates?.[0], to: s.dates?.[s.dates.length - 1], n: s.close.length, added: new Date().toISOString() };
        await Data.store.put(rec); S.assets.splice(S.assets.findIndex((x) => x.kind === 'sim'), 0, rec);
      }
      res.innerHTML = `<p class="pass">Saved ${items.length} series.</p>${items.map((s) => `<p class="hint"><b>${esc(s.name)}</b>: ${s.close.length} rows${s.dates ? `, ${s.dates[0]} → ${s.dates[s.dates.length - 1]}` : ''}. ${s.notes.map(esc).join('; ')}.</p>`).join('')}<p class="hint"><a href="#/">Use them in a portfolio</a> · <a href="#/data">Manage series</a></p>`;
    } else {
      const name = ($('#itn').value.trim() || TYPE_INFO[t][0]).slice(0, 40);
      if (d.body.length < 2) throw new Error('At least two data rows are needed.');
      const rows = d.body.map((r) => r.map((c, j) => (d.numCols.includes(j) || j === d.dateCol ? (j === d.dateCol ? (Tables.dateOf(c) || c) : Tables.toNum(c)) : c)));
      if (t === 'curve' && d.numCols.length < 3) throw new Error('A curve needs at least 3 maturity columns with numbers.');
      if (t === 'chain' && !d.names.some((n) => /strike/i.test(n))) throw new Error('An option chain needs a "strike" column.');
      const rec = { id: 't' + Date.now(), type: t, name, cols: d.names, dateCol: d.dateCol, rows, n: rows.length, added: new Date().toISOString() };
      await Data.tables.put(rec);
      res.innerHTML = `<p class="pass">Saved “${esc(name)}” (${rows.length} rows, ${d.names.length} columns) as ${esc(TYPE_INFO[t][0].toLowerCase())}.</p><p class="hint"><a href="#/tables">See My tables</a></p>`;
    }
  } catch (e) { res.innerHTML = `<p class="fail">${esc(e.message)}</p>`; }
}
