'use strict';
/* Day / night mode: the choice is remembered, the first visit follows the system. Loaded in <head> so the page never flashes the wrong theme. Key "n" toggles it. */
(function () {
  const k = 'rh.theme', root = document.documentElement;
  let t = null; try { t = localStorage.getItem(k); } catch { /* storage unavailable */ }
  if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  const apply = (v, fire) => {
    root.dataset.theme = v; t = v;
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = v === 'light' ? '#f4f5f2' : '#0b0d11';
    const b = document.getElementById('themebtn');
    if (b) { const msg = v === 'dark' ? 'Switch to day mode (N)' : 'Switch to night mode (N)'; b.title = msg; b.setAttribute('aria-label', msg); b.textContent = v === 'dark' ? '☀' : '☾'; }
    if (fire) dispatchEvent(new Event('themechange'));
  };
  apply(t, false);
  addEventListener('DOMContentLoaded', () => {
    const nav = document.querySelector('header nav'); if (!nav) return;
    const b = document.createElement('button'); b.id = 'themebtn'; b.type = 'button'; b.className = 'themebtn';
    b.addEventListener('click', () => { const v = t === 'dark' ? 'light' : 'dark'; try { localStorage.setItem(k, v); } catch { /* not remembered */ } apply(v, true); });
    nav.appendChild(b); apply(t, false);
  });
  addEventListener('keydown', (e) => { if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !e.altKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) document.getElementById('themebtn')?.click(); });
})();
