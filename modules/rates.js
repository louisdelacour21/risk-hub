'use strict';
/* Screen: yield curves. */
function curveChart(cv, tenors, series) {
  const c = setup(cv, 240), all = series.flatMap((s) => s.y), a = Math.min(...all), b = Math.max(...all), pad = (b - a) * 0.15 || 0.2;
  const { X, Y } = frame(c, a - pad, b + pad, (v) => v.toFixed(1) + '%', null, tenors.length), { g, col } = c;
  g.fillStyle = col('--muted'); g.font = '11px system-ui'; g.textAlign = 'center'; tenors.forEach((t, i) => g.fillText(t, X(i), 236)); g.textAlign = 'left';
  series.forEach((s) => { g.strokeStyle = col(s.color); g.lineWidth = s.w; g.setLineDash(Array.isArray(s.dash) ? s.dash : s.dash ? [5, 4] : []); g.beginPath(); s.y.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)))); g.stroke(); g.setLineDash([]);
    g.fillStyle = col(s.color); s.y.forEach((v, i) => { g.beginPath(); g.arc(X(i), Y(v), 3, 0, 7); g.fill(); }); });
}
async function renderRates() {
  const st = S.rt ||= { curve: 'eur', date: null, cmp: 'none', flows: '1, 3\n2, 3\n3, 3\n4, 3\n5, 103' };
  $('#app').innerHTML = '<div class="running"><span class="spin"></span><p>Loading the curve…</p></div>';
  let R;
  try { S.rates ||= {}; R = S.rates[st.curve] ||= await Data.loadRates(st.curve); } catch { $('#app').innerHTML = '<div class="card"><p class="fail">The curve file is missing (data/rates). Run tools/refresh_data.py.</p></div>'; return; }
  const last = R.dates.length - 1, nearest = (d) => { const i = R.dates.findIndex((x) => x >= d); return i < 0 ? last : i; };
  if (!st.date || st.date < R.dates[0] || st.date > R.dates[last]) st.date = R.dates[last];
  const par = R.kind === 'par';
  $('#app').innerHTML = `<section class="hero compact"><p class="kicker">Rates and discounting</p><h1>${st.curve === 'eur' ? 'Euro' : 'US dollar'} yield curve</h1>
    <p class="lead">${par ? 'US Treasury par yields (the series behind the Fed H.15 release), bootstrapped into continuously compounded zero rates.' : 'ECB zero-coupon curve fitted on AAA euro-area government bonds (Svensson), continuously compounded.'} Discount factor = exp(−r × t). Daily since ${R.dates[0]}.</p></section>
    <section class="lab"><aside class="card controls">${seg('rcurve', 'Curve', [['eur', 'EUR · ECB'], ['usd', 'USD · Treasury']], st.curve, par ? 'par' : 'svensson')}
      <div class="field"><label class="lab-t" for="rdate">Curve date${tip('curvedate')}</label><input id="rdate" type="date" min="${R.dates[0]}" max="${R.dates[last]}" value="${st.date}"></div>
      <div class="field"><label class="lab-t" for="rcmp">Compare with</label><select id="rcmp"><option value="none">nothing</option><option value="1">1 year earlier</option><option value="5">5 years earlier</option><option value="10">10 years earlier</option></select></div>
      <div class="field"><label class="lab-t" for="flows">Cash flows (years, amount)</label><textarea id="flows" rows="7" spellcheck="false">${esc(st.flows)}</textarea><small class="mut">One flow per line, e.g. <code>2.5, 100</code>. Default: 5-year bond, 3% coupon.</small></div>
      <small class="mut">Key rates (${R.policy.date}): ${R.polNames[0]} ${R.policy.a}%, ${R.polNames[1]} ${R.policy.b}%.${tip('policy')}</small></aside>
    <div class="out"><div class="card chart-card"><div class="chart-head"><h2><span id="rtitle"></span>${tip('zero')}</h2><div class="legend"><span><i class="dot var"></i>selected date</span><span><i class="dot hit"></i>comparison</span></div></div><canvas id="rc"></canvas></div>
    <div class="kpis" id="rk"></div><div class="card table-card"><table class="plain" id="rt"></table></div></div></section>`;
  $('#rcmp').value = st.cmp;
  const draw = () => {
    const i = nearest(st.date), y = R.zero(i), cmpYears = st.cmp === 'none' ? null : Number(st.cmp), j = cmpYears ? nearest(new Date(Date.parse(R.dates[i]) - cmpYears * 365.25 * 864e5).toISOString().slice(0, 10)) : null;
    $('#rtitle').textContent = `Zero rates on ${R.dates[i]}`;
    curveChart($('#rc'), R.tenors, [...(j != null ? [{ y: R.zero(j), color: '--red', w: 1.4, dash: [5, 4] }] : []), { y, color: '--accent', w: 2 }]);
    const flows = st.flows.split(/\n/).map((l) => l.split(/[,;\s]+/).map(Number)).filter((a) => a.length >= 2 && a[0] > 0 && Number.isFinite(a[1])).map(([t, amount]) => ({ t, amount }));
    const r = y.map((v) => v / 100);
    if (!flows.length) { $('#rk').innerHTML = ''; $('#rt').innerHTML = '<tbody><tr><td>Enter at least one cash flow (years, amount).</td></tr></tbody>'; return; }
    const base = Risk.presentValue(flows, R.years, r), up = Risk.presentValue(flows, R.years, r, 0.01).pv, dn = Risk.presentValue(flows, R.years, r, -0.01).pv, total = flows.reduce((x, f) => x + f.amount, 0);
    $('#rk').innerHTML = kpi('Present value', base.pv.toFixed(2), `of ${total.toFixed(2)} nominal`, 'pv') + kpi('Effective duration', Risk.duration(flows, R.years, r).toFixed(2) + ' y', 'per 1 point of rate', 'duration')
      + kpi('+100 bp', up.toFixed(2), `${((up / base.pv - 1) * 100).toFixed(2)}%`, 'bump') + kpi('−100 bp', dn.toFixed(2), `${((dn / base.pv - 1) * 100).toFixed(2)}%`, 'bump');
    $('#rt').innerHTML = `<thead><tr><th>Year</th><th>Cash flow</th><th>Zero rate${tip('zero')}</th><th>Discount factor${tip('df')}</th><th>Present value${tip('pv')}</th></tr></thead><tbody>${base.rows.map((x) => `<tr><td>${x.t}</td><td>${x.amount.toFixed(2)}</td><td>${(x.r * 100).toFixed(3)}%</td><td>${x.df.toFixed(5)}</td><td>${x.pv.toFixed(2)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4">Total</td><td>${base.pv.toFixed(2)}</td></tr></tfoot>`;
  };
  $('#rcurve').addEventListener('click', (e) => { const bt = e.target.closest('button'); if (!bt || bt.dataset.v === st.curve) return; st.curve = bt.dataset.v; st.date = null; renderRates(); });
  $('#rdate').addEventListener('change', (e) => { st.date = R.dates[nearest(e.target.value || R.dates[last])]; draw(); });
  $('#rcmp').addEventListener('change', (e) => { st.cmp = e.target.value; draw(); });
  $('#flows').addEventListener('input', (e) => { st.flows = e.target.value; draw(); });
  draw();
}

/* ------------------------------------------------------------------ screen 5: options (Deribit implied volatilities, Black-Scholes calculator) */
