'use strict';
/* Risk, nineteenth set: FRTB standardised default risk charge on a small credit book. Maths in riskx18.js (tested). */
Lab.reg('drc', {
  kicker: 'Regulatory capital', title: 'FRTB default risk charge: jump to default, netting and the hedge benefit',
  lead: 'The default risk charge asks one question: what if the issuers in the book defaulted tomorrow? Long positions lose, shorts gain, and only part of the shorts count as a hedge. Set the positions and see how the charge moves.',
  controls: [
    { id: 'lgd', label: 'Loss given default', opts: [[0.75, 'Senior unsecured, 75%'], [1, 'Equity, 100%'], [0.25, 'Covered bond, 25%']], val: 0.75 },
    ...[['n1', 'Corporate AA (bucket corporate)', 40], ['n2', 'Corporate BBB (corporate)', 60], ['n3', 'Corporate BB (corporate)', 30], ['n4', 'Corporate B (corporate)', -20], ['n5', 'Bank A (bucket financial)', 50], ['n6', 'Bank BBB (financial)', -35]]
      .map(([id, label, val]) => ({ id, label: label + ': notional', min: -100, max: 100, step: 5, val, fmt: (x) => (x >= 0 ? 'long ' : 'short ') + Math.abs(x) })),
    { id: 'hs', label: 'Short positions kept (stress on the hedge)', min: 0, max: 1.5, step: 0.1, val: 1, fmt: (x) => Math.round(x * 100) + '%' }],
  note: 'Simplified from the Basel FRTB standardised approach (non-securitisation, d457): jump-to-default = notional × loss given default; positions on the same obligor net; each obligor is weighted by its credit quality (AAA 0.5%, AA 2%, A 3%, BBB 6%, BB 15%, B 30%, CCC 50%, unrated 15%, default 100%); the <b>hedge benefit ratio</b> is net long ÷ (net long + net short), so a short never offsets a long one for one; the charge of a bucket is its weighted long minus the ratio times its weighted short, floored at zero, and the buckets add up. Not modelled: maturity scaling under one year, the different LGDs by seniority inside one name, sector-specific weights for sovereigns and public sectors, the P&amp;L already taken. The book, ratings and prices are illustrative: a real use needs a publishable source of ratings or CDS spreads, which crypto does not provide.',
  draw(v, out) {
    const X = Risk.x, nm = [['Corporate AA', 'AA', 'corporate'], ['Corporate BBB', 'BBB', 'corporate'], ['Corporate BB', 'BB', 'corporate'], ['Corporate B', 'B', 'corporate'], ['Bank A', 'A', 'financial'], ['Bank BBB', 'BBB', 'financial']];
    const build = (hs) => nm.map(([id, rating, bucket], i) => { const n = v['n' + (i + 1)]; return { id, rating, bucket, jtd: (n > 0 ? n : n * hs) * v.lgd }; });
    const R = X.drc(build(v.hs)), sc = Array.from({ length: 16 }, (_, i) => i * 0.1), cur = sc.map((h) => X.drc(build(h)).total), nohedge = X.drc(build(0)).total;
    out.innerHTML = `<div class="kpis">${kpi('Default risk charge', R.total.toFixed(2), 'in the unit of the notionals')}${kpi('Without any short', nohedge.toFixed(2), 'all hedges removed')}${kpi('Hedge benefit', pct(nohedge ? 1 - R.total / nohedge : 0, 0), 'of the charge removed by the shorts', 'ok')}</div>
      ${Lab.table(['Bucket', 'Net long', 'Net short', 'Hedge benefit ratio', 'Charge'], R.buckets.map((b) => [b.bucket, b.netLong.toFixed(1), b.netShort.toFixed(1), pct(b.hbr, 0), b.charge.toFixed(2)]))}
      ${Lab.card('c1', 'Charge against the share of shorts kept', [['a', 'default risk charge'], ['m', 'chosen']])}`;
    later(() => Lab.plot($('#c1'), { series: [{ x: sc, y: cur, c: 'a', w: 2 }], vlines: [{ x: v.hs, c: 'm' }], hlines: [{ y: 0 }], xfmt: (x) => Math.round(x * 100) + '%', yfmt: (y) => y.toFixed(0), h: 200 }));
  },
});
