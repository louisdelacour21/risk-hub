/* Python engine in the browser: Pyodide (free, WebAssembly) runs the modules of engine/*.py; the JavaScript math stays as the fallback
   when Pyodide cannot load (offline, blocked CDN). Py.call('risk', 'kupiec', [250, 3, 0.01]) -> Promise of the JSON-able result. */
(function () {
  const VERSION = '0.26.4', FILES = ['risk.py', 'options.py', 'quant.py','econometrics.py','ml.py','analytics.py','riskx.py'];
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
  window.Py = { call, load, withFallback, rollingBacktest: (r, m, c, W) => withFallback('risk', 'rolling_backtest', [r, m, c, W], () => Risk.rollingBacktest(r, m, c, W)) };
})();
