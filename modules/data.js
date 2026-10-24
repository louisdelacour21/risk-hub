'use strict';
/* Screen: market data and uploads. */
async function renderData() {
  const user = S.assets.filter((a) => a.kind === 'user'), bundled = S.assets.filter((a) => a.kind === 'bundled');
  const note = Data.store.persistent() ? 'Saved in this browser (IndexedDB): they survive reloads and are never uploaded.' : 'Your browser blocks storage (private window?): files will be forgotten when you close the tab.';
  $('#app').innerHTML = `
    <section class="hero compact"><p class="kicker">Market data</p><h1>Your data stays put</h1>
      <p class="lead">Nothing here calls an API when you open the site. Public series are files stored with the site, refreshed by a script (last refresh: <b>${esc(S.bundledUpdated || 'unknown')}</b>). Your own series are saved in this browser.</p></section>
    <h2 class="grp">Update the data</h2>
    <div class="card update"><p class="hint" id="upstat">Checking for the local launcher…</p>
      <button class="primary" id="upgo" disabled>Fetch the latest data now</button><pre id="uplog" hidden></pre></div>
    <h2 class="grp">Add your own series</h2>
    <div class="card upload"><div class="field"><label class="lab-t" for="uname">Name</label><input id="uname" type="text" placeholder="e.g. LVMH, MSCI World, my fund" maxlength="40"></div>
      <div class="field"><label class="lab-t" for="ufile">CSV file</label><input id="ufile" type="file" accept=".csv,.txt"></div>
      <button class="primary" id="uadd">Save series</button><p class="hint" id="umsg">One date column (optional) and one price or return column, at least 300 rows. Prices become simple returns; returns can be in % or decimals. If the file has a header, "Adj Close", "Close", "Price" or "Return" is used. Download series from your broker or Yahoo Finance and drop the file here. ${esc(note)}</p></div>
    <h2 class="grp">My series</h2>
    <div class="card table-card">${user.length ? `<table class="plain"><thead><tr><th>Name</th><th>Period</th><th>Rows</th><th></th></tr></thead><tbody>${user.map((a) => `<tr><td>${esc(a.name)}</td><td>${a.dates ? `${a.dates[0]} → ${a.dates[a.dates.length - 1]}` : 'no dates'}</td><td>${a.close.length}</td><td><button class="link danger" data-del="${esc(a.id)}">Delete</button></td></tr>`).join('')}</tbody></table>` : '<p class="empty">Nothing saved yet.</p>'}</div>
    <h2 class="grp">Public series bundled with the site</h2>
    <div class="card table-card"><table class="plain"><thead><tr><th>Series</th><th>Class</th><th>Source</th><th>Period</th><th>Rows</th></tr></thead><tbody>${bundled.map((a) => `<tr><td>${esc(a.name)}</td><td>${esc(a.class)}</td><td>${esc(a.source)}</td><td>${a.from} → ${a.to}</td><td>${a.n}</td></tr>`).join('')}</tbody></table></div>
    <p class="fine">Refresh: <code>python tools/refresh_data.py</code> rewrites <code>data/*.csv</code>; a scheduled GitHub Action does it every weekday. Terms of use of each source apply (ECB reference rates, CBOE, Binance Vision CC BY-NC-SA 4.0, Deribit public API). Yahoo Finance data is for personal use only.</p>`;
  probeLauncher();
}
async function probeLauncher() {
  const st = $('#upstat'), go = $('#upgo');
  try {
    const j = await (await fetch('/api/ping', { cache: 'no-store' })).json(); if (!j.ok) throw new Error();
    st.textContent = `Local launcher detected. Data on disk was refreshed ${S.bundledUpdated || 'at an unknown date'}. The button runs the download scripts on this computer (Binance Vision, ECB, US Treasury, NY Fed, CBOE, Deribit options).`; go.disabled = false;
  } catch { st.textContent = 'This copy has no local launcher, so the button is off. On the public site, the data is refreshed by a scheduled GitHub Action. To refresh here, start Risk Hub.bat.'; return; }
  go.addEventListener('click', async () => {
    const log = $('#uplog'); go.disabled = true; log.hidden = false; log.textContent = '';
    try {
      const r = await fetch('/api/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'The refresh could not start.');
      const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '', code = null;
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); let nl;
        while ((nl = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1); if (!line) continue; const j = JSON.parse(line); if (j.line != null) { log.textContent += j.line + '\n'; log.scrollTop = log.scrollHeight; } if (j.done) code = j.code; }
      }
      st.textContent = code === 0 ? 'Done. Reloading with the new data…' : `Finished with warnings (code ${code}): old files were kept for any source that failed. Reloading…`;
      setTimeout(() => location.reload(), 1800);
    } catch (e) { st.textContent = e.message; go.disabled = false; }
  });
}

/* ------------------------------------------------------------------ screen 3: results */
