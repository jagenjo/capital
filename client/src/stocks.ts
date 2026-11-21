// Stock market: every company is listed. Buy and sell shares of the others; issue or buy back your own.
import { SHARE_SPREAD, SHARE_IMPACT, MIN_OWN } from '../../shared/engine.js';
import { h, money, money2, num } from './util.js';
import { S, act, companyOf } from './state.js';

let sel = ''; let qty = 1000;
const pct = (x: number) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';

export function stocksScreen(): HTMLElement {
  const v = S.view!; const me = v.me; const port = me.portfolio ?? {};
  if (!sel || !v.companies.some(c => c.id === sel)) sel = v.companies.find(c => c.id !== me.id && !c.bankrupt)?.id ?? me.id;
  const folioValue = Object.entries(port).reduce((n, [id, q]) => n + q * (v.companies.find(c => c.id === id)?.price ?? 0), 0);
  const rows = v.companies.filter(c => !c.bankrupt).map(c => {
    const mine = c.id === me.id ? 0 : port[c.id] ?? 0, ch = c.prevPrice ? c.price / c.prevPrice - 1 : 0;
    return h('tr', { class: 'clickable' + (sel === c.id ? ' sel' : ''), onclick: () => { sel = c.id; S.render(); } },
      h('td', null, h('span', { class: 'tag', style: 'background:' + c.color }), ' ' + c.name + (c.id === me.id ? ' (you)' : '')),
      h('td', { class: 'num' }, money2(c.price)), h('td', { class: 'num ' + (ch > 0.0005 ? 'good' : ch < -0.0005 ? 'bad' : '') }, pct(ch)),
      h('td', { class: 'num' }, money(c.price * c.shares)), h('td', { class: 'num' }, num(c.float)),
      h('td', { class: 'num' }, c.lastDps ? money2(c.lastDps) : '–'),
      h('td', { class: 'num' }, mine ? num(mine) + ' (' + (mine / c.shares * 100).toFixed(1) + '%)' : '–'), h('td', { class: 'num' }, mine ? money(mine * c.price) : '–'));
  });
  const t = v.companies.find(c => c.id === sel)!;
  return h('div', { class: 'grid2' },
    h('div', { class: 'col' },
      h('div', { class: 'panel' }, h('h2', null, 'Stock market'),
        h('div', { class: 'kv' }, h('label', null, 'Your cash'), h('div', null, money(me.cash)), h('label', null, 'Portfolio value'), h('b', null, money(folioValue))),
        h('table', null, h('thead', null, h('tr', null, ['Company', 'Price', 'Month', 'Market cap', 'For sale', 'Last dividend', 'You hold', 'Value'].map((x, i) => h('th', { class: i ? 'num' : '' }, x)))), h('tbody', null, rows)),
        h('div', { class: 'note' }, 'Prices follow each company\'s net worth and recent profits. Trading moves the price a little and costs a ' + (SHARE_SPREAD * 100) + '% spread. Only shares on the market ("for sale") can be bought. Outside shareholders receive their part of the dividend at the fiscal year end (December); AI companies list 30% of their shares from the start.'))),
    h('div', { class: 'col' }, detail(t)));
}

function detail(t: NonNullable<ReturnType<typeof companyOf>> & any): HTMLElement {
  const v = S.view!; const me = v.me; const c = v.companies.find(x => x.id === t.id)!; const isMe = c.id === me.id;
  const have = isMe ? 0 : me.portfolio?.[c.id] ?? 0;
  const cv = h('canvas', { width: 520, height: 180, style: 'width:100%;background:#fff;border:1px solid #bbb' });
  setTimeout(() => lineChart(cv, c.priceHist), 0);
  const treas = c.shares - c.float - c.held;
  const impact = SHARE_IMPACT * qty / c.shares, buyPx = c.price * (1 + impact), sellPx = Math.max(0.01, c.price * (1 - impact));
  const input = h('input', { type: 'number', value: qty, min: 1, step: 1000, style: 'width:120px', onchange: (e: Event) => { qty = Math.max(1, Math.floor(+(e.target as HTMLInputElement).value || 1)); S.render(); } });
  const holders = c.holders.map(x => h('div', null, h('span', { class: 'tag', style: 'background:' + companyOf(x.id)?.color }), ' ' + (companyOf(x.id)?.name ?? '?') + ': ' + num(x.qty) + ' (' + (x.qty / c.shares * 100).toFixed(1) + '%)'));
  return h('div', { class: 'panel' }, h('h2', null, c.name + ' — ' + money2(c.price) + ' / share'), cv,
    h('div', { class: 'kv', style: 'margin-top:6px' }, h('label', null, 'Shares'), h('div', null, num(c.shares)), h('label', null, 'Market cap'), h('div', null, money(c.price * c.shares)),
      h('label', null, isMe ? 'Held by you' : 'Held by its owners'), h('div', null, num(treas) + ' (' + (treas / c.shares * 100).toFixed(0) + '%)'),
      h('label', null, 'On the market'), h('div', null, num(c.float) + ' (' + (c.float / c.shares * 100).toFixed(0) + '%)'),
      h('label', null, 'Investors'), h('div', null, holders.length ? holders : 'none'), h('label', null, 'Net worth'), h('div', null, money(c.netWorth))),
    h('div', { class: 'row', style: 'margin-top:8px' }, 'Shares', input,
      isMe ? [h('button', { class: 'primary', onclick: () => act({ type: 'issueShares', qty }) }, 'Issue (sell to market)'), h('button', { onclick: () => act({ type: 'buybackShares', qty }) }, 'Buy back')]
        : [h('button', { class: 'primary', onclick: () => act({ type: 'buyShares', company: c.id, qty }) }, 'Buy'), h('button', { onclick: () => act({ type: 'sellShares', company: c.id, qty }) }, 'Sell'), h('button', { onclick: () => act({ type: 'sellShares', company: c.id, qty: have }) }, 'Sell all')]),
    h('div', { class: 'note' }, isMe
      ? 'Issuing sells your own shares to investors for cash (price moves ~' + (impact * 100).toFixed(1) + '%, 3% fee); you must keep ' + Math.round(MIN_OWN * 100) + '%. Buying back takes them off the market again. Outside shareholders get dividends; set the payout in Finance.'
      : 'You hold ' + num(have) + ' shares (' + money(have * c.price) + '). Buying ' + num(qty) + ' costs about ' + money(qty * buyPx * (1 + SHARE_SPREAD)) + '; selling raises about ' + money(qty * sellPx * (1 - SHARE_SPREAD)) + '.'));
}

function lineChart(cv: HTMLCanvasElement, data: number[]) {
  const g = cv.getContext('2d')!; g.clearRect(0, 0, cv.width, cv.height);
  if (data.length < 2) { g.fillStyle = '#777'; g.font = '13px system-ui'; g.fillText('Price history appears after a few turns.', 16, 24); return; }
  const lo = Math.min(...data) * 0.97, hi = Math.max(...data) * 1.03; const X = (i: number) => 40 + i / (data.length - 1) * (cv.width - 50), Y = (x: number) => cv.height - 18 - (x - lo) / Math.max(1e-9, hi - lo) * (cv.height - 30);
  g.strokeStyle = '#ddd'; g.fillStyle = '#666'; g.font = '10px system-ui'; g.textAlign = 'right';
  for (let i = 0; i <= 3; i++) { const val = lo + (hi - lo) * i / 3; g.beginPath(); g.moveTo(40, Y(val)); g.lineTo(cv.width - 10, Y(val)); g.stroke(); g.fillText(val.toFixed(2), 36, Y(val) + 3); }
  g.strokeStyle = '#1f4e8c'; g.lineWidth = 2; g.beginPath(); data.forEach((p, i) => i ? g.lineTo(X(i), Y(p)) : g.moveTo(X(i), Y(p))); g.stroke();
}
