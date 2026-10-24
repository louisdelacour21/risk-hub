'use strict';
/* Concrete simulation: project an asset or "My portfolio" forward from its own history, with four ways of drawing the future. */
const FAN_METHODS = [['boot', 'Bootstrap (resample days)'], ['block', 'Block bootstrap (20-day blocks)'], ['norm', 'Normal (GBM)'], ['t', 'Student-t (fat tails)']];
function fanPaths(r, method, days, n, seed) {
  const R = Risk.rng(seed), m = Risk.mean(r), s = Risk.std(r), L = r.length, out = [];
  const ex = Risk.moments(r).exkurt, df = ex > 0.2 ? Math.min(30, Math.max(3.2, 4 + 6 / ex)) : 30;   // t with excess kurtosis 6/(df-4)
  const tdraw = () => { let chi = 0; for (let k = 0; k < Math.round(df); k++) { const z = R.n(); chi += z * z; } return R.n() / Math.sqrt(chi / Math.round(df)) * Math.sqrt((Math.round(df) - 2) / Math.round(df)); };
  for (let p = 0; p < n; p++) {
    const path = [1]; let w = 1;
    if (method === 'block') { while (path.length <= days) { const st = Math.floor(R.u() * (L - 20)); for (let k = 0; k < 20 && path.length <= days; k++) { w *= 1 + r[st + k]; path.push(w); } } }
    else for (let d = 0; d < days; d++) { const x = method === 'boot' ? r[Math.floor(R.u() * L)] : method === 'norm' ? m + s * R.n() : m + s * tdraw(); w *= 1 + x; path.push(w); }
    out.push(path);
  }
  return out;
}
const fanStats = (P, goal) => {
  const days = P[0].length - 1, fin = P.map((p) => p[days]), q = (a) => Risk.quantile(fin, a), cut = q(0.05), tail = fin.filter((x) => x <= cut);
  const mdd = P.map((p) => { let pk = 1, m = 0; for (const x of p) { pk = Math.max(pk, x); m = Math.min(m, x / pk - 1); } return m; });
  return { med: q(0.5), p5: cut, p95: q(0.95), loss: fin.filter((x) => x < 1).length / fin.length, hit: fin.filter((x) => x >= goal).length / fin.length, es: Risk.mean(tail), mddMed: Risk.quantile(mdd, 0.5), mdd95: Risk.quantile(mdd, 0.05), fin };
};

Lab.reg('fan', {
  kicker: 'Simulation', title: 'Where could my portfolio be?',
  lead: 'The simulation made concrete: take the history of an asset, or of the portfolio you built in Market Data, and draw thousands of possible futures from it. Read the chance of losing money, of reaching a goal, and the worst 5% of outcomes in euros.',
  asset: true,
  controls: [{ id: 'm', label: 'How the future is drawn', sel: FAN_METHODS, val: 'boot' }, { id: 'y', label: 'Horizon (years)', min: 0.25, max: 10, step: 0.25, val: 3, fmt: String }, { id: 'g', label: 'Goal: total return over the horizon', min: 0, max: 1.5, step: 0.05, val: 0.2, fmt: (x) => pct(x, 0) }, { id: 'go', label: 'Draw new futures', run: true }],
  note: '<b>Bootstrap</b> redraws real past days at random: no assumption on the shape of returns, but it assumes days are independent. <b>Block bootstrap</b> redraws 20-day blocks, which keeps part of the volatility clustering and the crash sequences. <b>Normal</b> keeps only the mean and the volatility. <b>Student-t</b> adds the fat tails measured on the sample. The mean return is the historical one, which is itself very uncertain: the wide band is the honest message, not the median line. The money amounts use the portfolio value set in the Market Data screen. This projects the past, it does not predict.',
  draw(v, out, ctx) {
    const r = ctx.r, days = Math.round(v.y * PPY), n = 2000, seed = 71 + (v._run || 0), val = S.value || 1e6, goal = 1 + v.g;
    const P = fanPaths(r, v.m, days, n, seed), st = fanStats(P, goal), tx = Array.from({ length: days + 1 }, (_, i) => i / PPY);
    const bands = [0.05, 0.25, 0.5, 0.75, 0.95].map((p) => Array.from({ length: days + 1 }, (_, t) => Risk.quantile(P.map((x) => x[t]), p)));
    const eur = (x) => Math.round(x * val).toLocaleString('en') + ' ' + (S.ccy || '');
    const rows = FAN_METHODS.map(([k, t]) => { const s = k === v.m ? st : fanStats(fanPaths(r, k, days, n, seed), goal); return [t + (k === v.m ? ' ◀' : ''), s.med.toFixed(2) + '×', s.p5.toFixed(2) + '×', pct(s.loss, 0), pct(s.hit, 0), pct(s.es - 1, 0), pct(s.mdd95, 0)]; });
    const h = histo(st.fin.map((x) => x - 1), 40);
    out.innerHTML = `<div class="kpis">${kpi('Median outcome', eur(st.med), `${st.med.toFixed(2)}× after ${v.y} years`)}${kpi('Worst 5%', eur(st.p5), 'a bad but plausible case')}${kpi('Chance of a loss', pct(st.loss, 0), 'ending below the start')}${kpi('Chance of reaching the goal', pct(st.hit, 0), `at least ${pct(v.g, 0)} total`)}${kpi('Average of the worst 5%', eur(st.es), 'expected shortfall at the horizon')}${kpi('Typical worst drawdown', pct(st.mddMed, 0), `1 path in 20 falls beyond ${pct(st.mdd95, 0)}`)}</div>
      ${Lab.card('c1', `Fan of ${n} simulated futures from ${esc(ctx.asset.name)}`, [['m', 'a few paths'], ['b', '5% / 95%'], ['a', 'median']])}
      <div class="duo">${Lab.card('c2', 'Distribution of the final return', null)}<div>${Lab.table(['Method', 'Median', 'Worst 5%', 'P(loss)', 'P(goal)', 'ES 5%', 'DD 1-in-20'], rows)}</div></div>`;
    Lab.plot($('#c1'), { series: [...P.slice(0, 30).map((p) => ({ x: tx, y: p, c: 'm', w: 0.7, alpha: 0.3 })), { x: tx, y: bands[0], c: 'b', w: 1.5 }, { x: tx, y: bands[4], c: 'b', w: 1.5 }, { x: tx, y: bands[1], c: 'b', w: 1, dash: [4, 4] }, { x: tx, y: bands[3], c: 'b', w: 1, dash: [4, 4] }, { x: tx, y: bands[2], c: 'a', w: 2.4 }], hlines: [{ y: 1, c: 'm' }, { y: goal, c: 'y', t: 'goal' }], xfmt: (z) => z.toFixed(1) + 'y', yfmt: (z) => z.toFixed(1) + '×', h: 300 });
    Lab.plot($('#c2'), { series: [{ x: h.x, y: h.y, bar: true, c: 'a', alpha: 0.6 }], vlines: [{ x: 0, c: 'm' }, { x: v.g, c: 'y', t: 'goal' }], xfmt: (z) => pct(z, 0), yfmt: (z) => String(z), h: 230 });
  },
});
