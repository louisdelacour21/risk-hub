'use strict';
/* Plain-English explanations shown next to every technical term (the small "i" buttons). Keep each entry short: what it is, how it is computed, how to read it. */
const GLOSS = {};   // the explanations live in glossary.json, loaded below
const glossReady = fetch('glossary.json').then((r) => r.json()).then((g) => Object.assign(GLOSS, g)).catch(() => {});   // app.js waits for it before the first screen

/** HTML for a small "i" button that explains a term; the text lives in GLOSS. */
const tip = (key) => (GLOSS[key] ? `<button type="button" class="info" data-g="${key}" aria-label="What is: ${GLOSS[key][0]}?">i</button>` : '');

(function popover() {
  if (typeof document === 'undefined') return;
  let pop = null, current = null;
  const hide = () => { pop?.remove(); pop = null; current = null; };
  function show(btn) {
    if (current === btn) return;
    hide(); current = btn;
    const [title, text] = GLOSS[btn.dataset.g];
    pop = document.createElement('div'); pop.className = 'pop'; pop.setAttribute('role', 'tooltip');
    pop.innerHTML = `<b></b><span></span>`; pop.firstChild.textContent = title; pop.lastChild.textContent = text;
    document.body.appendChild(pop);
    const r = btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
    pop.style.top = (r.bottom + 8 + h > innerHeight && r.top - h - 8 > 8 ? r.top - h - 8 : r.bottom + 8) + 'px';
  }
  document.addEventListener('mouseover', (e) => { const b = e.target.closest?.('.info'); if (b) show(b); });
  document.addEventListener('mouseout', (e) => { if (e.target.closest?.('.info') && !e.relatedTarget?.closest?.('.info')) hide(); });
  document.addEventListener('focusin', (e) => { const b = e.target.closest?.('.info'); if (b) show(b); });
  document.addEventListener('focusout', hide);
  document.addEventListener('click', (e) => { const b = e.target.closest?.('.info'); if (b) { e.preventDefault(); show(b); } else hide(); });   // a tap on touch screens shows the text; tapping anywhere else hides it
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  addEventListener('scroll', hide, { passive: true });
  addEventListener('hashchange', hide);
})();

/* Automatic "i" buttons: any table header, KPI label or panel title whose text matches a rule below gets the button, so a new label never ships unexplained. */
const AUTO = [
  [/^cva$|^dva$/, 'cva'], [/^fva$/, 'fva'], [/reverse convertible|^fair coupon$|coupon given up/, 'rcnote'], [/twin-win/, 'twinwin'], [/airbag/, 'airbag'], [/shark fin/, 'sharkfin'], [/bonus cert|^bonus$/, 'bonuscert'], [/discount cert/, 'discountcert'], [/phoenix|athena/, 'phoenix'], [/^memory/, 'memcoupon'], [/step-down/, 'stepdown'], [/^hidden margin$/, 'hiddenmargin'], [/one-touch|no-touch|^p\(touch\)|^p\(no touch\)/, 'touchopt'], [/accumulator|knocked out/, 'accumulator'], [/^participation$|fair annual coupon/, 'solved'],
  [/^stand-alone var$/, 'var'], [/^var diversification|es of the pool/, 'subadd'], [/^delta-normal var/, 'dnvar'], [/^delta-gamma var/, 'dgvar'], [/^full revaluation var/, 'fullvar'],
  [/^duration gap/, 'durgap'], [/^repricing gap/, 'repgap'], [/^netting factor/, 'netfactor'], [/^epe/, 'epe'], [/^bic$/, 'bic'], [/^ilm$|^sma capital/, 'ilm'],
  [/^worst 5%|^median outcome|^average of the worst 5%/, 'fanmed'],
  [/^1-day var|^var\b|^stand-alone var|var today/, 'var'], [/expected shortfall|^es\b|^es today|contribution to es/, 'es'], [/^es ratio/, 'esratio'], [/es test/, 'z2'],
  [/kupiec/, 'kupiec'], [/indep/, 'indep'], [/cond\. cov/, 'cc'], [/^breaches/, 'breach'], [/basel zone/, 'basel'], [/^rate \(expected/, 'rate'],
  [/annualised vol/, 'annvol'], [/annualised return/, 'annret'], [/max drawdown/, 'maxdd'], [/kurtosis/, 'kurt'], [/skewness/, 'skew'],
  [/^√h rule|× √h|\bsimulation vs its own/, 'hz'], [/garch simulation/, 'fhs'], [/vol.*implied|implied.*vol|^iv$|^iv\b/, 'iv'],
  [/contribution \(normal\)|contribution \(historical\)|stand-alone/, 'compvar'], 
  [/^delta\b/, 'delta'], [/^gamma/, 'gamma'], [/^vega/, 'vega'], [/^theta/, 'theta'], [/^rho/, 'rho'], [/^price$/, 'bs'], [/^implied σ/, 'ivsolve'],
  [/^spot$/, 'value'], [/atm volatility/, 'atmiv'], [/^skew \(/, 'skewkpi'], [/present value/, 'pv'], [/effective duration/, 'duration'], [/discount factor/, 'df'],
  [/^\+100 bp|^−100 bp/, 'bump'], [/zero rate/, 'zero'], [/k\/f/, 'moneyness'], [/full repricing|delta only|delta \+ gamma/, 'optstress'],
  [/worst .*day|worst \/ best/, 'worstwin'], [/overlapping history/, 'hist'], [/^shock/, 'shock'], [/loss on /, 'histscen'],
  [/^spot s$/, 'spotS'], [/^strike k$/, 'strikeK'], [/days to expiry/, 'dte'], [/^volatility σ/, 'sigma'], [/^rate r/, 'rateR'], [/^dividend yield/, 'divq'], [/^quantity/, 'qty'],
  [/^spot shocks/, 'spotshock'], [/^volatility shock/, 'volshock'], [/^days elapsed/, 'daysel'], [/^episode/, 'episode'], [/^hurt most/, 'hurt'], [/worst windows/, 'worstperiod'],
  [/^measure$/, 'measure'], [/^cash flows?/, 'cashflows'], [/^compare with/, 'compare'], [/open interest/, 'openint'], [/^underlying/, 'underlying'], [/^strikes$/, 'strikes'],
  [/^weight$/, 'weights'], [/^shock \(%\)/, 'shockpct'], [/^impact$/, 'impact'], [/^method( on the chart)?$/, 'method'], [/^series$/, 'series'], [/^period/, 'period'],
  [/public series bundled|my series/, 'series'], [/value of 100/, 'value'],
];
(function autoTips() {
  if (typeof document === 'undefined') return;
  const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  function decorate(root) {
    for (const el of root.querySelectorAll('th, .kpi > span, .lab-t, h2, h3')) {
      if (el.querySelector('.info') || el.closest('.pop')) continue;
      const t = norm(el.textContent), rule = AUTO.find(([re, k]) => re.test(t) && GLOSS[k]);
      if (rule) el.insertAdjacentHTML('beforeend', tip(rule[1]));
    }
  }
  let busy = false;
  const mo = new MutationObserver(() => { if (busy) return; busy = true; Promise.resolve().then(() => { busy = false; decorate(document.body); }); });
  document.addEventListener('DOMContentLoaded', () => { decorate(document.body); mo.observe(document.body, { childList: true, subtree: true }); });
})();
