/* Python engine in the browser: Pyodide (free, WebAssembly) runs the modules of engine/*.py; the JavaScript math stays as the fallback
   when Pyodide cannot load (offline, blocked CDN). Py.call('risk', 'kupiec', [250, 3, 0.01]) -> Promise of the JSON-able result. */
(function () {
  const VERSION = '0.26.4', FILES = ['risk.py', 'options.py', 'quant.py','econometrics.py','ml.py','analytics.py','riskx.py','riskx2.py','riskx3.py','riskx5.py','riskx6.py','riskx7.py','riskx11.py','riskx15.py'];
  let boot = null;
  const load = () => boot ||= new Promise((ok, ko) => {
    const s = document.createElement('script'); s.src = `https://cdn.jsdelivr.net/pyodide/v${VERSION}/full/pyodide.js`;
    s.onload = ok; s.onerror = () => ko(new Error('Pyodide unavailable')); document.head.append(s);
  }).then(() => loadPyodide()).then(async (py) => {
    py.FS.mkdir('/engine');
    for (const f of FILES) py.FS.writeFile('/engine/' + f, await (await fetch('engine/' + f)).text());
    py.runPython("import sys, json; sys.path.insert(0, '/engine')");
    return py;
  }).catch((e) => { boot = null; throw e; });
  // JSON has no NaN / Infinity: Python swaps them for markers and the reviver turns them back
  const BOOT = `import importlib, json, math
def _enc(o):
    if isinstance(o, float):
        return o if math.isfinite(o) else ('__nan__' if o != o else '__inf__' if o > 0 else '__-inf__')
    if isinstance(o, dict):
        return {k: _enc(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_enc(v) for v in o]
    return o
def _run(mod, fn):
    return json.dumps(_enc(getattr(importlib.import_module(mod), fn)(*json.loads(_args))))`;
  const SPECIAL = { __nan__: NaN, __inf__: Infinity, '__-inf__': -Infinity };
  const revive = (k, v) => (typeof v === 'string' && v in SPECIAL ? SPECIAL[v] : v);
  const call = async (mod, fn, args = []) => {
    const py = await load();
    if (!py.globals.get('_run')) py.runPython(BOOT);
    py.globals.set('_args', JSON.stringify(args));
    return JSON.parse(py.runPython(`_run('${mod}', '${fn}')`), revive);
  };
  // Python first, JavaScript if the engine cannot start
  const withFallback = async (mod, fn, args, js) => { try { return await call(mod, fn, args); } catch (e) { console.warn('Python engine off, JS fallback:', e.message); return js(); } };
  // ---- screens on Python: the high-level Risk / Risk.x functions are swapped for wrappers once the engine is ready; JS stays the fallback ----
  const ADAPT = `import inspect
_NS = {'Risk': ['risk','options','quant','econometrics','ml','analytics'], 'eco': ['econometrics'], 'ml': ['ml'], 'X': ['riskx','riskx2','riskx3','riskx5','riskx6','riskx7','riskx11','riskx15']}
def _dec(o):
    if isinstance(o, str):
        return {'__nan__': math.nan, '__inf__': math.inf, '__-inf__': -math.inf}.get(o, o)
    if isinstance(o, dict):
        return {k: _dec(v) for k, v in o.items()}
    if isinstance(o, list):
        return [_dec(v) for v in o]
    return o
def _snake(s):
    return ''.join('_' + c.lower() if c.isupper() else c for c in s)
def _find(ns, fn):
    for m in _NS[ns]:
        f = getattr(importlib.import_module(m), fn, None)
        if inspect.isfunction(f) and f.__module__ == m:
            return f
def _has(ns, fn):
    return _find(ns, _snake(fn)) is not None
def _wrap(ns, fn):
    f = _find(ns, _snake(fn))
    a = _dec(json.loads(_args))
    ps = inspect.signature(f).parameters
    if a and isinstance(a[-1], dict) and a[-1] and len(a) <= len(ps):
        p = list(ps.values())[len(a) - 1]
        ks = {k: (k if k in ps else _snake(k)) for k in a[-1]}
        if p.default is not inspect.Parameter.empty and not isinstance(p.default, dict) and all(v in ps for v in ks.values()):
            a = a[:-1] + [{ks[k]: v for k, v in a[-1].items()}]
            return json.dumps(_enc(f(*a[:-1], **a[-1])))
    return json.dumps(_enc(f(*a)))`;
  const manifest = {}, SKIP = new Set(['mean', 'std', 'quantile', 'qtile', 'interp', 'skew', 'kurt', 'sum', 'rng', 'normCdf', 'normPdf', 'normInv', 'sortedCopy']);
  const enc = (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? (v !== v ? '__nan__' : v > 0 ? '__inf__' : '__-inf__') : ArrayBuffer.isView(v) ? Array.from(v) : v);
  const hasFn = (a) => a.some((x) => typeof x === 'function' || (x && typeof x === 'object' && Object.values(x).some((y) => typeof y === 'function')));
  const check = new URLSearchParams(location.search).has('pycheck'), mismatch = [];
  const near = (a, b) => (typeof a === 'number' && typeof b === 'number' ? (a === b || (a !== a && b !== b) || Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b)))
    : a && b && typeof a === 'object' && typeof b === 'object' ? Object.keys(b).every((k) => near(a[k], b[k])) : a === b || (a == null && b == null));
  // measured in Pyodide: too heavy for the main thread (seconds), so the JavaScript version stays; Monte Carlo and repeated fits go to the remote Space
  const HEAVY = ['Risk.bootstrapVar', 'X.fitCopulas', 'X.swapXva', 'X.wwrCva', 'X.supF', 'X.bootWindows', 'X.lda', 'X.opScenarios', 'X.dccFit', 'X.dcor',
    'X.fhsPaths', 'X.modelRisk', 'Risk.volCone', 'X.rollingDrift',
    // they return closures (cdf, widen, curve, at...) that JSON cannot carry: the screens call them, so these stay JavaScript
    'Risk.evtTail', 'X.creditRiskPlus', 'X.negBasis', 'X.ftp', 'Risk.nsFit', 'ml.logistic', 'ml.quantReg', 'X.merton', 'X.curvature', 'Risk.mcCall', 'eco.garchMle', 'X.permImportance', 'X.shapley', 'Risk.nelderMead', 'X.golden'];
  const slow = new Set(HEAVY), times = {}, jtimes = {}, bad = {}, LIMIT_MS = 700;
  let active = 0;
  const install = (py) => {
    if (!py.globals.get('_wrap')) py.runPython(ADAPT);
    const has = py.globals.get('_has'), wrap = py.globals.get('_wrap'), run = (ns, fn, args) => { py.globals.set('_args', JSON.stringify(args, enc)); return JSON.parse(wrap(ns, fn), revive); };
    for (const [ns, obj] of [['Risk', Risk], ['X', Risk.x], ['eco', Risk.eco], ['ml', Risk.ml]]) {
      if (!obj) continue;
      // names the JS no longer has (stripped, Python provides them) plus the JS ones that Python can also run
      for (const fn of new Set([...Object.keys(obj), ...(manifest[ns] || [])])) {
        const js = obj[fn];
        if (js && (typeof js !== 'function' || js._py || SKIP.has(fn) || /^[A-Z_]/.test(fn))) continue;
        if (!has(ns, fn)) continue;
        const key = ns + '.' + fn;
        const w = function (...a) {
          while (a.length && a[a.length - 1] === undefined) a.pop();
          if (js && (slow.has(key) || !a.length || a.every((x) => typeof x === 'number') || hasFn(a))) return js.apply(this, a);
          const t0 = performance.now();
          let r;
          try { r = run(ns, fn, a); } catch (e) { if (!js) throw e; console.warn('Python off for ' + fn + ', JS used:', e.message); return js.apply(this, a); }
          const ms = performance.now() - t0; times[key] = Math.max(times[key] || 0, Math.round(ms));
          if (js && check) { const t1 = performance.now(), j = js.apply(this, a); jtimes[key] = Math.max(jtimes[key] || 0, Math.round(performance.now() - t1)); if (!near(r, j)) { mismatch.push(key); bad[key] = [a, r, j]; } return j; }
          return r;
        };
        w._py = true; obj[fn] = w; active++;
      }
    }
    return active;
  };
  // boot in the background so the first Python screen is already warm; the current screen redraws when the engine is in
  const start = async () => {  // resolves true when Python is in, false when it could not start
    try { const py = await load(); Object.assign(manifest, await (await fetch('engine/manifest.json')).json()); if (!py.globals.get('_run')) py.runPython(BOOT); install(py); window.Py.on = true; dispatchEvent(new Event('pyready')); return true; } catch (e) { console.warn('Python engine unavailable, the JavaScript math stays in charge:', e.message); }
  };
  window.Py = { call, load, withFallback, mismatch, slow, times, jtimes, bad, active: () => active, rollingBacktest: (r, m, c, W) => call('risk', 'rolling_backtest', [r, m, c, W]) };
  Py.ready = start();   // the app waits for it before drawing the first screen
})();
