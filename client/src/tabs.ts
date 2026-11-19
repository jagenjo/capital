import { PRODUCT_LIST, PRODUCTS, BUILDINGS, type ProductId } from '../../shared/data.js';
import { requiredWorkers, layoutIssues, harbourStocks } from '../../shared/engine.js';
import { h, money, money2, num, asset, cls } from './util.js';
import { S, act, companyOf } from './state.js';
import { focusTile } from './worldmap.js';

// ---------- Buildings list
export function buildingsScreen(): HTMLElement {
  const v = S.view!;
  if (!v.buildings.length) return h('div', { class: 'panel' }, 'You have no buildings yet. Go to the Map tab, pick a tile and buy a lot.');
  const total = v.buildings.reduce((a, b) => a + b.report.revenue - b.report.purchases - b.report.wages - b.report.maint, 0);
  const rows = [...v.buildings].sort((a, b) => a.city - b.city || a.type.localeCompare(b.type));
  return h('div', { class: 'panel' }, h('h2', null, 'Your buildings (' + rows.length + ') — last month operating result ', h('span', { class: cls(total) }, money(total))),
    h('table', null, h('thead', null, h('tr', null, ['Building', 'City', 'Product', 'Staff', 'Cond.', 'Stock', 'Produced', 'Revenue', 'Result', 'Issues'].map((x, i) => h('th', { class: i > 2 && i < 9 ? 'num' : '' }, x)))),
      h('tbody', null, rows.map(b => {
        const res = b.report.revenue - b.report.purchases - b.report.wages - b.report.maint;
        const need = requiredWorkers(b); const issues: string[] = [];
        if (b.type !== 'rd' && b.workers < need) issues.push('understaffed');
        if (b.condition < 60) issues.push('poor condition');
        if (b.type === 'store' && !b.slots.some(s => s.product)) issues.push('empty shelves');
        if (b.report.note.includes('short')) issues.push('input shortage');
        if (b.type === 'store' ? b.slots.some(s => s.product && !s.source) : b.type === 'factory' && layoutIssues(b, v.cities).length) issues.push(b.type === 'factory' ? 'layout: supply problem' : 'no source selected');
        if (b.type === 'store' && b.slots.some(s => s.product && s.source.startsWith('harbour:') && !harbourStocks(v.cities, s.source, s.product))) issues.push('harbour sold out');
        if (b.type !== 'store' && b.type !== 'rd' && b.stock.qty > 0 && b.listPrice == null) issues.push('not for sale');
        return h('tr', { class: 'clickable', onclick: () => { S.city = b.city; S.sel = b.idx; S.buildingId = b.id; S.tab = 'map'; focusTile(b.idx, 14); S.render(); } },
          h('td', null, h('span', { class: 'tag', style: 'background:' + BUILDINGS[b.type].color }), b.name), h('td', null, v.cities[b.city].name),
          h('td', null, b.type === 'store' ? b.slots.filter(s => s.product).map(s => PRODUCTS[s.product!].name).join(', ') || '—' : b.product ? PRODUCTS[b.product].name : ''),
          h('td', { class: 'num' }, b.workers + '/' + (b.type === 'rd' ? '–' : need)), h('td', { class: 'num' }, b.condition.toFixed(0) + '%'),
          h('td', { class: 'num' }, b.type === 'store' ? num(b.slots.reduce((a, s) => a + s.stock.qty, 0)) : num(b.stock.qty)),
          h('td', { class: 'num' }, b.type === 'store' ? num(b.report.sold) + ' sold' : num(b.report.produced)), h('td', { class: 'num' }, money(b.report.revenue)),
          h('td', { class: 'num ' + cls(res) }, money(res)), h('td', { class: 'bad small' }, issues.join(', ')));
      }))));
}

// ---------- Market
let mFilter: ProductId | '' = '';
export function marketScreen(): HTMLElement {
  const v = S.view!;
  const prodTable = h('table', null, h('thead', null, h('tr', null, ['Product', 'Type', 'Market index', 'Reference price', 'Import price', 'Retail ref.', 'Demand idx', 'My tech', 'My brand'].map((x, i) => h('th', { class: i > 1 ? 'num' : '' }, x)))),
    h('tbody', null, PRODUCT_LIST.map(p => { const m = v.market[p.id]; return h('tr', { class: 'clickable' + (mFilter === p.id ? ' sel' : ''), onclick: () => { mFilter = mFilter === p.id ? '' : p.id; S.render(); } },
      h('td', null, h('img', { src: asset(p.photo), style: 'width:34px;height:22px;object-fit:cover;vertical-align:middle;margin-right:6px' }), p.name), h('td', null, p.kind),
      h('td', { class: 'num ' + (m.idx > 1.05 ? 'bad' : m.idx < 0.95 ? 'good' : '') }, m.idx.toFixed(2)), h('td', { class: 'num' }, money2(p.basePrice * m.idx)), h('td', { class: 'num' }, money2(m.importPrice)),
      h('td', { class: 'num' }, p.kind === 'consumer' ? money2(m.retail) : '–'), h('td', { class: 'num' }, p.kind === 'consumer' ? m.demand.toFixed(2) : '–'),
      h('td', { class: 'num' }, v.me.tech[p.id].toFixed(0)), h('td', { class: 'num' }, v.me.brand[p.id].toFixed(0))); })));
  const ls = v.listings.filter(l => !mFilter || l.product === mFilter).sort((a, b) => a.product.localeCompare(b.product) || a.price - b.price);
  const listTable = h('table', null, h('thead', null, h('tr', null, ['Product', 'Seller', 'City', 'Price', 'Quality', 'Available'].map((x, i) => h('th', { class: i > 2 ? 'num' : '' }, x)))),
    h('tbody', null, ls.length ? ls.map(l => h('tr', null, h('td', null, PRODUCTS[l.product].name), h('td', null, h('span', { class: 'tag', style: 'background:' + companyOf(l.company)?.color }), companyOf(l.company)?.name, l.company === v.me.id ? ' (you)' : ''),
      h('td', null, v.cities[l.city].name), h('td', { class: 'num' }, money2(l.price)), h('td', { class: 'num' }, l.q), h('td', { class: 'num' }, num(l.qty)))) : h('tr', null, h('td', { colSpan: 6, class: 'muted' }, 'No factory is selling to everyone right now. Import through a harbour instead (+35%).'))));
  return h('div', { class: 'col' }, h('div', { class: 'panel' }, h('h2', null, 'Commodity & goods market'), prodTable, h('div', { class: 'note' }, 'Click a product to filter listings. Reference price = production-cost based; harbours import at the import price (quality 35) but you must pick a harbour or factory as the source of every input and shelf.')),
    h('div', { class: 'panel' }, h('h2', null, 'Factories selling to everyone ' + (mFilter ? '— ' + PRODUCTS[mFilter].name : '')), listTable),
    h('div', { class: 'panel' }, h('h2', null, 'Harbours — imported goods in stock'), harbourTable()));
}

/** All harbours with their 4 goods. Used by the Market tab; also reused for the harbour panel on the map. */
export function harbourTable(cityIds?: number[]): HTMLElement {
  const v = S.view!; const ports = v.cities.filter(c => c.port && (!cityIds || cityIds.includes(c.id)));
  return h('table', null, h('thead', null, h('tr', null, ['Harbour', 'Good', 'In stock', 'Price / unit', 'Refreshes'].map((x, i) => h('th', { class: i > 1 ? 'num' : '' }, x)))),
    h('tbody', null, ports.flatMap(c => (c.harbour ?? []).map((g, i) => h('tr', null, h('td', null, i === 0 ? '⚓ ' + c.name : ''),
      h('td', null, h('img', { src: asset(PRODUCTS[g.product].photo), style: 'width:30px;height:20px;object-fit:cover;vertical-align:middle;margin-right:6px' }), PRODUCTS[g.product].name),
      h('td', { class: 'num' }, num(g.qty) + ' ' + PRODUCTS[g.product].unit), h('td', { class: 'num' }, money2(v.market[g.product].importPrice * g.mult)),
      h('td', { class: 'num muted' }, 'sold out or in ' + Math.max(0, 12 - (v.turn - g.since)) + ' mo'))))));
}

// ---------- Finance
export function financeScreen(): HTMLElement {
  const v = S.view!; const me = v.me; const L = me.ledger;
  const borrow = h('input', { type: 'number', value: 100000, step: 50000 });
  const lines: [string, number][] = [['Revenue', L.revenue], ['Purchases', -L.purchases], ['Transport', -L.transport], ['Wages', -L.wages], ['Maintenance', -L.maint], ['Advertising', -L.ads], ['Interest', -L.interest], ['Tax (25%)', -L.tax]];
  const cv = h('canvas', { width: 640, height: 260 });
  setTimeout(() => chart(cv), 0);
  return h('div', { class: 'grid2' },
    h('div', { class: 'col' },
      h('div', { class: 'panel' }, h('h2', null, 'Balance'), h('div', { class: 'kv' },
        h('label', null, 'Cash'), h('div', { class: cls(me.cash) }, money(me.cash)), h('label', null, 'Debt'), h('div', null, money(me.debt)),
        h('label', null, 'Net worth'), h('b', null, money(me.netWorth)), h('label', null, 'Credit limit'), h('div', null, money(me.maxDebt)),
        h('label', null, 'Overdraft allowed'), h('div', null, money(me.overdraftLimit)), h('label', null, 'Loss carry-forward'), h('div', null, money(me.lossCarry))),
        h('div', { class: 'note' }, 'Loans cost 0.6% per month. Negative cash is charged 2%/month. If net worth stays negative for 3 months you go bankrupt.'),
        h('div', { class: 'row', style: 'margin-top:8px' }, borrow, h('button', { class: 'primary', onclick: () => act({ type: 'borrow', amount: +borrow.value }) }, 'Borrow'), h('button', { onclick: () => act({ type: 'repay', amount: +borrow.value }) }, 'Repay'), h('button', { onclick: () => act({ type: 'repay', amount: me.debt }) }, 'Repay all'))),
      h('div', { class: 'panel' }, h('h2', null, 'Last month income statement'),
        h('table', null, h('tbody', null, lines.map(([k, val]) => h('tr', null, h('td', null, k), h('td', { class: 'num ' + cls(val) }, money(val)))), h('tr', null, h('th', null, 'Profit'), h('th', { class: 'num ' + cls(L.profit) }, money(L.profit))))))),
    h('div', { class: 'panel' }, h('h2', null, 'History'), cv, h('div', { class: 'legend' }, h('span', null, h('i', { style: 'background:#1f4e8c' }), 'Net worth'), h('span', null, h('i', { style: 'background:#1c7c3a' }), 'Cash'), h('span', null, h('i', { style: 'background:#d98c00' }), 'Monthly profit'))));
}
function chart(cv: HTMLCanvasElement) {
  const hist = S.view!.me.history; const g = cv.getContext('2d')!; g.clearRect(0, 0, cv.width, cv.height); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
  if (hist.length < 2) { g.fillStyle = '#777'; g.font = '14px system-ui'; g.fillText('Play a few turns to see history.', 20, 30); return; }
  const series: [keyof typeof hist[0], string][] = [['netWorth', '#1f4e8c'], ['cash', '#1c7c3a'], ['profit', '#d98c00']];
  const all = hist.flatMap(p => series.map(([k]) => p[k] as number)); const lo = Math.min(0, ...all), hi = Math.max(1, ...all);
  const X = (i: number) => 60 + i / (hist.length - 1) * (cv.width - 80), Y = (val: number) => cv.height - 25 - (val - lo) / (hi - lo) * (cv.height - 45);
  g.strokeStyle = '#ddd'; g.fillStyle = '#666'; g.font = '11px system-ui'; g.textAlign = 'right';
  for (let i = 0; i <= 4; i++) { const val = lo + (hi - lo) * i / 4; g.beginPath(); g.moveTo(60, Y(val)); g.lineTo(cv.width - 20, Y(val)); g.stroke(); g.fillText(Math.abs(val) >= 1e6 ? (val / 1e6).toFixed(1) + 'M' : Math.round(val / 1000) + 'k', 54, Y(val) + 4); }
  for (const [k, col] of series) { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); hist.forEach((p, i) => i ? g.lineTo(X(i), Y(p[k] as number)) : g.moveTo(X(i), Y(p[k] as number))); g.stroke(); }
  g.textAlign = 'center'; g.fillStyle = '#666'; g.fillText('turn ' + hist[0].turn, 60, cv.height - 8); g.fillText('turn ' + hist[hist.length - 1].turn, cv.width - 30, cv.height - 8);
}

// ---------- Marketing
export function marketingScreen(): HTMLElement {
  const v = S.view!; const me = v.me;
  const total = Object.values(me.ads).reduce((a, b) => a + (b ?? 0), 0);
  return h('div', { class: 'panel' }, h('h2', null, 'Advertising — ' + money(total) + ' / month'), h('div', { class: 'note' }, 'Brand awareness boosts how attractive your shelves are against competitors. It decays 8% per month, so campaigns must be sustained. Spending has diminishing returns (square-root curve).'),
    h('img', { class: 'hero', src: asset('title/t_ads.jpg'), style: 'height:110px;max-width:600px;margin-top:8px' }),
    h('table', null, h('thead', null, h('tr', null, ['Product', 'Brand', 'Tech', 'Monthly ad budget'].map(x => h('th', null, x)))), h('tbody', null,
      PRODUCT_LIST.filter(p => p.kind === 'consumer').map(p => {
        const inp = h('input', { type: 'number', value: me.ads[p.id] ?? 0, step: 1000, min: 0 }); inp.addEventListener('change', () => act({ type: 'setAds', product: p.id, budget: +inp.value }));
        return h('tr', null, h('td', null, p.name), h('td', null, h('div', { class: 'row' }, h('div', { class: 'bar', style: 'width:120px' }, h('div', { style: 'width:' + me.brand[p.id] + '%' })), me.brand[p.id].toFixed(0))),
          h('td', null, me.tech[p.id].toFixed(0)), h('td', null, inp));
      }))));
}

// ---------- Rankings
export function rankingsScreen(): HTMLElement {
  const v = S.view!; const rows = [...v.companies].sort((a, b) => Number(a.bankrupt) - Number(b.bankrupt) || b.netWorth - a.netWorth);
  return h('div', { class: 'panel' }, h('h2', null, 'Company ranking'), h('table', null, h('thead', null, h('tr', null, ['#', '', 'Company', 'Type', 'Net worth', 'Buildings', 'Status'].map((x, i) => h('th', { class: i === 4 || i === 5 ? 'num' : '' }, x)))),
    h('tbody', null, rows.map((c, i) => h('tr', { class: c.id === v.me.id ? 'sel' : '' }, h('td', null, i + 1), h('td', null, h('img', { src: asset('person/' + String(c.portrait).padStart(2, '0') + '.png'), style: 'width:30px;height:30px;border:2px solid ' + c.color + ';image-rendering:pixelated' })),
      h('td', null, c.name), h('td', null, c.isAI ? 'AI' : 'Player'), h('td', { class: 'num' }, money(c.netWorth)), h('td', { class: 'num' }, c.buildings),
      h('td', null, c.bankrupt ? h('span', { class: 'bad' }, 'bankrupt') : c.isAI ? '' : c.ready ? h('span', { class: 'good' }, 'ready') : c.online ? 'planning…' : h('span', { class: 'muted' }, 'offline')))))),
    h('div', { class: 'note' }, v.settings.targetNetWorth > 0 ? 'Goal: first to ' + money(v.settings.targetNetWorth) + ' net worth, or richest after ' + v.settings.maxMonths + ' months.' : 'Richest company after ' + v.settings.maxMonths + ' months wins.'));
}

// ---------- News
export function newsScreen(): HTMLElement {
  const v = S.view!;
  const mine = v.me.news;
  return h('div', { class: 'grid2' }, h('div', { class: 'panel' }, h('h2', null, 'World news'), h('table', null, h('tbody', null, v.news.map(n => h('tr', null, h('td', { class: 'muted', style: 'white-space:nowrap' }, 'T' + n.turn), h('td', { class: n.kind === 'bad' ? 'bad' : n.kind === 'good' ? 'good' : '' }, n.text)))))),
    h('div', { class: 'panel' }, h('h2', null, 'Company messages'), mine.length ? h('table', null, h('tbody', null, [...mine].reverse().map(n => h('tr', null, h('td', { class: 'muted' }, 'T' + n.turn), h('td', null, n.text))))) : h('div', { class: 'muted' }, 'Nothing to report.')));
}
