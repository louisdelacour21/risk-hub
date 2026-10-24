'use strict';
/* "Python" button: for the module on screen, shows runnable Python for the same calculation, with the current slider values filled in.
   The code lives in snippets/*.py (one template per module, snippets/index.json maps module id -> file). A template holds the plain Python
   plus placeholders: @@name=default@@ is the slider value, @@RETS@@ / @@MULTI@@ / @@IMP@@ are the shared preambles (snippets/_*.py),
   @@=pick@@ is a value computed from the settings by PICKS below. key = module id, or 'run/<x>' / 'options' for pages that are not lab modules. */
((G) => {
  const n = (x, d) => (x === undefined || x === null || Number.isNaN(Number(x)) ? d : Number(x));
  const PICKS = {
  ecl_5: (v) => (1 - n(v.wd, 0.2)).toFixed(2),
  ecl_6: (v) => n(v.wd, 0.2).toFixed(2),
  garchfit_1: (v) => v.md === 'g' ? 0 : 1,
  deltagamma_5: (v) => v.pos === 'lc' ? 1 : -1,
  deltagamma_6: (v) => ['ss', 'ls'].includes(v.pos || 'ss') ? 'True' : 'False',
  reverse_1: (v) => n(v.L, 20) / 100,
  ols_0: (v) => v.se === 'hac' || v.se === undefined ? '"HAC", cov_kwds={"maxlags": 5}' : '"nonrobust"',
  unitroot_0: (v) => v.tr || 'c',
  unitroot_1: (v) => (v.lg || 'aic').toUpperCase(),
  curvfrtb_4: (v) => ['sc', 'ss', 'bf'].includes(v.pos || 'ss') ? -1 : 1,
  curvfrtb_5: (v) => ['ss', 'ls'].includes(v.pos || 'ss') ? 'True' : 'False',
  optbook_3: (v) => v.st || 'ss',
  krd_0: (v) => v.cv === 'eur' ? 'euro area' : 'US Treasury',
  xvasuite_5: (v) => v.dir === 'pay' ? -1 : 1,
  swapexp_3: (v) => v.dir === 'pay' ? -1 : 1,
  ns_0: (v) => v.pos === 'short' ? -1 : 1,
  xai_1: (v) => v.who || 'hi',
  fairreal_0: (v) => v.grp || 'female',
  fairreal_1: (v) => v.use === 'no' ? 'False' : 'True',
  wwrcrypto_6: (v) => v.pos || 'put',
  cusum_2: (v) => v.bm || 'btc',
  };
  const NODE = typeof module !== 'undefined';
  const read = NODE ? async (f) => require('fs').readFileSync(require('path').join(__dirname, '..', 'snippets', f), 'utf8')
    : (f) => fetch('snippets/' + f).then((r) => { if (!r.ok) throw new Error(f + ' ' + r.status); return r.text(); });
  const cache = {}, text = (f) => cache[f] ||= read(f);
  let IDX = null;
  const index = () => IDX ? Promise.resolve(IDX) : text('index.json').then((t) => (IDX = JSON.parse(t)));
  const file = (k) => { let f = IDX && IDX[k]; while (f && f[0] === '=') f = IDX[f.slice(1)]; return f; };
  async function render(k, v = {}) {
    await index();
    const f = file(k); if (!f) throw new Error('no snippet for ' + k);
    const [t, ...pre] = await Promise.all([text(f), text('_RETS.py'), text('_MULTI.py'), text('_IMP.py')]);
    const shared = { RETS: pre[0], MULTI: pre[1], IMP: pre[2] };
    return t.replace(/@@(RETS|MULTI|IMP)@@/g, (_, s) => shared[s]).replace(/@@(=?\w+?)(?:=([^@]*))?@@/g, (_, s, d) => s[0] === '=' ? PICKS[s.slice(1)](v) : n(v[s], d));
  }

  // ---- UI ----
  const key = () => { const h = location.hash; let m = h.match(/^#\/m\/([a-z0-9_]+)/); if (m) return m[1]; m = h.match(/^#\/run\/([a-z0-9_]+)/); if (m) return 'run/' + m[1]; return /^#\/options/.test(h) ? 'options' : /^#\/?$/.test(h) ? 'portfolio' : /^#\/data/.test(h) ? 'market' : /^#\/import/.test(h) ? 'import' : null; };
  const vals = (k) => (G.Lab && G.Lab.vals && G.Lab.vals[k]) || {};
  const get = (k) => render(k, vals(k)).catch((e) => '# could not build the code: ' + e.message);

  // Python engine on a free Hugging Face Space (sleeps when idle): woken in the background on the first visit, runs the code shown in the dialog.
  const SERVER = 'https://louis-76530-risk-hub-python.hf.space';
  let awake = null;
  const wake = () => awake ||= fetch(SERVER + '/gradio_api/info', { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(r.status); return true; }).catch(() => { awake = null; return false; });
  async function callEngine(code) {   // Gradio REST: POST starts the call, GET streams its result
    const post = await fetch(SERVER + '/gradio_api/call/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: [code] }) });
    if (!post.ok) throw new Error('engine answered ' + post.status);
    const { event_id } = await post.json();
    const txt = await (await fetch(`${SERVER}/gradio_api/call/run/${event_id}`)).text();
    const m = txt.match(/event: complete\s+data: (.*)/);
    if (!m) throw new Error((txt.match(/event: error\s+data: (.*)/) || [, 'no result'])[1]);
    return JSON.parse(m[1])[0];
  }
  async function runRemote(code, out) {
    out.hidden = false; out.className = 'wait';
    const t0 = Date.now(), tick = setInterval(() => { out.textContent = `Waking the Python engine… ${Math.round((Date.now() - t0) / 1000)} s (free server, up to a minute when idle)`; }, 500);
    let up = false;
    for (let i = 0; i < 9 && !up; i++) up = await Promise.race([wake(), new Promise((r) => setTimeout(() => r(false), 10000))]);
    clearInterval(tick);
    if (!up) { out.className = 'bad'; out.textContent = 'The Python engine is not answering. The calculations in the app itself still work; you can also copy this code and run it yourself.'; return; }
    out.textContent = 'Running…';
    try {
      const j = await callEngine(code);
      out.className = j.ok ? '' : 'bad'; out.textContent = (j.out || '') + (j.err ? '\n' + j.err : '') + (j.secs ? `\n[${j.secs} s on the server]` : '');
    } catch (e) { out.className = 'bad'; out.textContent = 'Could not reach the engine: ' + e.message; }
  }

  function init() {
    if (typeof document === 'undefined') return;
    const btn = document.createElement('button');
    btn.id = 'pybtn'; btn.type = 'button'; btn.textContent = 'Python'; btn.title = 'Show this calculation as Python code'; btn.hidden = true;
    const dlg = document.createElement('dialog'); dlg.id = 'pydlg';
    dlg.innerHTML = '<div class="pyhead"><b id="pytitle"></b><span><button type="button" id="pyrun">▶ Run in Python</button><button type="button" id="pycopy">Copy</button><button type="button" id="pydl">Download .py</button><button type="button" id="pyx" aria-label="Close">✕</button></span></div><pre id="pycode" contenteditable="plaintext-only" spellcheck="false"></pre><div id="pyout" hidden></div><small>Uses the slider values currently set. Educational code: check it against your own data before relying on it.</small>';
    document.body.append(btn, dlg);
    const show = async () => { $('#pyout').hidden = true; const k = key(); $('#pytitle').textContent = 'Python · ' + k; $('#pycode').textContent = 'Loading…'; dlg.showModal(); $('#pycode').textContent = await get(k); };
    const $ = (s) => dlg.querySelector(s);
    btn.addEventListener('click', show);
    $('#pyrun').addEventListener('click', () => runRemote($('#pycode').textContent, $('#pyout')));
    wake();
    $('#pyx').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    $('#pycopy').addEventListener('click', async (e) => { const b = e.target, t = $('#pycode').textContent; try { await navigator.clipboard.writeText(t); } catch (_) { const r = document.createRange(); r.selectNodeContents($('#pycode')); getSelection().removeAllRanges(); getSelection().addRange(r); document.execCommand('copy'); } b.textContent = 'Copied'; setTimeout(() => (b.textContent = 'Copy'), 1400); });
    $('#pydl').addEventListener('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([$('#pycode').textContent], { type: 'text/x-python' })); a.download = (key() || 'risk').replace('/', '_') + '.py'; a.click(); URL.revokeObjectURL(a.href); });
    const sync = () => { btn.hidden = !file(key()); };
    addEventListener('hashchange', sync); index().then(sync, () => {});
  }
  G.PyCode = { render, index, key, get };
  if (NODE) module.exports = G.PyCode;
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : globalThis);
