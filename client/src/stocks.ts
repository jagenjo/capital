// Stock market: every company is listed. Buy and sell shares of the others; issue or buy back your own.
import { SHARE_SPREAD, SHARE_IMPACT } from '../../shared/engine.js';
import { h, money, money2, num, crisp } from './util.js';
import { S, act, companyOf } from './state.js';
import { bid, bidInput, orderToast } from './desk.js';
import { pie } from './analytics.js';

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
        h('div', { class: 'note' }, 'Prices follow each company\'s net worth and recent profits. Trading moves the price a little and costs a ' + (SHARE_SPREAD * 100) + '% spread. Only shares on the market ("for sale") can be bought; the owners of AI companies also sell their own shares at a 50% premium. Holding more than 50% of a company merges it into yours (its other investors are bought out). Outside shareholders receive their part of the dividend at the fiscal year end (December); AI companies list 30% of their shares from the start.')),
      ownersPanel(me.id)),
    h('div', { class: 'col' }, detail(t), t.id !== me.id ? ownersPanel(t.id) : null));
}

/** Who owns a company: its own treasury, other companies, and the public (shares on the market). */
function ownersPanel(id: string): HTMLElement {
  const v = S.view!; const c = v.companies.find(x => x.id === id)!; const isMe = id === v.me.id;
  const treas = Math.max(0, c.shares - c.float - c.held);
  const slices = [{ label: (isMe ? 'You (' + c.name + ')' : c.name + ' itself'), value: treas, color: c.color },
    ...c.holders.map(x => ({ label: (companyOf(x.id)?.name ?? x.id) + (x.id === v.me.id ? ' (you)' : ''), value: x.qty, color: companyOf(x.id)?.color })),
    { label: 'Public investors (on the market)', value: c.float, color: '#ffffff' }];
  const top = c.holders.reduce((m, x) => x.qty > m.qty ? x : m, { id: '', qty: 0 });
  return h('div', { class: 'panel' }, h('h2', null, isMe ? 'Who owns your company' : 'Who owns ' + c.name), pie(slices, n => num(Math.round(n)) + ' sh', 170),
    isMe && top.qty / c.shares > 0.3 ? h('div', { class: 'bad small' }, '⚠ ' + (companyOf(top.id)?.name ?? '?') + ' owns ' + (top.qty / c.shares * 100).toFixed(1) + '% of your shares: above 50% they take over your company.') : null,
    h('div', { class: 'note' }, 'Shares the company still holds itself (treasury), the stakes other companies bought, and the shares in public hands that anyone can buy.'));
}
function detail(t: NonNullable<ReturnType<typeof companyOf>> & any): HTMLElement {
  const v = S.view!; const me = v.me; const c = v.companies.find(x => x.id === t.id)!; const isMe = c.id === me.id;
  const have = isMe ? 0 : me.portfolio?.[c.id] ?? 0;
  const cv = crisp(h('canvas', { style: 'background:#fff;border:1px solid #bbb' }), 520, 180);
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
        : [h('button', { class: 'primary', onclick: async () => { orderToast(await act({ type: 'buyShares', company: c.id, qty, bid: bid.value })); } }, 'Order'), bidInput(), h('button', { onclick: () => act({ type: 'sellShares', company: c.id, qty }) }, 'Sell'), h('button', { onclick: () => act({ type: 'sellShares', company: c.id, qty: have }) }, 'Sell all')]),
    h('div', { class: 'note' }, isMe
      ? 'Issuing sells your own shares to investors for cash (price moves ~' + (impact * 100).toFixed(1) + '%, 3% fee). Buying back takes them off the market again. Outside shareholders get dividends; set the payout in Finance. Careful: if one investor ends up holding more than 50% of your shares, they take over your company and you lose.'
      : 'You hold ' + num(have) + ' shares (' + money(have * c.price) + '). Buying ' + num(qty) + ' costs about ' + money(qty * buyPx * (1 + SHARE_SPREAD)) + '; selling raises about ' + money(qty * sellPx * (1 - SHARE_SPREAD)) + '.'));
}

function lineChart(cv: HTMLCanvasElement, data: number[]) {
  const g = cv.getContext('2d')!; g.clearRect(0, 0, 520, 180);
  if (data.length < 2) { g.fillStyle = '#777'; g.font = '13px system-ui'; g.fillText('Price history appears after a few turns.', 16, 24); return; }
  const lo = Math.min(...data) * 0.97, hi = Math.max(...data) * 1.03; const X = (i: number) => 40 + i / (data.length - 1) * (520 - 50), Y = (x: number) => 180 - 18 - (x - lo) / Math.max(1e-9, hi - lo) * (cv.height - 30);
  g.strokeStyle = '#ddd'; g.fillStyle = '#666'; g.font = '10px system-ui'; g.textAlign = 'right';
  for (let i = 0; i <= 3; i++) { const val = lo + (hi - lo) * i / 3; g.beginPath(); g.moveTo(40, Y(val)); g.lineTo(520 - 10, Y(val)); g.stroke(); g.fillText(val.toFixed(2), 36, Y(val) + 3); }
  g.strokeStyle = '#1f4e8c'; g.lineWidth = 2; g.beginPath(); data.forEach((p, i) => i ? g.lineTo(X(i), Y(p)) : g.moveTo(X(i), Y(p))); g.stroke();
}
