'use strict';
/* Lab: the common frame of the module screens (title, sliders, asset picker, canvas plots). A module = Lab.reg(id, spec).
   spec = { title, kicker, lead, note, asset?: true, controls: [...], draw(v, out, ctx) }; control = {id, label, min, max, step, val, fmt?, gloss?} | {id, label, opts:[[v,text]], val} | {id, label, run:true}. */
const Lab = (function () {
  const mods = {}, vals = {};
  const COL = { a: '--accent', b: '--accent-2', r: '--red', y: '--yellow', g: '--green', m: '--muted' };
  const colour = (c, col) => (c && c[0] === '#' ? c : col(COL[c] || c || '--accent'));

  /* plot(cv, {series:[{x,y,c,w,dash,dots,bar,alpha,fill}], xfmt, yfmt, h, xlim, ylim, vlines:[{x,t,c}], hlines:[{y,t,c}], legend}) */
  function plot(cv, o) {
    const h = o.h || 250, c = setup(cv, h), { g, W, col } = c, pad = { l: o.padL || 52, r: 14, t: 12, b: 24 };
    const xs = o.series.flatMap((s) => s.x).filter(Number.isFinite), ys = o.series.flatMap((s) => s.y).filter(Number.isFinite);
    let x0 = o.xlim ? o.xlim[0] : Math.min(...xs), x1 = o.xlim ? o.xlim[1] : Math.max(...xs), y0 = o.ylim ? o.ylim[0] : Math.min(...ys), y1 = o.ylim ? o.ylim[1] : Math.max(...ys);
    if (!o.ylim) { const p = (y1 - y0) * 0.08 || Math.abs(y0) * 0.1 || 1; y0 -= p; y1 += p; }
    if (x1 === x0) x1 = x0 + 1;
    const X = (v) => pad.l + (v - x0) / (x1 - x0) * (W - pad.l - pad.r), Y = (v) => pad.t + (1 - (v - y0) / (y1 - y0)) * (h - pad.t - pad.b), cl = (v) => Math.max(Math.min(v, y1), y0);
    g.font = '11px system-ui'; g.fillStyle = col('--muted'); g.strokeStyle = col('--border'); g.lineWidth = 1;
    const yf = o.yfmt || ((v) => v.toPrecision(3)), xf = o.xfmt || ((v) => v.toPrecision(3));
    for (let k = 0; k <= 4; k++) { const v = y0 + (y1 - y0) * k / 4; g.beginPath(); g.moveTo(pad.l, Y(v)); g.lineTo(W - pad.r, Y(v)); g.stroke(); g.textAlign = 'left'; g.fillText(yf(v), 4, Y(v) + 4); }
    g.textAlign = 'center'; for (let k = 0; k <= 5; k++) { const v = x0 + (x1 - x0) * k / 5; g.fillText(xf(v), Math.min(Math.max(X(v), pad.l + 12), W - pad.r - 12), h - 7); } g.textAlign = 'left';
    for (const l of o.hlines || []) { g.strokeStyle = colour(l.c || 'm', col); g.setLineDash([4, 4]); g.beginPath(); g.moveTo(pad.l, Y(l.y)); g.lineTo(W - pad.r, Y(l.y)); g.stroke(); g.setLineDash([]); if (l.t) { g.fillStyle = g.strokeStyle; g.textAlign = 'right'; g.fillText(l.t, W - pad.r - 2, Y(l.y) - 4); g.textAlign = 'left'; } }
    for (const l of o.vlines || []) { g.strokeStyle = colour(l.c || 'm', col); g.setLineDash([4, 4]); g.beginPath(); g.moveTo(X(l.x), pad.t); g.lineTo(X(l.x), h - pad.b); g.stroke(); g.setLineDash([]); if (l.t) { g.fillStyle = g.strokeStyle; g.fillText(l.t, Math.min(X(l.x) + 4, W - 70), pad.t + 10); } }
    for (const s of o.series) {
      const k = colour(s.c, col); g.strokeStyle = k; g.fillStyle = k; g.lineWidth = s.w || 1.8; g.globalAlpha = s.alpha ?? 1; g.setLineDash(s.dash || []);
      if (s.bar) { const bw = Math.max(1, (W - pad.l - pad.r) / s.x.length * 0.85); s.x.forEach((x, i) => g.fillRect(X(x) - bw / 2, Y(Math.max(s.y[i], 0)), bw, Math.abs(Y(0) - Y(s.y[i])))); }
      else if (s.dots) { s.x.forEach((x, i) => { if (Number.isFinite(s.y[i])) { g.beginPath(); g.arc(X(x), Y(cl(s.y[i])), s.r || 2.6, 0, 7); g.fill(); } }); }
      else {
        g.beginPath(); let on = false; s.x.forEach((x, i) => { const v = s.y[i]; if (!Number.isFinite(v)) { on = false; return; } on ? g.lineTo(X(x), Y(cl(v))) : g.moveTo(X(x), Y(cl(v))); on = true; }); g.stroke();
        if (s.fill) { g.lineTo(X(s.x[s.x.length - 1]), Y(Math.max(y0, Math.min(0, y1)))); g.lineTo(X(s.x[0]), Y(Math.max(y0, Math.min(0, y1)))); g.closePath(); g.globalAlpha = 0.16; g.fill(); }
      }
      g.setLineDash([]); g.globalAlpha = 1;
    }
    return { X, Y };
  }
  const legend = (items) => `<div class="legend">${items.map(([c, t]) => `<span><i class="dot" style="background:${c[0] === '#' ? c : `var(${COL[c] || c})`}"></i>${t}</span>`).join('')}</div>`;
  const card = (id, title, items, gloss) => `<div class="card chart-card"><div class="chart-head"><h2>${title}${gloss ? tip(gloss) : ''}</h2>${items ? legend(items) : ''}<button type="button" class="png-btn" data-png="${id}" title="Save this chart as a PNG image" style="margin-left:auto;font-size:12px;padding:2px 8px">PNG</button></div><canvas id="${id}"></canvas></div>`;
  const table = (head, rows, cls = '') => `<div class="card table-card ${cls}"><table class="plain"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const note = (html) => `<div class="card note"><p>${html}</p></div>`;

  function ctl(m, v) {
    if (m.run) return `<div class="field"><button class="primary" id="c_${m.id}" type="button">${m.label}</button></div>`;
    if (m.sel) return `<div class="field"><label class="lab-t" for="c_${m.id}">${m.label}${m.gloss ? tip(m.gloss) : ''}</label><select id="c_${m.id}">${(typeof m.sel === 'function' ? m.sel() : m.sel).map(([a, t]) => `<option value="${a}" ${String(a) === String(v[m.id]) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`;
    if (m.opts) return seg('c_' + m.id, m.label, m.opts, v[m.id], m.gloss);
    if (m.text) return `<div class="field"><label class="lab-t" for="c_${m.id}">${m.label}${m.gloss ? tip(m.gloss) : ''}</label><textarea id="c_${m.id}" rows="${m.rows || 5}" spellcheck="false">${esc(v[m.id])}</textarea></div>`;
    return `<div class="field"><label class="lab-t" for="c_${m.id}">${m.label}${m.gloss ? tip(m.gloss) : ''} <output id="o_${m.id}">${(m.fmt || String)(v[m.id])}</output></label><input type="range" id="c_${m.id}" min="${m.min}" max="${m.max}" step="${m.step}" value="${v[m.id]}"></div>`;
  }
  async function pickAsset(spec) {
    const real = S.assets.filter((a) => !isSim(a));
    let id = vals._asset === PF_ID && S.sel.length ? PF_ID : vals._asset && byId(vals._asset) ? vals._asset : S.sel.length > 1 && !selected().some(isSim) ? PF_ID : (selected()[0] || byId('btc') || S.assets[0]).id;
    const a = await resolveAsset(id);
    return { id, a, real };
  }
  async function mount(id, ctxOverride) {
    const spec = mods[id], app = $('#app'); if (!spec) { app.innerHTML = '<div class="card"><p class="fail">Unknown module.</p></div>'; return; }
    const v = vals[id] ||= {}; for (const c of spec.controls || []) if (v[c.id] === undefined && !c.run) v[c.id] = typeof c.val === 'function' ? c.val() : c.val;
    const assetBar = spec.asset ? `<div class="field"><label class="lab-t" for="c__asset">Asset</label><select id="c__asset">${(S.sel.length ? [{ id: PF_ID, name: '★ My portfolio (from Market Data)' }] : []).concat(S.assets).map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></div>` : '';
    app.innerHTML = `<section class="hero compact"><p class="kicker">${spec.kicker || ''}</p><h1>${spec.title}</h1><p class="lead">${spec.lead || ''}</p></section>
      <section class="lab"><aside class="card controls">${assetBar}${(spec.controls || []).map((m) => ctl(m, v)).join('')}${spec.aside ? `<small class="mut">${spec.aside}</small>` : ''}</aside><div class="out" id="lab-out"></div></section>
      ${spec.note ? `<section class="notes">${note(spec.note)}</section>` : ''}`;
    const out = $('#lab-out'); let seq = 0;
    if (spec.asset) { const sel = $('#c__asset'); sel.value = (await pickAsset(spec)).id; sel.addEventListener('change', () => { vals._asset = sel.value; pref.set('labAsset', sel.value); redraw(); }); }
    const redraw = async () => {
      const my = ++seq; let ctx = {};
      try {
        if (spec.asset) { const p = await pickAsset(spec); ctx = { asset: p.a, ...Data.returnsOf(p.a) }; if (ctx.r.length < 300) throw new Error('Not enough data for this asset.'); }
        window.PPY = ctx.dates && Risk.periodsPerYear(ctx.dates) > 300 ? 365 : 252; // crypto trades every day: a year is 365 observations, not 252
        const res = await spec.draw(v, out, ctx); if (my !== seq) return; if (typeof res === 'string') out.innerHTML = res;
      } catch (e) { if (my === seq) out.innerHTML = `<div class="card"><p class="fail">${esc(e.message || e)}</p></div>`; console.error(e); }
    };
    for (const m of spec.controls || []) {
      const el = $('#c_' + m.id); if (!el) continue;
      if (m.run) { el.addEventListener('click', async () => { el.disabled = true; const t = el.textContent; el.textContent = 'Running…'; await tick(); try { v._run = (v._run || 0) + 1; await redraw(); } finally { el.disabled = false; el.textContent = t; } }); continue; }
      if (m.opts) { el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || b.disabled) return; v[m.id] = isNaN(b.dataset.v) ? b.dataset.v : Number(b.dataset.v); el.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b)); redraw(); }); continue; }
      if (m.sel) { el.addEventListener('change', () => { v[m.id] = el.value; redraw(); }); continue; }
      if (m.text) { el.addEventListener('input', () => { v[m.id] = el.value; clearTimeout(el._t); el._t = setTimeout(redraw, 250); }); continue; }
      el.addEventListener('input', () => { v[m.id] = Number(el.value); $('#o_' + m.id).textContent = (m.fmt || String)(v[m.id]); clearTimeout(el._t); el._t = setTimeout(redraw, m.slow ? 220 : 30); });
    }
    if (!spec.manual) redraw(); else out.innerHTML = '<div class="card"><p class="mut">Set the parameters, then press the button.</p></div>';
    if (spec.manual) for (const m of spec.controls) if (m.run) $('#c_' + m.id).addEventListener('click', () => { /* handled above */ });
  }
  window.PPY = 252; // observations per year, reset by each draw from the asset's dates
  const reg = (id, spec) => { mods[id] = spec; };
  const pc = (d = 2) => (v) => (v * 100).toFixed(d) + '%';
  return { reg, mount, plot, legend, card, table, note, pc, vals, COL, colour };
})();
const assetOpts = () => S.assets.filter((a) => !isSim(a)).map((a) => [a.id, a.name]);
const assetOptsPf = () => [...(S.sel.length && !selected().some(isSim) ? [[PF_ID, '★ My portfolio (from Market Data)']] : []), ...assetOpts()];
const histo = (xs, bins = 30) => { const lo = Math.min(...xs), hi = Math.max(...xs), w = (hi - lo) / bins || 1, c = Array(bins).fill(0); xs.forEach((x) => c[Math.min(bins - 1, Math.floor((x - lo) / w))]++); return { x: c.map((_, i) => lo + (i + 0.5) * w), y: c }; };
const dateAxis = (dates) => (v) => (dates && dates[Math.round(v)]) || '';
const later = (f) => setTimeout(f, 0);

/* PNG export: one delegated handler for every chart card */
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('.png-btn'); if (!b) return;
  const cv = document.getElementById(b.dataset.png); if (!cv || !cv.width || !cv.height) return;
  const o = document.createElement('canvas'); o.width = cv.width; o.height = cv.height;
  const g = o.getContext('2d'); g.fillStyle = getComputedStyle(document.body).backgroundColor || '#fff'; g.fillRect(0, 0, o.width, o.height); g.drawImage(cv, 0, 0);
  const a = document.createElement('a'); a.href = o.toDataURL('image/png'); a.download = 'risk-hub-' + location.hash.replace(/\W+/g, '-').slice(1) + '-' + b.dataset.png + '.png'; a.click();
});
