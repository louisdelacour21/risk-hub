'use strict';
/* App shell: vertical sidebar built from REGISTRY, home grid, Ctrl+K search. Screens themselves stay in app.js. */
const Shell = (function () {
  const R = REGISTRY, K = 'rh.shell';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const load = () => { try { return JSON.parse(localStorage.getItem(K)) || {}; } catch { return {}; } };
  const st = load(); st.open ||= {}; st.min = !!st.min;
  const save = () => { try { localStorage.setItem(K, JSON.stringify(st)); } catch { /* not remembered */ } };
  const live = (c) => R.mods.filter((m) => m.cat === c.id && m.route);
  const current = (h) => h && R.mods.find((m) => m.match && m.match.test(h));
  const $side = document.getElementById('side');
  let q = '';

  function link(m) {
    return m.route ? `<a class="sl" href="${m.route}" data-mod="${m.id}">${esc(m.title)}</a>`
      : `<span class="sl soon" title="${esc(m.about)} · coming soon" aria-disabled="true">${esc(m.title)}<em>soon</em></span>`;
  }
  function build() {
    const f = q.trim().toLowerCase();
    const cats = R.cats.map((c) => {
      let ms = R.mods.filter((m) => m.cat === c.id);
      const total = ms.length;
      if (f) ms = ms.filter((m) => `${m.title} ${m.about}`.toLowerCase().includes(f));
      if (!ms.length) return '';
      const open = f || st.open[c.id];
      return `<section class="sc ${open ? 'open' : ''}"><button class="sh" data-cat="${c.id}" aria-expanded="${!!open}" title="${esc(c.title)}"><i aria-hidden="true">${c.icon}</i><span>${esc(c.title)}</span><small>${live(c).length}/${total}</small></button><div class="sb">${ms.map(link).join('')}</div></section>`;
    }).join('');
    $side.innerHTML = `<div class="sq"><input id="sq" type="search" placeholder="Search modules (Ctrl+K)" aria-label="Search modules" value="${esc(q)}" autocomplete="off"></div><nav class="sn" aria-label="Modules">${cats || '<p class="sempty">No module matches.</p>'}</nav><button class="smin" id="smin" aria-label="Collapse the sidebar" title="Collapse / expand">«</button>`;
    document.body.classList.toggle('side-min', st.min);
    mark();
  }
  function mark() {
    const m = current(location.hash);
    $side.querySelectorAll('[data-mod]').forEach((a) => { const on = m && a.dataset.mod === m.id; a.classList.toggle('on', !!on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    return m;
  }
  function sync() {
    if (!$side) return;
    const m = mark();
    if (m && !st.open[m.cat] && !q) { st.open[m.cat] = true; save(); build(); }
  }
  function home() {
    document.getElementById('app').innerHTML = `<div class="hero compact"><p class="kicker">Risk Hub</p><h1>Pick a toolbox</h1><p class="lead">Every module runs in your browser. Greyed ones are on the roadmap.</p></div>
      <div class="catgrid">${R.cats.map((c) => {
        const all = R.mods.filter((m) => m.cat === c.id), on = live(c), first = on[0], tag = first ? `a href="${first.route}"` : 'div';
        return `<${tag} class="catcard ${first ? '' : 'dim'}"><i aria-hidden="true">${c.icon}</i><b>${esc(c.title)}</b><span>${esc(c.blurb)}</span><small>${on.length ? `${on.length} ready · ${all.length - on.length} soon` : `${all.length} soon`}</small></${first ? 'a' : 'div'}>`;
      }).join('')}</div>`;
  }

  if ($side) {
    build();
    $side.addEventListener('click', (e) => {
      const h = e.target.closest('[data-cat]'); if (h) { st.open[h.dataset.cat] = !st.open[h.dataset.cat]; save(); build(); return; }
      if (e.target.closest('#smin')) { st.min = !st.min; save(); document.body.classList.toggle('side-min', st.min); }
    });
    $side.addEventListener('input', (e) => {
      if (e.target.id !== 'sq') return;
      q = e.target.value; const p = e.target.selectionStart; build();
      const i = document.getElementById('sq'); i.focus(); i.setSelectionRange(p, p);
    });
    $side.addEventListener('keydown', (e) => {
      if (e.target.id !== 'sq') return;
      if (e.key === 'Enter') { const a = $side.querySelector('a.sl'); if (a) { location.hash = a.getAttribute('href'); q = ''; build(); } }
      if (e.key === 'Escape') { q = ''; build(); }
    });
    addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (st.min) { st.min = false; save(); document.body.classList.remove('side-min'); }
        document.getElementById('sq')?.focus();
      }
    });
  }
  return { sync, home };
})();
