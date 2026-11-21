// "The Capital": the News tab laid out as a newspaper. Last round's events go to different areas of the front page.
import { PRODUCTS, PRODUCT_LIST, type ProductId } from '../../shared/data.js';
import { worldPrice } from '../../shared/engine.js';
import { h, money, money2, num, asset } from './util.js';
import { S, companyOf } from './state.js';
import { subsidyText } from '../../shared/engine.js';
import { askPrice, newPrice, vacantName } from './realestate.js';

const pct = (x: number) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const sec = (title: string, ...kids: any[]) => h('section', { class: 'np-sec' }, h('h3', null, title), ...kids);

export function newsScreen(): HTMLElement {
  const v = S.view!; const last = v.turn - 1;
  const recent = v.news.filter(n => n.turn >= last);
  const events = recent.filter(n => !n.tag && n.turn > 0), older = v.news.filter(n => !n.tag && (n.turn < last || n.turn === 0));
  const openings = recent.filter(n => n.tag === 'opening'), products = recent.filter(n => n.tag === 'product');
  // ---- markets: biggest movers
  const moves = PRODUCT_LIST.map(p => { const m = v.market[p.id]; return { p, ch: m.prev ? m.idx / m.prev - 1 : 0, idx: m.idx }; }).sort((a, b) => Math.abs(b.ch) - Math.abs(a.ch));
  const up = moves.filter(x => x.ch > 0.001).slice(0, 4), down = moves.filter(x => x.ch < -0.001).slice(0, 4);
  // ---- headline
  const top = events.find(n => n.kind === 'bad') ?? events[0];
  const mv = moves[0];
  const head = top ? { t: top.text.replace(/[.!]$/, ''), sub: top.kind === 'bad' ? 'Analysts warn of knock-on effects across the economy.' : top.kind === 'good' ? 'Merchants are cautiously optimistic.' : 'Traders take note.' }
    : mv && Math.abs(mv.ch) > 0.01 ? { t: PRODUCTS[mv.p.id].name + ' prices ' + (mv.ch > 0 ? 'climb' : 'slip') + ' ' + Math.abs(mv.ch * 100).toFixed(1) + '%', sub: 'The biggest swing of the month on the commodity exchange.' } : { t: 'Quiet month on the exchanges', sub: 'Prices barely moved as merchants wait for news.' };
  // ---- business league
  const rk = v.rankings; const maxNw = Math.max(1, ...rk.map(r => r.netWorth));
  // ---- cities
  const byPop = [...v.cities].sort((a, b) => b.pop - a.pop), byWealth = [...v.cities].sort((a, b) => b.wealth - a.wealth);
  // ---- harbour specials: cheapest goods against the reference price
  const deals = v.cities.flatMap(c => c.port ? (c.harbour ?? []).filter(g => g.qty > 0.5).map(g => ({ c, g, disc: g.mult - 1 })) : []).sort((a, b) => a.disc - b.disc).slice(0, 4);
  // ---- stock exchange
  const stocks = v.companies.filter(c => !c.bankrupt).map(c => ({ c, ch: c.prevPrice ? c.price / c.prevPrice - 1 : 0 })).sort((a, b) => b.ch - a.ch);
  const market = recent.filter(n => n.tag === 'market');
  // ---- world trade
  const wt = PRODUCT_LIST.map(p => ({ p, n: v.market[p.id].worldSold })).filter(x => x.n > 0.5).sort((a, b) => b.n - a.n).slice(0, 4);
  // ---- consumer corner: priciest retail goods
  const cons = PRODUCT_LIST.filter(p => p.kind === 'consumer').map(p => ({ p, d: v.market[p.id].demand, r: v.market[p.id].retail })).slice(0, 5);

  const move = (x: { p: { id: ProductId }; ch: number }) => h('div', { class: 'np-row' }, h('span', null, PRODUCTS[x.p.id].name), h('b', { class: x.ch >= 0 ? 'bad' : 'good' }, (x.ch >= 0 ? '▲ ' : '▼ ') + pct(x.ch)));
  return h('div', { class: 'newspaper' },
    h('header', { class: 'np-mast' },
      h('div', { class: 'np-bar' }, h('span', null, 'Vol. ' + (Math.floor(v.turn / 12) + 1) + ' · No. ' + v.turn), h('span', null, v.date), h('span', null, v.gameName)),
      h('h1', null, 'The Capital'), h('div', { class: 'np-tag' }, 'All the news that moves the markets')),
    h('div', { class: 'np-front' },
      h('article', { class: 'np-lead' }, h('div', { class: 'np-kicker' }, 'Front page'), h('h2', null, head.t), h('p', { class: 'np-dek' }, head.sub),
        events.length > 1 ? h('div', { class: 'np-more' }, events.filter(e => e !== top).map(e => h('p', { class: e.kind === 'bad' ? 'bad' : e.kind === 'good' ? 'good' : '' }, e.text))) : null,
        h('p', null, up.length || down.length ? 'On the exchange, ' + (up[0] ? PRODUCTS[up[0].p.id].name + ' led the gainers (' + pct(up[0].ch) + ')' : 'no good rose') + (down[0] ? ' while ' + PRODUCTS[down[0].p.id].name + ' fell most (' + pct(down[0].ch) + ').' : '.') : 'The commodity exchange was flat.')),
      sec('Markets', h('div', { class: 'np-cols2' }, h('div', null, h('h4', null, 'Rising'), up.length ? up.map(move) : h('div', { class: 'muted' }, 'none')), h('div', null, h('h4', null, 'Falling'), down.length ? down.map(move) : h('div', { class: 'muted' }, 'none')))),
      sec('Business league', rk.slice(0, 6).map((r, i) => h('div', { class: 'np-bar2' }, h('span', null, (i + 1) + '. ', h('span', { class: 'tag', style: 'background:' + companyOf(r.id)?.color }), ' ' + r.name + (r.id === v.me.id ? ' (you)' : '')), h('span', { class: 'np-fill', style: 'width:' + Math.max(3, r.netWorth / maxNw * 100) + '%' }), h('b', null, money(r.netWorth)))))),
    h('div', { class: 'np-grid' },
      sec('New openings', openings.length ? openings.slice(0, 8).map(n => h('p', null, n.text)) : h('p', { class: 'muted' }, 'No new buildings opened.')),
      sec('City hall', v.subsidies.length ? v.subsidies.slice(0, 5).map(x => h('p', { class: 'clickable', onclick: () => { S.tab = 'realestate'; S.render(); } }, h('b', null, v.cities[x.city].name + ': '), subsidyText(x))) : h('p', { class: 'muted' }, 'No incentives on offer.'), recent.filter(n => n.tag === 'subsidy' && (n.text.includes(' pays ') || n.text.includes(' cuts '))).slice(0, 2).map(n => h('p', { class: 'np-old' }, n.text))),
      sec('Property for sale', v.vacant.length ? v.vacant.slice(0, 6).map(x => h('div', { class: 'np-row clickable', onclick: () => { S.tab = 'realestate'; S.render(); } }, h('span', null, vacantName(x) + ' · ' + v.cities[x.city].name), h('b', { class: 'good' }, money(askPrice(x)) + ' (−' + Math.round((1 - askPrice(x) / newPrice(x)) * 100) + '%)'))) : h('p', { class: 'muted' }, 'No facilities on the market.'), recent.filter(n => n.tag === 'vacant').slice(0, 3).map(n => h('p', { class: 'np-old' }, n.text))),
      sec('New on the shelves', products.length ? products.slice(0, 8).map(n => h('p', null, n.text)) : h('p', { class: 'muted' }, 'No company started selling a new product.')),
      sec('Harbour specials', deals.length ? deals.map(d => h('div', { class: 'np-row' }, h('span', null, h('img', { src: asset(PRODUCTS[d.g.product].photo) }), ' ' + PRODUCTS[d.g.product].name + ' · ' + d.c.name), h('b', { class: d.disc <= 0 ? 'good' : '' }, money2(v.market[d.g.product].importPrice * d.g.mult)))) : h('p', { class: 'muted' }, 'The docks are empty.')),
      sec('Stock exchange', stocks.slice(0, 3).concat(stocks.slice(-2)).filter((x, i, a) => a.indexOf(x) === i).map(x => h('div', { class: 'np-row' }, h('span', null, x.c.name), h('b', { class: x.ch >= 0 ? 'good' : 'bad' }, money2(x.c.price) + ' ' + (x.ch >= 0 ? '▲' : '▼') + Math.abs(x.ch * 100).toFixed(1) + '%'))), market.map(m => h('p', { class: 'np-old' }, m.text))),
      sec('World trade', wt.length ? wt.map(x => h('div', { class: 'np-row' }, h('span', null, PRODUCTS[x.p.id].name), h('b', null, num(x.n) + ' ' + PRODUCTS[x.p.id].unit + ' @ ' + money2(worldPrice(v as any, x.p.id))))) : h('p', { class: 'muted' }, 'Nothing was shipped to the world market.')),
      sec('Cities', h('div', { class: 'np-row' }, h('span', null, 'Largest'), h('b', null, byPop[0].name + ' · ' + num(byPop[0].pop))), h('div', { class: 'np-row' }, h('span', null, 'Richest'), h('b', null, byWealth[0].name + ' · ' + byWealth[0].wealth.toFixed(2))),
        h('div', { class: 'np-row' }, h('span', null, 'Highest wages'), h('b', null, (() => { const c = [...v.cities].sort((a, b) => v.cityWages[b.id] - v.cityWages[a.id])[0]; return c.name + ' · ' + money(v.cityWages[c.id]); })())),
        h('div', { class: 'np-row' }, h('span', null, 'Most jobless'), h('b', null, (() => { const c = [...v.cities].sort((a, b) => (v.cityLabor[b.id].pool - v.cityLabor[b.id].used) - (v.cityLabor[a.id].pool - v.cityLabor[a.id].used))[0]; return c.name + ' · ' + num(v.cityLabor[c.id].pool - v.cityLabor[c.id].used); })()))),
      sec('Consumer corner', cons.map(c => h('div', { class: 'np-row' }, h('span', null, PRODUCTS[c.p.id].name), h('b', null, money2(c.r) + ' · demand ' + c.d.toFixed(2))))),
      sec('Back issues', older.length ? older.slice(0, 8).map(n => h('p', { class: 'np-old' }, h('i', null, 'T' + n.turn + ' '), n.text)) : h('p', { class: 'muted' }, 'The archive is empty.'))));
}
