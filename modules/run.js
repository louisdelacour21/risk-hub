'use strict';
/* Screens: VaR and ES, risk profile, stress tests (#/run/...). */
function head(kind, port, list) {
  const w = weightsFor(list), tot = w.reduce((x, y) => x + y, 0);
  return `<div class="runbar"><div class="chips">${list.map((a, i) => `<span class="pill">${esc(a.name)}${list.length > 1 ? ` · ${(w[i] / tot * 100).toFixed(0)}%` : ''}</span>`).join('')}<small>${port.r.length} daily returns${port.dates ? `, ${port.dates[0]} → ${port.dates[port.dates.length - 1]}` : ' (simulated)'}</small></div>
    <div class="tabs">${Object.entries(ANALYSES).map(([k, v]) => `<a href="#/run/${k}" class="${k === kind ? 'on' : ''}">${v.title}</a>`).join('')}<a href="#/">Change selection</a></div></div>`;
}

async function renderRun(kind) {
  const list = selected();
  if (!list.length) { location.hash = '#/'; return; }
  $('#app').innerHTML = `<div class="running"><span class="spin" aria-hidden="true"></span><p>Computing ${esc(ANALYSES[kind].title.toLowerCase())} for <b>${esc(list.map((a) => a.name).join(' + '))}</b>…</p></div>`;
  await tick();
  let port;
  try { await Promise.all(list.map(Data.ensure)); port = Data.portfolioReturns(list, weightsFor(list)); } catch (e) { $('#app').innerHTML = `<div class="card"><p class="fail">${esc(e.message)}</p><p><a href="#/">Back to the selection</a></p></div>`; return; }
  const body = { var: runVar, profile: runProfile, stress: runStress }[kind];
  $('#app').innerHTML = `<section class="hero compact"><p class="kicker">${list.length > 1 ? 'Portfolio' : 'Asset'}</p><h1>${ANALYSES[kind].title}</h1></section>${head(kind, port, list)}<div id="res"></div>`;
  await tick(); body(port, list, weightsFor(list));
}

/* --- VaR / ES --- */
function runVar(port) {
  const n = port.r.length, wins = [250, 500, 750].map((w) => [w, `${w} d`, n - w < 250]);
  if (n < 500) { $('#res').innerHTML = '<div class="card"><p class="fail">This series is too short for a backtest: at least 500 daily returns are needed (250 for the window, 250 to test).</p></div>'; return; }
  if (wins.find(([w]) => w === S.win)[2]) S.win = wins.filter(([, , d]) => !d).map(([w]) => w).pop();
  $('#res').innerHTML = `<section class="lab"><aside class="card controls">${seg('conf', 'Confidence level', [[0.95, '95%'], [0.975, '97.5%'], [0.99, '99%']], S.conf, 'conf')}${seg('win', 'Estimation window', wins, S.win, 'window')}
    <div class="field"><span class="lab-t">Method on the chart</span><div class="seg col" id="method">${Object.entries(LABEL).map(([k, l]) => `<button data-v="${k}" aria-pressed="${k === S.method}">${l}</button>`).join('')}</div><small class="mut">The explanations of each method are in the table's first column.</small></div></aside>
    <div class="out"><div class="tabs sub" id="vtabs">${[['bt', 'Backtest'], ['hz', 'Horizon (1 to 20 days)'], ['iv', 'Implied-vol VaR']].concat(port.parts ? [['cp', 'By holding']] : []).map(([k, t]) => `<a href="#" data-k="${k}">${t}</a>`).join('')}</div>
    <div data-t="bt"><div class="kpis" id="kpis"></div><div class="card chart-card"><div class="chart-head"><h2><span id="ctitle"></span>${tip('backtest')}</h2><div class="legend"><span><i class="dot var"></i>VaR</span><span><i class="dot hit"></i>Breach${tip('breach')}</span></div></div><canvas id="chart" role="img" aria-label="Daily returns, VaR and breaches"></canvas></div>
    <div class="card" id="verdict"></div><div class="card table-card"><table id="table"><caption class="sr">Backtest results by method</caption></table></div></div>
    <div data-t="hz" hidden><div class="card" id="hz"></div></div><div data-t="iv" hidden><div class="card" id="ivp"></div></div><div data-t="cp" hidden><div class="card" id="cp"></div></div></div></section>`;
  const draw = () => {
    const p = 1 - S.conf, rows = {};
    for (const m of Object.keys(LABEL)) {
      const bt = Risk.rollingBacktest(port.r, m, S.conf, S.win), N = bt.hit.length, x = bt.hit.reduce((a, b) => a + b, 0);
      rows[m] = { bt, N, x, now: Risk.METHODS[m](port.r.slice(-S.win), S.conf), ku: Risk.kupiec(N, x, p), ch: Risk.christoffersen(bt.hit, p), zone: Risk.baselZone(N, x, p), es: Risk.esBacktest(port.r, bt, p) };
    }
    const r = rows[S.method], N = r.N, exp = N * p;
    $('#kpis').innerHTML = kpi(`1-day VaR ${pct(S.conf, 1)}`, pct(r.now.var), `${LABEL[S.method]}, last ${S.win} days`, 'var') + kpi(`Expected Shortfall ${pct(S.conf, 1)}`, pct(r.now.es), `${(r.now.es / r.now.var).toFixed(2)}× the VaR`, 'es')
      + kpi('Breaches', `${r.x}`, `${pct(r.x / N)} observed vs ${pct(p)} expected`, 'breach') + kpi('Basel zone', `<span class="chip ${r.zone}" style="font-size:20px;padding:4px 14px">${r.zone}</span>`, `${N} backtest days`, 'basel');
    $('#ctitle').textContent = `${LABEL[S.method]} VaR ${pct(S.conf, 1)} · ${S.win}-day window · ${N} days`;
    varChart($('#chart'), r.bt, r.bt.t.map((t) => port.r[t]), port.dates ? [port.dates[r.bt.t[0]], port.dates[r.bt.t[N - 1]]] : null);
    const ok = Object.entries(rows).filter(([, v]) => v.ku.p >= 0.05 && v.ch.pCc >= 0.05).map(([m]) => LABEL[m]);
    const worst = Object.entries(rows).sort((a, b) => b[1].x - a[1].x)[0], best = Object.entries(rows).sort((a, b) => Math.abs(a[1].x / a[1].N - p) - Math.abs(b[1].x / b[1].N - p))[0];
    $('#verdict').innerHTML = `At ${pct(S.conf, 1)} confidence, <b>${LABEL[worst[0]]}</b> breached ${worst[1].x} times (${pct(worst[1].x / worst[1].N)} vs ${pct(p)} expected) and is the most optimistic model; <b>${LABEL[best[0]]}</b> is closest to target. `
      + (ok.length ? `Passing both Kupiec and conditional coverage at 5%: <b class="pass">${ok.join(', ')}</b>.` : '<b class="fail">No model passes both Kupiec and conditional coverage at 5%.</b>');
    $('#table').innerHTML = `<thead><tr><th>Method</th><th>VaR today${tip('var')}</th><th>ES today${tip('es')}</th><th>Breaches${tip('breach')}</th><th>Rate${tip('rate')}</th><th>Kupiec p${tip('kupiec')}</th><th>Indep. p${tip('indep')}</th><th>Cond. cov. p${tip('cc')}</th><th>ES ratio${tip('esratio')}</th><th>ES test p${tip('z2')}</th><th>Basel zone${tip('basel')}</th></tr></thead><tbody>`
      + Object.entries(rows).map(([m, v]) => `<tr class="${m === S.method ? 'sel' : ''}"><td>${LABEL[m]}${tip(m)}</td><td>${pct(v.now.var)}</td><td>${pct(v.now.es)}</td><td>${v.x} <span class="mut">/ ${exp.toFixed(0)} exp.</span></td><td>${pct(v.x / N)}</td>`
        + `<td class="${v.ku.p < 0.05 ? 'fail' : 'pass'}">${fmtP(v.ku.p)}</td><td class="${v.ch.pInd < 0.05 ? 'fail' : 'pass'}">${fmtP(v.ch.pInd)}</td><td class="${v.ch.pCc < 0.05 ? 'fail' : 'pass'}">${fmtP(v.ch.pCc)}</td><td>${v.es.ratio == null ? '–' : v.es.ratio.toFixed(2)}</td><td class="${v.es.p < 0.05 ? 'fail' : 'pass'}">${fmtP(v.es.p)}</td><td><span class="chip ${v.zone}">${v.zone}</span></td></tr>`).join('') + '</tbody>';
  };
  // ---- tab: multi-day horizon
  const drawHz = () => {
    const w = port.r.slice(-S.win), hs = [1, 2, 3, 5, 7, 10, 15, 20], res = hs.map((h) => Risk.horizonVar(w, S.conf, h)), okH = hs.filter((_, i) => res[i].hist);
    const row = (h, r) => `<tr class="${h === 10 ? 'sel' : ''}"><td>${h} day${h > 1 ? 's' : ''}${h === 10 ? ' <span class="mut">(Basel)</span>' : ''}</td><td>${pct(r.sqrt.var)}</td><td>${r.hist ? pct(r.hist.var) : '–'}</td><td>${pct(r.fhs.var)}</td><td>${pct(r.fhs.es)}</td><td>${(r.fhs.var / (res[0].fhs.var * Math.sqrt(h))).toFixed(2)}×</td></tr>`;
    const r10 = res[hs.indexOf(10)];
    $('#hz').innerHTML = `<div class="chart-head"><h2>VaR ${pct(S.conf, 1)} by horizon${tip('hz')}</h2><div class="legend"><span><i class="dot" style="background:var(--muted)"></i>√h rule</span><span><i class="dot var"></i>overlapping history</span><span><i class="dot hit"></i>GARCH simulation (FHS)</span></div></div>
      <canvas id="hzc" role="img" aria-label="VaR as a function of horizon"></canvas>
      <div class="table-card"><table class="plain"><thead><tr><th>Horizon</th><th>√h rule</th><th>Overlapping history</th><th>GARCH simulation VaR</th><th>GARCH simulation ES</th><th>Simulation vs its own 1-day × √h</th></tr></thead><tbody>${hs.map((h, i) => row(h, res[i])).join('')}</tbody></table></div>
      <p class="mut">At 10 days the simulation gives <b>${pct(r10.fhs.var)}</b>; scaling its own 1-day VaR by √10 would give <b>${pct(res[0].fhs.var * Math.sqrt(10))}</b> (${r10.fhs.var > res[0].fhs.var * Math.sqrt(10) * 1.02 ? 'the rule understates the risk: volatility is low now and volatility clustering lets bad days follow each other' : r10.fhs.var < res[0].fhs.var * Math.sqrt(10) * 0.98 ? 'the rule overstates the risk: volatility is high now and tends to fall back toward its long-run level' : 'both agree: volatility is close to its long-run level'}). The first column uses the plain historical 1-day VaR. The √h rule assumes independent days with constant volatility. The overlapping-history column compounds real consecutive returns of the window, so it has few independent samples (${r10.hist ? r10.hist.n : 0} overlapping windows, about ${Math.floor(S.win / 10)} independent ones at 10 days) and is noisy in the tail. The simulation fits GARCH(1,1) on the window and replays 20,000 paths by resampling its standardised residuals. Basel uses 10 days at 99%.</p>`;
    xyChart($('#hzc'), [{ x: hs, y: res.map((r) => r.sqrt.var), color: '--muted' }, { x: okH, y: res.filter((r) => r.hist).map((r) => r.hist.var), color: '--accent' }, { x: hs, y: res.map((r) => r.fhs.var), color: '--red', dots: true }], { xfmt: (v) => Math.round(v) + ' d', yfmt: (v) => pct(v, 1) });
  };

  // ---- tab: implied-volatility VaR (a snapshot-based measure; its backtest needs implied-vol history, see data/options/iv_*.csv)
  const IVMAP = { btc: 'btc', eth: 'eth' };
  const drawIv = async () => {
    const box = $('#ivp'), iv = S.iv ||= { cur: 'btc', h: 1 };
    S.opList ||= await fetch('data/manifest.json').then((r) => r.json()).then((m) => m.options).catch(() => null) || [{ id: 'btc', label: 'Bitcoin' }, { id: 'eth', label: 'Ether' }];
    const opts = S.opList.filter((o) => IVMAP[o.id] && byId(IVMAP[o.id]));
    if (!opts.length) { box.innerHTML = '<p class="mut">No underlying with both an option chain and a price series is available.</p>'; return; }
    if (!opts.some((o) => o.id === iv.cur)) iv.cur = opts[0].id;
    box.innerHTML = '<p class="mut">Loading…</p>';
    let asset = byId(IVMAP[iv.cur]), ret, rows;
    try {
      await Data.ensure(asset); ret = Data.returnsOf(asset);
      rows = (await Data.ivCsv(iv.cur)).trim().split('\n').slice(1).map((l) => l.split(',')).map(([d, v]) => [d, Number(v)]).filter(([, v]) => v > 0);
    } catch (e) { box.innerHTML = `<p class="fail">Could not load the implied-volatility history (${esc(e.message)}).</p>`; return; }
    if (!ret.dates || !rows.length) { box.innerHTML = '<p class="mut">No implied-volatility history for this underlying.</p>'; return; }
    const ppy = Risk.periodsPerYear(ret.dates), p = 1 - S.conf, last = rows[rows.length - 1], W = S.win, win = ret.r.slice(-W);
    // implied vol known at the close BEFORE each return date (no look-ahead); ignored when older than 5 days
    const ivArr = []; let j = -1;
    for (const d of ret.dates) { while (j + 1 < rows.length && rows[j + 1][0] < d) j++; ivArr.push(j >= 0 && (Date.parse(d) - Date.parse(rows[j][0])) / 864e5 <= 5 ? rows[j][1] : null); }
    const bt = Risk.ivBacktest(ret.r, ivArr, S.conf, ppy), N = bt.hit.length, x = bt.hit.reduce((a, b) => a + b, 0);
    const now = Risk.ivVar(last[1], iv.h, S.conf, ppy), real = Risk.std(ret.r.slice(-30)) * Math.sqrt(ppy);
    const hz = Risk.horizonVar(win, S.conf, iv.h), hist1 = Risk.METHODS.historical(win, S.conf), ga1 = Risk.METHODS.garch(win, S.conf);
    const cmp = (label, v) => `<tr><td>${label}</td><td>${pct(v.var)}</td><td>${pct(v.es)}</td><td>${(v.var / now.var).toFixed(2)}×</td></tr>`;
    let bk = '';
    if (N >= 30) {
      const ku = Risk.kupiec(N, x, p), ch = Risk.christoffersen(bt.hit, p), zone = Risk.baselZone(N, x, p), es = Risk.esBacktest(ret.r, bt, p), set = new Set(bt.t);
      const rival = ['historical', 'garch', 'fhs'].map((m) => { const b = Risk.rollingBacktest(ret.r, m, S.conf, W), idx = b.t.map((t, i) => (set.has(t) ? i : -1)).filter((i) => i >= 0); return [m, idx.length, idx.reduce((a, i) => a + b.hit[i], 0)]; });
      bk = `<div class="chart-head"><h2>Backtest of the implied-vol VaR${tip('ivvar')}</h2><div class="legend"><span><i class="dot var"></i>VaR</span><span><i class="dot hit"></i>Breach</span></div></div><canvas id="ivchart" role="img" aria-label="Returns and implied-volatility VaR"></canvas>
        <div class="table-card"><table class="plain"><thead><tr><th>Model</th><th>Days</th><th>Breaches</th><th>Rate (expected ${pct(p)})</th><th>Kupiec p</th><th>Cond. cov. p</th><th>ES ratio</th><th>Basel zone</th></tr></thead><tbody>
        <tr class="sel"><td>Implied vol (30-day ATM)</td><td>${N}</td><td>${x}</td><td>${pct(x / N)}</td><td class="${ku.p < 0.05 ? 'fail' : 'pass'}">${fmtP(ku.p)}</td><td class="${ch.pCc < 0.05 ? 'fail' : 'pass'}">${fmtP(ch.pCc)}</td><td>${es.ratio == null ? '–' : es.ratio.toFixed(2)}</td><td><span class="chip ${zone}">${zone}</span></td></tr>
        ${rival.map(([m, n, h]) => `<tr><td>${LABEL[m]} <span class="mut">(same days)</span></td><td>${n}</td><td>${h}</td><td>${n ? pct(h / n) : '–'}</td><td colspan="4"></td></tr>`).join('')}</tbody></table></div>
        <p class="mut">Implied volatility is a risk-neutral price of insurance: it usually sits above the volatility that is later realised, so this VaR tends to be conservative (few breaches) in calm markets and can be too low when a shock arrives.</p>`;
    } else bk = `<p class="mut">The backtest needs at least 30 days of history; this underlying has ${N} so far. The history grows by one row each time <code>tools/refresh_data.py</code> runs (the scheduled job does it daily).</p>`;
    box.innerHTML = `<div class="chart-head"><h2>VaR from implied volatility${tip('ivvar')}</h2></div>
      <div class="pricer">${seg('ivcur', 'Underlying', opts.map((o) => [o.id, o.label]), iv.cur)}${seg('ivh', 'Horizon', [[1, '1 day'], [5, '5 days'], [10, '10 days']], iv.h)}</div>
      <div class="kpis"><div class="kpi"><span>30-day implied vol${tip('ivvar')}</span><b>${pct(last[1], 1)}</b><small>as of ${last[0]}</small></div><div class="kpi"><span>Realised vol, last 30 days</span><b>${pct(real, 1)}</b><small>${last[1] > real ? 'options price more than has happened' : 'options price less than has happened'}</small></div>
        <div class="kpi"><span>Implied-vol VaR ${pct(S.conf, 1)}, ${iv.h} d</span><b>${pct(now.var)}</b><small>ES ${pct(now.es)}</small></div></div>
      <div class="table-card"><table class="plain"><thead><tr><th>${iv.h}-day estimate (${pct(S.conf, 1)})</th><th>VaR</th><th>ES</th><th>VaR vs implied</th></tr></thead><tbody>${cmp('Implied vol: σ·z·√h', now)}${iv.h === 1 ? cmp('Historical', hist1) + cmp('GARCH(1,1)', ga1) : cmp('Historical (√h)', hz.sqrt) + cmp('GARCH simulation', hz.fhs)}</tbody></table></div>
      <p class="mut">Zero mean, normal quantile, σ·√(h/${ppy}). It looks forward (the market's view today) where the other methods look back, but it assumes a normal shape and ignores the skew visible in the smile.</p>${bk}`;
    if (N >= 30) varChart($('#ivchart'), bt, bt.t.map((t) => ret.r[t]), [ret.dates[bt.t[0]], ret.dates[bt.t[N - 1]]]);
    for (const [id, k] of [['ivcur', 'cur'], ['ivh', 'h']]) $('#' + id).addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; iv[k] = k === 'h' ? Number(b.dataset.v) : b.dataset.v; drawIv(); });
  };
  // ---- tab: VaR and ES split by holding (Euler contributions)
  const drawCp = () => {
    const box = $('#cp'); if (!port.parts) { box.innerHTML = '<p class="mut">Select at least two assets to split the risk by holding.</p>'; return; }
    const cr = Risk.componentRisk(port.parts, S.conf, S.win), mx = Math.max(...cr.items.map((x) => Math.max(x.hist, x.norm, x.alone)), 1e-9), bar = (v, c) => `<span class="cbar" style="width:${Math.max(0, v / mx * 100).toFixed(1)}%;background:var(${c})"></span>`;
    const sumAlone = cr.items.reduce((a, x) => a + x.alone, 0);
    box.innerHTML = `<div class="chart-head"><h2>Where the ${pct(S.conf, 1)} risk comes from${tip('compvar')}</h2></div>
      <div class="kpis"><div class="kpi"><span>Portfolio VaR (historical)</span><b>${pct(cr.hist)}</b><small>ES ${pct(cr.es)}</small></div><div class="kpi"><span>Sum of stand-alone VaRs</span><b>${pct(sumAlone)}</b><small>diversification saves ${pct(sumAlone - cr.hist)}</small></div><div class="kpi"><span>Normal VaR</span><b>${pct(cr.norm)}</b><small>covariance approach</small></div></div>
      <div class="table-card"><table class="plain"><thead><tr><th>Holding</th><th>Weight</th><th>Stand-alone VaR</th><th>Contribution (historical)</th><th>Share</th><th>Contribution to ES</th><th>Contribution (normal)</th></tr></thead><tbody>${cr.items.map((x, i) => `<tr><td>${esc(port.parts[i].name)}</td><td>${pct(x.w, 1)}</td><td>${pct(x.alone)}</td><td>${pct(x.hist)}<div class="cb">${bar(x.hist, '--accent')}</div></td><td>${cr.hist > 0 ? pct(x.hist / cr.hist, 0) : '–'}</td><td>${pct(x.histEs)}</td><td>${pct(x.norm)}</td></tr>`).join('')}</tbody><tfoot><tr><td>Total</td><td>100%</td><td>${pct(sumAlone)}</td><td>${pct(cr.hist)}</td><td>100%</td><td>${pct(cr.es)}</td><td>${pct(cr.norm)}</td></tr></tfoot></table></div>
      <p class="mut">Contribution = the part of the portfolio VaR attributable to the holding (Euler allocation: weight × marginal VaR); the parts add up to the total. A holding can weigh 20% and carry 50% of the risk, or even have a negative contribution if it hedges the rest. The historical split averages the days around the VaR quantile (${cr.n} days), so it is noisy; the ES split uses every tail day; the normal split uses the covariance matrix. Stand-alone VaR is the holding alone, without diversification.</p>`;
  };
  const showTab = () => {
    S.vTab ||= 'bt'; if (S.vTab === 'cp' && !port.parts) S.vTab = 'bt';
    document.querySelectorAll('#res [data-t]').forEach((el) => { el.hidden = el.dataset.t !== S.vTab; });
    $('#vtabs').querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.dataset.k === S.vTab));
    if (S.vTab === 'hz') drawHz(); else if (S.vTab === 'iv') drawIv(); else if (S.vTab === 'cp') drawCp();
  };
  $('#vtabs').addEventListener('click', (e) => { const a = e.target.closest('a'); if (!a) return; e.preventDefault(); S.vTab = a.dataset.k; showTab(); });
  for (const [id, key] of [['conf', 'conf'], ['win', 'win'], ['method', 'method']]) {
    $('#' + id).addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || b.disabled) return; S[key] = key === 'method' ? b.dataset.v : Number(b.dataset.v); pref.set(key, S[key]);
      $('#' + id).querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b)); draw(); if (S.vTab !== 'bt') showTab();
    });
  }
  draw(); showTab();
}

/* --- risk profile --- */
function runProfile(port) {
  const ppy = Risk.periodsPerYear(port.dates), pf = Risk.profile(port.r, ppy), d = port.dates, dd = pf.dd, hist = Risk.histogram(port.r), rv = Risk.rollingVol(port.r, 60, ppy), dailyStd = Risk.std(port.r);
  const dateAt = (i) => (d ? ` (${d[i]})` : '');
  $('#res').innerHTML = `<div class="kpis">${kpi('Annualised volatility', pct(pf.annVol, 1), `daily std × √${ppy} observations per year`, 'annvol') + kpi('Annualised return', pct(pf.annRet, 1), `mean daily return × ${ppy}`, 'annret') + kpi('Max drawdown', pct(dd.max, 1), d ? `${d[dd.peak]} → ${d[dd.trough]}` : 'peak to trough', 'maxdd')
      + kpi('Excess kurtosis', pf.exkurt.toFixed(1), '0 for a normal distribution', 'kurt') + kpi('Skewness', pf.skew.toFixed(2), 'negative = fatter left tail', 'skew') + kpi('Worst / best day', `${pct(pf.worst, 1)} / ${pct(pf.best, 1)}`, 'single-day extremes')}</div>
    <div class="card" id="pv"></div>
    <div class="grid2"><div class="card chart-card"><div class="chart-head"><h2>Return distribution vs normal${tip('hist')}</h2><div class="legend"><span><i class="dot var"></i>observed</span><span><i class="dot hit"></i>normal</span></div></div><canvas id="c1"></canvas></div>
    <div class="card chart-card"><div class="chart-head"><h2>Drawdown${tip('maxdd')}</h2></div><canvas id="c2"></canvas></div></div>
    <div class="card chart-card"><div class="chart-head"><h2>Rolling 60-day volatility (annualised)${tip('rollvol')}</h2></div><canvas id="c3"></canvas></div>`;
  $('#pv').innerHTML = `${pf.jb.p < 0.01 ? '<b class="fail">Returns are not normal</b>' : '<b class="pass">Normality is not rejected</b>'}: Jarque-Bera${tip('jb')} p-value ${fmtP(pf.jb.p)}, excess kurtosis ${pf.exkurt.toFixed(1)}. `
    + `${pct(pf.beyond2, 1)} of days move more than 2 standard deviations from the mean (4.6% under a normal law). The worst day was ${pct(pf.worst, 1)}${dateAt(port.r.indexOf(pf.worst))}, a ${(Math.abs(pf.worst - Risk.mean(port.r)) / dailyStd).toFixed(1)}-sigma move. `
    + (pf.exkurt > 1 ? 'That is why the normal VaR tends to understate risk on this series.' : 'A normal VaR should be reasonable here.');
  histChart($('#c1'), hist);
  lineChart($('#c2'), dd.series.map((v) => v * 100), { color: '--red', fill: true, yfmt: (v) => v.toFixed(0) + '%', dates: d ? [d[0], d[d.length - 1]] : null, hi: 0 });
  lineChart($('#c3'), rv.map((v) => (v == null ? null : v * 100)), { yfmt: (v) => v.toFixed(0) + '%', dates: d ? [d[0], d[d.length - 1]] : null, h: 200 });
}

/* --- stress test --- */
const SCENARIOS = [  // closes: from → to. Replayed on the real series, so every number comes from the data. Crypto-era episodes: the bundled history starts in 2019.
  ['Covid crash', '2020-02-19', '2020-03-23', 'peak to trough; crypto fell 50% in two days'], ['China mining ban', '2021-05-12', '2021-05-19', 'leverage unwind, Bitcoin below 30k'],
  ['2022 rate shock', '2022-01-03', '2022-10-12', 'Fed tightening, risk assets fall together'], ['Terra / Luna collapse', '2022-05-05', '2022-05-12', 'algorithmic stablecoin de-peg'],
  ['Celsius and Three Arrows', '2022-06-10', '2022-06-18', 'lender and fund insolvencies'], ['FTX collapse', '2022-11-07', '2022-11-10', 'exchange failure'],
  ['US regional banks (SVB)', '2023-03-08', '2023-03-13', 'Silicon Valley Bank failure, USDC briefly de-pegs'], ['Yen carry unwind', '2024-08-02', '2024-08-05', 'global deleveraging'],
  ['April 2025 tariff shock', '2025-04-02', '2025-04-08', 'US tariff announcements'], ['October 2025 liquidation cascade', '2025-10-09', '2025-10-11', 'record forced liquidations on perpetuals'],
];
function runStress(port, list, weights) {
  const money = (x) => `${x < 0 ? '−' : ''}${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.abs(x))} ${esc(S.ccy)}`;
  const tot = weights.reduce((a, b) => a + b, 0), W8 = weights.map((x) => x / tot), shocks = S.shocks ||= pref.get('shocks', {});
  $('#res').innerHTML = `<section class="lab"><aside class="card controls"><div class="field"><label class="lab-t" for="val">Portfolio value${tip('value')}</label><input id="val" type="number" min="1" step="10000" value="${S.value}"></div><div class="field"><label class="lab-t" for="ccy">Currency label</label><input id="ccy" type="text" maxlength="4" value="${esc(S.ccy)}"></div>
    <small class="mut">Three kinds of stress, from the most specific to the most general: named historical episodes replayed on your assets, your own shock per asset, and the worst windows found in the data. A stress test is a what-if, not a forecast.</small></aside><div class="out" id="sres"></div></section>`;
  const draw = () => {
    const V = S.value, d = port.dates, ww = [1, 5, 20].map((k) => ({ k, ...Risk.worstWindows(port.r, k) }));
    const W = Math.min(750, port.r.length), h99 = Risk.historical(port.r.slice(-W), 0.99), n99 = Risk.normal(port.r.slice(-W), 0.99);
    const path = []; let g = 1; for (let i = ww[2].start; i <= ww[2].end; i++) { g *= 1 + port.r[i]; path.push((g - 1) * 100); }
    const when = (w) => (d ? (w.k === 1 ? ` · ${d[w.end]}` : ` · ${d[w.start]} → ${d[w.end]}`) : '');
    const sc = SCENARIOS.map(([name, from, to, note]) => ({ name, from, to, note, res: Risk.scenarioReturn(list, W8, from, to) }));
    const hurt = (r) => { const p = r.parts.slice().sort((a, b) => a.contrib - b.contrib)[0]; return list.length > 1 ? `${esc(p.name)} (${pct(p.contrib, 1)})` : '–'; };
    const sr = sc.map((x) => `<tr class="${x.res ? '' : 'mut'}"><td>${esc(x.name)}<br><small class="mut">${esc(x.note)}</small></td><td>${x.from} → ${x.to}</td>${x.res ? `<td>${pct(x.res.ret, 1)}</td><td>${money(V * x.res.ret)}</td><td>${hurt(x.res)}</td>` : '<td colspan="3">not covered by the data of every selected asset</td>'}</tr>`).join('');
    const cs = list.map((a, i) => { const s = Number(shocks[a.id] ?? -10) / 100; return { a, w: W8[i], s, c: W8[i] * s }; }), ct = cs.reduce((x, y) => x + y.c, 0);
    const tb = S.stTab ||= 'hist';
    $('#sres').innerHTML = `<div class="tabs sub" id="sttabs">${[['hist', 'Historical episodes'], ['own', 'Your own shock'], ['worst', 'Worst days & VaR']].map(([k, t]) => `<a href="#" data-k="${k}" class="${k === tb ? 'on' : ''}">${t}</a>`).join('')}</div>
      <div data-t="hist" ${tb === 'hist' ? '' : 'hidden'}><div class="card table-card"><table class="plain"><caption class="cap">Historical scenarios replayed on your portfolio${tip('histscen')}</caption><thead><tr><th>Episode</th><th>Period (closes)</th><th>Portfolio</th><th>Loss on ${money(V)}</th><th>Hurt most</th></tr></thead><tbody>${sr}</tbody></table></div></div>
      <div data-t="own" ${tb === 'own' ? '' : 'hidden'}><div class="card table-card"><table class="plain"><caption class="cap">Your own shock${tip('shock')}</caption><thead><tr><th>Asset</th><th>Weight</th><th>Shock (%)</th><th>Impact</th></tr></thead><tbody>${cs.map((x) => `<tr><td>${esc(x.a.name)}</td><td>${pct(x.w, 1)}</td><td><input type="number" step="1" style="width:84px" data-sh="${esc(x.a.id)}" value="${(x.s * 100).toFixed(0)}"></td><td>${money(V * x.c)}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="2">Portfolio</th><th>${pct(ct, 2)}</th><th>${money(V * ct)}</th></tr></tfoot></table>
        <p class="hint">Set one shock per asset, for example −10 on equities and +5 on bonds. ${list.length > 1 ? '<button class="link" id="shall">Same shock on all</button> <input id="shv" type="number" step="1" style="width:70px" value="-10"> %' : ''} The portfolio shock is Σ weight × shock, with the weights above held fixed.</p></div></div>
      <div data-t="worst" ${tb === 'worst' ? '' : 'hidden'}><h2 class="sec-h">Worst windows in the data</h2><div class="kpis">${ww.map((w) => kpi(`Worst ${w.k} day${w.k > 1 ? 's' : ''}`, money(V * w.ret), pct(w.ret, 1) + when(w), 'worstwin')).join('')}</div>
      <div class="card chart-card"><div class="chart-head"><h2>Replay of the worst 20-day window${tip('worstwin')}</h2></div><canvas id="c4"></canvas></div>
      <div class="card table-card"><table class="plain"><caption class="cap">1-day 99% on the last ${W} days${tip('stresscmp')}</caption><thead><tr><th>Measure</th><th>Historical</th><th>Normal</th></tr></thead><tbody><tr><td>VaR</td><td>${money(-V * h99.var)}</td><td>${money(-V * n99.var)}</td></tr><tr><td>Expected Shortfall</td><td>${money(-V * h99.es)}</td><td>${money(-V * n99.es)}</td></tr></tbody></table></div>
      <div class="card">${ww[0].ret < -n99.es ? `The worst single day (${pct(ww[0].ret, 1)}) was worse than the normal-model Expected Shortfall at 99% (${pct(-n99.es, 1)}): the normal model would not have prepared you for it.` : `The worst single day (${pct(ww[0].ret, 1)}) stayed within the normal-model Expected Shortfall at 99% (${pct(-n99.es, 1)}).`}</div></div>`;
    $('#sttabs').addEventListener('click', (e) => { const a = e.target.closest('a'); if (!a) return; e.preventDefault(); S.stTab = a.dataset.k; draw(); });
    if (tb === 'worst') lineChart($('#c4'), path, { color: '--red', yfmt: (v) => v.toFixed(0) + '%', h: 200, dates: d ? [d[ww[2].start], d[ww[2].end]] : null });
    document.querySelectorAll('[data-sh]').forEach((i) => i.addEventListener('change', () => { shocks[i.dataset.sh] = Number(i.value) || 0; pref.set('shocks', shocks); draw(); }));
    $('#shall')?.addEventListener('click', () => { const v = Number($('#shv').value) || 0; list.forEach((a) => (shocks[a.id] = v)); pref.set('shocks', shocks); draw(); });
  };
  $('#val').addEventListener('change', (e) => { S.value = Math.max(1, Number(e.target.value) || 1000000); pref.set('value', S.value); draw(); });
  $('#ccy').addEventListener('change', (e) => { S.ccy = e.target.value.trim() || 'EUR'; pref.set('ccy', S.ccy); draw(); });
  draw();
}

/* ------------------------------------------------------------------ screen 4: yield curves and discounting */
