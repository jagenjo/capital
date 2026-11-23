import { tr } from './i18n.js';
import { prodImg, hasPhoto, facImg, personImg } from './prodimg.js';
import { productCard, offersOf } from './prodcard.js';
import { PRODUCT_LIST, PRODUCTS, BUILDINGS, defOf, LENDERS, type Lender, type ProductId } from '../../shared/data.js';
import { requiredWorkers, layoutIssues, harbourStocks, worldPrice, worldVolume, WORLD_DROP, loanOffer, loanDue, collateralValue, pledgedTo, MAX_LOANS } from '../../shared/engine.js';
import { h, money, money2, num, asset, cls, crisp, toast } from './util.js';
import { S, act, companyOf } from './state.js';
import { focusTile } from './worldmap.js';
import { pie } from './analytics.js';
import { contractItem, openEditor } from './desk.js';
import { conversationPanel, unreadFrom } from './messages.js';
import { contractDoc, contractFolder, docOverlay, dateOfTurn, type FolderItem } from './contract.js';
type Kid = Node | string | number | null | undefined | false;

// ---------- Buildings list
let bView: 'list' | 'cards' = localStorage.getItem('capital.bview') === 'cards' ? 'cards' : 'list';
export function buildingsScreen(): HTMLElement {
  const v = S.view!;
  if (!v.buildings.length) return h('div', { class: 'panel' }, 'You have no buildings yet. Go to the Map tab, pick a tile and buy a lot.');
  const total = v.buildings.reduce((a, b) => a + b.report.revenue - b.report.purchases - b.report.wages - b.report.maint, 0);
  // raw-material facilities first (farms, mines...), then factories, then shops, then R&D and the rest
  const GROUP: Record<string, number> = { farm: 0, forest: 0, mine: 0, copper: 0, quarry: 0, rare: 0, oil: 0, factory: 1, store: 2, supermarket: 2 };
  const rows = [...v.buildings].sort((a, b) => (GROUP[a.type] ?? 3) - (GROUP[b.type] ?? 3) || a.type.localeCompare(b.type) || a.city - b.city || a.name.localeCompare(b.name));
  const info = (b: typeof rows[number]) => {
    const res = b.report.revenue - b.report.purchases - b.report.wages - b.report.maint; const need = requiredWorkers(b); const issues: string[] = [];
    const opens = b.building ?? (b.mall ? v.malls.find(m => m.id === b.mall)?.opensIn : 0) ?? 0; if (opens) issues.push('🚧 opens in ' + opens + ' mo');
    if (!opens && b.type !== 'rd' && b.workers < need) issues.push('understaffed');
    if (b.condition < 60) issues.push('poor condition');
    if (b.type === 'store' && !b.slots.some(s => s.product)) issues.push('empty shelves');
    if (b.report.note.includes('short')) issues.push('input shortage');
    if (b.type === 'store' ? b.slots.some(s => s.product && !s.source) : b.type === 'factory' && layoutIssues(b, v.cities).length) issues.push(b.type === 'factory' ? 'layout: supply problem' : 'no source selected');
    if (b.type === 'store' && b.slots.some(s => s.product && s.source.startsWith('harbour:') && !harbourStocks(v.cities, s.source, s.product))) issues.push('harbour sold out');
    if (b.type !== 'store' && b.type !== 'rd' && b.stock.qty > 0 && b.listPrice == null) issues.push('not for sale');
    const products = b.type === 'store' ? b.slots.filter(s => s.product).map(s => PRODUCTS[s.product!].name).join(', ') || '—' : b.product ? PRODUCTS[b.product].name : '';
    const stock = b.type === 'store' ? num(b.slots.reduce((a, s) => a + s.stock.qty, 0)) : num(b.stock.qty);
    const made = b.type === 'store' ? num(b.report.sold) + ' sold' : num(b.report.produced);
    const manager = v.me.staff?.find(p => p.assigned === b.id)?.name;
    const go = () => { S.city = b.city; S.sel = b.idx; S.buildingId = b.id; S.tab = 'map'; focusTile(b.idx, 14); S.render(); };
    return { res, need, issues, products, stock, made, manager, go };
  };
  const toggle = h('div', { class: 'row', style: 'gap:4px;margin:0 0 8px' }, (['list', 'cards'] as const).map(m => h('button', { class: bView === m ? 'primary mini' : 'mini', onclick: () => { bView = m; localStorage.setItem('capital.bview', m); S.render(); } }, m === 'list' ? '☰ List' : '▦ Cards')));
  const table = h('table', null, h('thead', null, h('tr', null, ['Building', 'City', 'Product', 'Manager', 'Staff', 'Cond.', 'Stock', 'Produced', 'Revenue', 'Result', 'Issues'].map((x, i) => h('th', { class: i > 3 && i < 10 ? 'num' : '' }, x)))),
    h('tbody', null, rows.map(b => { const i = info(b);
      return h('tr', { class: 'clickable', onclick: i.go },
        h('td', null, h('span', { class: 'tag', style: 'background:' + defOf(b).color }), b.name), h('td', null, v.cities[b.city].name), h('td', null, i.products),
        h('td', null, i.manager ?? (b.type === 'store' || b.type === 'rd' ? '' : h('span', { class: 'muted' }, '—'))),
        h('td', { class: 'num' }, b.workers + '/' + (b.type === 'rd' ? '–' : i.need)), h('td', { class: 'num' }, b.condition.toFixed(0) + '%'),
        h('td', { class: 'num' }, i.stock), h('td', { class: 'num' }, i.made), h('td', { class: 'num' }, money(b.report.revenue)),
        h('td', { class: 'num ' + cls(i.res) }, money(i.res)), h('td', { class: 'bad small' }, i.issues.join(', '))); })));
  const cards = h('div', { class: 'bcards' }, rows.map(b => { const i = info(b);
    const pic = b.product && b.type !== 'store' && b.type !== 'rd' && hasPhoto(b.product) ? prodImg(b.product, 300, 110, 'display:block;width:100%') : facImg(b.type, 300, 110, 'display:block;width:100%');
    return h('div', { class: 'bcard' + (i.issues.length ? ' warn' : ''), onclick: i.go, title: 'Open on the map' }, h('div', { class: 'bc-pic' }, pic),
      h('div', { class: 'bc-head' }, h('span', { class: 'tag', style: 'background:' + defOf(b).color }), h('b', null, b.name), h('span', { class: 'muted' }, ' · ' + v.cities[b.city].name)),
      h('div', { class: 'bc-prod' }, i.products || defOf(b).name),
      h('div', { class: 'bc-grid' }, h('span', null, 'Staff'), h('b', null, b.workers + '/' + (b.type === 'rd' ? '–' : i.need)), h('span', null, 'Condition'), h('b', null, b.condition.toFixed(0) + '%'),
        h('span', null, 'Stock'), h('b', null, i.stock), h('span', null, b.type === 'store' ? 'Sold' : 'Produced'), h('b', null, i.made),
        h('span', null, 'Revenue'), h('b', null, money(b.report.revenue)), h('span', null, 'Result'), h('b', { class: cls(i.res) }, money(i.res))),
      i.manager ? h('div', { class: 'note' }, 'Manager: ' + i.manager) : null,
      i.issues.length ? h('div', { class: 'bad small' }, '⚠ ' + i.issues.join(', ')) : null); }));
  return h('div', { class: 'panel' }, h('h2', null, 'Your buildings (' + rows.length + ') — last month operating result ', h('span', { class: cls(total) }, money(total))), toggle, bView === 'cards' ? cards : table);
}

// ---------- Market
let mFilter: ProductId | '' = '';
let mSearch = '';
type MType = '' | 'raw' | 'manu' | 'tech' | 'food';
const FOOD: string[] = ['grain', 'corn', 'vegetables', 'fruits', 'sugar', 'livestock', 'bread', 'meat', 'dairy', 'pastry', 'beverages', 'alcohol', 'ultrafood', 'canned']; // farm produce and the foods made from it
let mType: MType = '';
/** Product groups: Resources (raw materials), Technology (hi-tech goods that need research), Manufacture (everything else that is made). */
const typeOf = (p: { kind: string; research?: number }): MType => p.kind === 'raw' ? 'raw' : p.research ? 'tech' : 'manu';
const matchesSearch = (p: { id?: string; name: string; kind: string; research?: number }) => (!mType || (mType === 'food' ? FOOD.includes(p.id ?? '') : typeOf(p) === mType)) && (!mSearch || (tr(p.name) + ' ' + p.name + ' ' + p.kind).toLowerCase().includes(mSearch.toLowerCase()));
/** Text box that filters the product rows of the Market tab; keeps focus while the list is redrawn. */
const searchBox = () => { const i = h('input', { type: 'text', placeholder: tr('Filter products…'), value: mSearch, style: 'width:220px', oninput: (e: Event) => { mSearch = (e.target as HTMLInputElement).value; const pos = (e.target as HTMLInputElement).selectionStart; S.render(); const n = document.querySelector<HTMLInputElement>('input.msearch'); n?.focus(); n?.setSelectionRange(pos, pos); } }); i.classList.add('msearch'); return i; };
/** Products somebody on the map makes right now (finished facilities only: farms, mines, factories...). */
function producedOnMap(): Set<ProductId> {
  const v = S.view!; const out = new Set<ProductId>(); const skip = (t: string) => t === 'store' || t === 'rd' || t === 'mall' || t === 'hall';
  for (const b of v.buildings) if (b.product && !b.building && !skip(b.type)) out.add(b.product);
  for (const o of v.others) if (o.product && !o.building && !skip(o.type)) out.add(o.product);
  return out;
}
/** Products the harbours have in stock: the goods that are being brought in from abroad. */
function importedGoods(): Set<ProductId> {
  const out = new Set<ProductId>(); for (const c of S.view!.cities) for (const g of c.harbour ?? []) if (g.qty > 0.5) out.add(g.product);
  return out;
}
/** A heading row that splits a table in two groups. */
const groupRow = (cols: number, title: string, n: number, hint: string) => h('tr', { class: 'grouprow' }, h('td', { colSpan: cols }, h('b', null, title), h('span', { class: 'muted small' }, ' · ' + n + ' · ' + hint)));
/** Rows in two groups (first the ones in `first`), each introduced by a heading. */
function twoGroups<T extends { id: ProductId }>(list: T[], first: Set<ProductId>, cols: number, row: (x: T) => HTMLElement, t1: [string, string], t2: [string, string]): HTMLElement[] {
  const a = list.filter(x => first.has(x.id)), b = list.filter(x => !first.has(x.id)); const out: HTMLElement[] = [];
  if (a.length) out.push(groupRow(cols, t1[0], a.length, t1[1]), ...a.map(row));
  if (b.length) out.push(groupRow(cols, t2[0], b.length, t2[1]), ...b.map(row));
  return out;
}
/** The Market tab: one screen with a switch between the local (city) market and the world market. */
let marketView: 'local' | 'world' = 'local';
export function marketHub(): HTMLElement {
  const btn = (k: 'local' | 'world', label: string) => h('button', { class: marketView === k ? 'primary' : '', onclick: () => { marketView = k; S.render(); } }, label);
  return h('div', null, h('div', { class: 'row', style: 'gap:4px;margin-bottom:8px' }, btn('local', 'Local market'), btn('world', 'World market')),
    h('div', { class: 'row', style: 'gap:6px;margin-bottom:8px' }, searchBox(), (['', 'food', 'raw', 'manu', 'tech'] as MType[]).map(k => h('button', { class: 'mini' + (mType === k ? ' primary' : ''), onclick: () => { mType = k; S.render(); } }, k === '' ? 'All' : k === 'food' ? 'Food' : k === 'raw' ? 'Resources' : k === 'manu' ? 'Manufacture' : 'Technology'))), marketView === 'local' ? marketScreen() : worldScreen());
}
/** Pie of what was sold last month: the units of the selected product split by company (or, with no product selected, the units of every product). */
function salesPie(kind: 'local' | 'world'): HTMLElement {
  const v = S.view!; const unit = (n: number) => num(Math.round(n));
  const sel = mFilter ? PRODUCTS[mFilter] : null;
  const who = (c: string) => c === 'npc' ? 'Imports & other shops' : companyOf(c)?.name ?? c;
  const note = (txt: string) => h('div', { class: 'note' }, txt);
  if (sel) {
    const loc = v.sales.local[sel.id] ?? {}, wor = v.sales.world[sel.id] ?? {}, sum = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);
    // company colours; white = the market itself (imports, background shops, foreign suppliers)
    const bySeller = (m: Record<string, number>, market: string) => Object.entries(m).map(([c, n]) => c === 'npc' ? { label: market, value: n, color: '#ffffff' } : { label: (companyOf(c)?.name ?? c) + (c === v.me.id ? ' (you)' : ''), value: n, color: companyOf(c)?.color });
    const sub = (title: string, slices: { label: string; value: number }[]) => h('div', null, h('h3', { style: 'margin:6px 0 4px' }, title), pie(slices, unit, 150));
    return h('div', { class: 'panel', style: 'flex:none;width:420px;box-sizing:border-box' }, h('h2', null, 'Sold last month — ' + sel.name),
      sub('Local market, by company', bySeller(loc, 'Local market (other shops & imports)')),
      sub('World market, by company', bySeller(wor, 'Global market (foreign suppliers)')),
      sub('Local vs world market', [{ label: 'Local market', value: sum(loc) }, { label: 'World market', value: sum(wor) }]),
      note('Units sold per company (company colours; white = the local or global market itself). It shows whose product people prefer. Click the product again to see all products.'));
  }
  const data = v.sales[kind] ?? {};
  const slices = Object.entries(data).map(([p, m]) => ({ label: PRODUCTS[p as ProductId].name, value: Object.values(m).reduce((a, b) => a + b, 0) }));
  return h('div', { class: 'panel', style: 'flex:none;width:420px;box-sizing:border-box' }, h('h2', null, (kind === 'local' ? 'Sold last month' : 'Sold to the world last month') + ' — all products'),
    pie(slices, unit, 170), note('Units sold per product. Click a product to see which companies sell it.'));
}
/** Units sold over time (selected product, or all products) and which products people want the most. */
function trendPanels(): HTMLElement {
  const v = S.view!, H = v.salesHist ?? {}; const sel = mFilter || null;
  const ids = sel ? [sel] : PRODUCT_LIST.map(p => p.id);
  const series = (k: 'l' | 'w' | 'd') => { const n = Math.max(0, ...ids.map(p => H[p]?.[k].length ?? 0)); return Array.from({ length: n }, (_, i) => ids.reduce((a, p) => { const arr = H[p]?.[k] ?? []; return a + (arr[arr.length - n + i] ?? 0); }, 0)); };
  const lines: [string, string, number[]][] = [['Local market', '#1f4e8c', series('l')], ['World market', '#2f9e44', series('w')], ['Demand', '#d98c00', series('d')]];
  const W = 520, Ht = 200, cv = crisp(h('canvas'), W, Ht), g = cv.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, W, Ht);
  const n = lines[0][2].length;
  if (n < 2) { g.fillStyle = '#777'; g.font = '13px system-ui'; g.fillText(tr('Play a few turns to see history.'), 16, 26); }
  else {
    const hi = Math.max(1, ...lines.flatMap(l => l[2])) * 1.05; const X = (i: number) => 52 + i / (n - 1) * (W - 66), Y = (x: number) => Ht - 22 - x / hi * (Ht - 40);
    g.strokeStyle = '#ddd'; g.fillStyle = '#666'; g.font = '10px system-ui'; g.textAlign = 'right';
    for (let i = 0; i <= 4; i++) { const val = hi * i / 4; g.beginPath(); g.moveTo(52, Y(val)); g.lineTo(W - 14, Y(val)); g.stroke(); g.fillText(val >= 1e6 ? (val / 1e6).toFixed(1) + 'M' : val >= 1000 ? Math.round(val / 1000) + 'k' : String(Math.round(val)), 48, Y(val) + 3); }
    for (const [, col, d] of lines) { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); d.forEach((p, i) => i ? g.lineTo(X(i), Y(p)) : g.moveTo(X(i), Y(p))); g.stroke(); }
    g.textAlign = 'center'; g.fillText(`${n - 1} ${tr('turns ago')}`, 52, Ht - 6); g.fillText(tr('last turn'), W - 30, Ht - 6);
  }
  const legend = h('div', { class: 'row small', style: 'gap:12px' }, lines.map(([name, col]) => h('span', null, h('span', { class: 'tag', style: 'background:' + col }), ' ', name)));
  // demand ranking: how many units the cities wanted last month, and how much of it shops actually sold
  const dem = PRODUCT_LIST.filter(p => p.kind === 'consumer').map(p => { const a = H[p.id]; return { p, d: a?.d[a.d.length - 1] ?? 0, s: a?.l[a.l.length - 1] ?? 0, idx: v.market[p.id].demand }; }).sort((a, b) => b.d - a.d);
  const mx = Math.max(1, ...dem.map(x => x.d));
  const bars = h('table', { class: 'pielegend', style: 'width:100%' }, dem.map(x => h('tr', { class: 'clickable' + (mFilter === x.p.id ? ' sel' : ''), onclick: () => { mFilter = mFilter === x.p.id ? '' : x.p.id; S.render(); } },
    h('td', null, x.p.name), h('td', { style: 'width:55%' }, h('div', { style: 'height:10px;background:#f0d9a8;position:relative' }, h('div', { style: `height:100%;width:${Math.round(x.s / mx * 100)}%;background:#1f4e8c` }), h('div', { style: `position:absolute;top:0;right:${100 - Math.round(x.d / mx * 100)}%;width:0` }))),
    h('td', { class: 'num' }, num(x.d)), h('td', { class: 'num muted' }, x.d ? Math.round(x.s / x.d * 100) + '% sold' : '–'))));
  return h('div', { class: 'row', style: 'align-items:flex-start;gap:10px' },
    h('div', { class: 'panel', style: 'flex:none' }, h('h2', null, 'Units sold over time — ' + (sel ? PRODUCTS[sel].name : 'all products')), cv, legend),
    h('div', { class: 'panel grow', style: 'min-width:320px' }, h('h2', null, 'Demand by product'), bars, h('div', { class: 'note' }, 'Units the cities wanted last month (light bar) and the share local shops sold (dark bar). A low "sold" share means unmet demand: room for new sellers.')));
}
/** Right-hand list for the selected product: every facility that sells it (shops with it on the shelves, factories selling to everyone). */
function sellersPanel(): HTMLElement | null {
  if (!mFilter) return null; const v = S.view!, p = mFilter;
  const rows = offersOf(p); type Row = typeof rows[number];
  const go = (r: Row) => { if (r.idx < 0) return; S.city = r.city; S.sel = r.idx; S.buildingId = v.buildings.some(x => x.id === r.id) ? r.id : null; S.tab = 'map'; focusTile(r.idx, 14); S.render(); };
  return h('div', { class: 'panel', 'data-keep': 'sellers', style: 'flex:none;max-height:360px;overflow:auto' }, productCard(p, 400), h('h2', { style: 'margin-top:10px' }, 'Selling ' + PRODUCTS[p].name + ' (' + rows.length + ')'),
    h('table', null, h('thead', null, h('tr', null, ['Seller', 'Type', 'City', 'Price', 'Q'].map((x, i) => h('th', { class: i > 2 ? 'num' : '' }, x)))),
      h('tbody', null, rows.length ? rows.map(r => h('tr', { class: 'clickable', title: 'Show on the map', onclick: () => go(r) }, h('td', null, h('span', { class: 'tag', style: 'background:' + companyOf(r.owner)?.color }), ' ', companyOf(r.owner)?.name, r.owner === v.me.id ? ' (you)' : ''), h('td', null, r.kind), h('td', null, v.cities[r.city].name), h('td', { class: 'num' }, money2(r.price)), h('td', { class: 'num' }, r.q)))
        : h('tr', null, h('td', { colSpan: 5, class: 'muted' }, 'Nobody sells it right now.')))));
}
export function marketScreen(): HTMLElement {
  const v = S.view!;
  const prodTable = h('table', null, h('thead', null, h('tr', null, ['Product', 'Type', 'Market index', 'Reference price', 'Import price', 'Retail ref.', 'Demand idx', 'My tech', 'My brand'].map((x, i) => h('th', { class: i > 1 ? 'num' : '' }, x)))),
    h('tbody', null, twoGroups(PRODUCT_LIST.filter(matchesSearch), producedOnMap(), 9, p => { const m = v.market[p.id]; return h('tr', { class: 'clickable' + (mFilter === p.id ? ' sel' : ''), onclick: () => { mFilter = mFilter === p.id ? '' : p.id; S.render(); } },
      h('td', null, prodImg(p.id, 34, 22, 'margin-right:6px'), p.name), h('td', null, p.kind),
      h('td', { class: 'num ' + (m.idx > 1.05 ? 'bad' : m.idx < 0.95 ? 'good' : '') }, m.idx.toFixed(2)), h('td', { class: 'num' }, money2(p.basePrice * m.idx)), h('td', { class: 'num' }, money2(m.importPrice)),
      h('td', { class: 'num' }, p.kind === 'consumer' ? money2(m.retail) : '–'), h('td', { class: 'num' }, p.kind === 'consumer' ? m.demand.toFixed(2) : '–'),
      h('td', { class: 'num' }, v.me.tech[p.id].toFixed(0)), h('td', { class: 'num' }, v.me.brand[p.id].toFixed(0))); }, ['Produced on the map', 'somebody makes it right now'], ['Not produced yet', 'import it or build the first factory']) ));
  const ls = v.listings.filter(l => !mFilter || l.product === mFilter).sort((a, b) => a.product.localeCompare(b.product) || a.price - b.price);
  const listTable = h('table', null, h('thead', null, h('tr', null, ['Product', 'Seller', 'City', 'Price', 'Quality', 'Available'].map((x, i) => h('th', { class: i > 2 ? 'num' : '' }, x)))),
    h('tbody', null, ls.length ? ls.map(l => h('tr', { class: 'clickable', title: 'Show on the map', onclick: () => { const id = l.building.split('#')[0]; const b = v.buildings.find(x => x.id === id) ?? v.others.find(x => x.id === id); if (!b) return; S.city = b.city; S.sel = b.idx; S.buildingId = v.buildings.some(x => x.id === id) ? id : null; S.tab = 'map'; focusTile(b.idx, 14); S.render(); } }, h('td', null, PRODUCTS[l.product].name), h('td', null, h('span', { class: 'tag', style: 'background:' + companyOf(l.company)?.color }), companyOf(l.company)?.name, l.company === v.me.id ? ' (you)' : ''),
      h('td', null, v.cities[l.city].name), h('td', { class: 'num' }, money2(l.price)), h('td', { class: 'num' }, l.q), h('td', { class: 'num' }, num(l.qty)))) : h('tr', null, h('td', { colSpan: 6, class: 'muted' }, 'No factory is selling to everyone right now. Import through a harbour instead (+35%).'))));
  return h('div', { class: 'col' }, h('div', { class: 'row', style: 'align-items:flex-start;gap:10px' }, h('div', { class: 'panel grow', style: 'min-width:0' }, h('h2', null, 'Local market — commodity & goods'), prodTable, h('div', { class: 'note' }, 'Click a product to filter listings. Reference price = production-cost based; harbours import at the import price (quality 35) but you must pick a harbour or factory as the source of every input and shelf.')), h('div', { class: 'col', style: 'flex:none;width:420px;gap:10px' }, sellersPanel(), salesPie('local'))),
    trendPanels(),
    h('div', { class: 'panel' }, h('h2', null, 'Factories selling to everyone ' + (mFilter ? '— ' + PRODUCTS[mFilter].name : '')), listTable),
    h('div', { class: 'panel' }, h('h2', null, 'Harbours — imported goods in stock'), harbourTable()));
}

// ---------- World market
export function worldScreen(): HTMLElement {
  const v = S.view!;
  const mine = (p: ProductId) => v.buildings.reduce((n, b) => n + (b.product === p && b.world ? 1 : 0) + (b.layout ?? []).filter(c => c.m === 'export' && c.world && c.product === p).length, 0);
  const row = (p: typeof PRODUCT_LIST[number]) => {
    const m = v.market[p.id], wp = worldPrice(v as any, p.id), vol = worldVolume(p.id), sold = m.worldSold ?? 0, fill = Math.min(1, sold / vol), ref = p.basePrice * m.idx;
    return h('tr', { class: 'clickable' + (mFilter === p.id ? ' sel' : ''), onclick: () => { mFilter = mFilter === p.id ? '' : p.id; S.render(); } },
      h('td', null, prodImg(p.id, 34, 22, 'margin-right:6px'), p.name), h('td', null, p.kind),
      h('td', { class: 'num' }, money2(ref)), h('td', { class: 'num good' }, money2(wp)), h('td', { class: 'num muted' }, money2(wp * (1 - WORLD_DROP))),
      h('td', { class: 'num' }, money2(m.importPrice)),
      h('td', null, h('div', { style: 'width:110px;height:9px;background:#d8d3c0;display:inline-block;vertical-align:middle' }, h('div', { style: 'height:100%;width:' + Math.round(fill * 100) + '%;background:' + (fill > 0.7 ? '#b3261e' : '#4a8f3f') })), ' ', num(sold) + ' / ' + num(vol) + ' ' + p.unit),
      h('td', { class: 'num' }, mine(p.id) || '–'));
  };
  const rows = twoGroups(PRODUCT_LIST.filter(matchesSearch), importedGoods(), 8, row, ['Being imported', 'the harbours have it in stock'], ['Not imported', 'no harbour stocks it']);
  return h('div', { class: 'col' }, h('div', { class: 'row', style: 'align-items:flex-start;gap:10px' }, h('div', { class: 'panel grow', style: 'min-width:0' }, h('h2', null, 'World market'),
    h('table', null, h('thead', null, h('tr', null, ['Product', 'Type', 'Reference', 'World price (empty)', 'World price (full)', 'Import price', 'Sold last month / monthly volume', 'My sellers'].map((x, i) => h('th', { class: i > 1 && i < 6 || i === 7 ? 'num' : '' }, x)))), h('tbody', null, rows)),
    h('div', { class: 'note' }, 'The world market buys leftover stock at ' + Math.round(worldPrice(v as any, 'grain') / (PRODUCTS.grain.basePrice * v.market.grain.idx) * 100) + '% of the reference price, scaled by quality. The more of a good that is dumped on it in a month, the lower the price falls (down to the "full" price). Switch it on per building (Production tab) or per export cell.')), salesPie('world')), trendPanels());
}

/** All harbours with their 4 goods. Used by the Market tab; also reused for the harbour panel on the map. */
export function harbourTable(cityIds?: number[]): HTMLElement {
  const v = S.view!; const ports = v.cities.filter(c => c.port && (!cityIds || cityIds.includes(c.id)));
  return h('table', null, h('thead', null, h('tr', null, ['Harbour', 'Good', 'In stock', 'Price / unit', 'Refreshes'].map((x, i) => h('th', { class: i > 1 ? 'num' : '' }, x)))),
    h('tbody', null, ports.flatMap(c => (c.harbour ?? []).map((g, i) => h('tr', null, h('td', null, i === 0 ? '⚓ ' + c.name : ''),
      h('td', null, prodImg(g.product, 30, 20, 'margin-right:6px'), PRODUCTS[g.product].name),
      h('td', { class: 'num' }, num(g.qty) + ' ' + PRODUCTS[g.product].unit), h('td', { class: 'num' }, money2(v.market[g.product].importPrice * g.mult)),
      h('td', { class: 'num muted' }, 'sold out or in ' + Math.max(0, 12 - (v.turn - g.since)) + ' mo'))))));
}

// ---------- Finance
export function financeScreen(): HTMLElement {
  const v = S.view!; const me = v.me; const L = me.ledger;
  const lines: [string, number][] = [['Revenue', L.revenue], ['Purchases', -L.purchases], ['Transport', -L.transport], ['Wages', -L.wages], ['Maintenance', -L.maint], ['Advertising', -L.ads], ['Interest', -L.interest], [me.taxBreak && me.taxBreak.until > v.turn ? `Tax (25%, −${Math.round(me.taxBreak.cut * 100)}% break)` : 'Tax (25%)', -L.tax]];
  const cv = crisp(h('canvas'), 640, 260);
  setTimeout(() => chart(cv), 0);
  return h('div', { class: 'grid2' },
    h('div', { class: 'col' },
      h('div', { class: 'panel' }, h('h2', null, 'Balance'), h('div', { class: 'kv' },
        h('label', null, 'Cash'), h('div', { class: cls(me.cash) }, money(me.cash)), h('label', null, 'Debt'), h('div', null, money(me.debt)),
        h('label', null, 'Net worth'), h('b', null, money(me.netWorth)), h('label', null, 'Credit limit'), h('div', null, money(me.maxDebt)),
        h('label', null, 'Overdraft allowed'), h('div', null, money(me.overdraftLimit)), h('label', null, 'Loss carry-forward'), h('div', null, money(me.lossCarry))),
        h('div', { class: 'note' }, 'Negative cash is charged 2%/month. If net worth stays negative for 3 months you go bankrupt. Each loan has its own interest rate and deadline.'),
        h('div', { class: 'note' }, 'Money is borrowed from lenders as contracts: see the credit offers and your obligations below.')),
      policyPanel(),
      obligationsPanel(),
      offersPanel(),
      h('div', { class: 'panel' }, h('h2', null, 'Last month income statement'),
        h('table', null, h('tbody', null, lines.map(([k, val]) => h('tr', null, h('td', null, k), h('td', { class: 'num ' + cls(val) }, money(val)))), h('tr', null, h('th', null, 'Profit'), h('th', { class: 'num ' + cls(L.profit) }, money(L.profit))))))),
    h('div', { class: 'panel' }, h('h2', null, 'History'), cv, h('div', { class: 'legend' }, h('span', null, h('i', { style: 'background:#1f4e8c' }), 'Net worth'), h('span', null, h('i', { style: 'background:#1c7c3a' }), 'Cash'), h('span', null, h('i', { style: 'background:#d98c00' }), 'Monthly profit'))));
}
// ---- loans: the obligations you signed, and the credit lenders offer
let polForm: { d: number; i: number; t: string } | null = null;
function policyPanel(): HTMLElement {
  const v = S.view!; const me = v.me; const pol = me.policy ?? { dividend: 0, invest: 0, target: 'facilities' as const };
  const mc = v.companies.find(c => c.id === me.id)!; const outside = mc.float + mc.held; const monthsLeft = 11 - (v.turn % 12);
  const profitYear = me.history.slice(-12).reduce((n, p) => n + p.profit, 0) + 0;
  const f = (polForm ??= { d: pol.dividend, i: pol.invest, t: pol.target as string });
  const dIn = h('input', { type: 'number', min: 0, max: 100, value: f.d, style: 'width:60px', onchange: () => { f.d = +dIn.value; S.render(); } }), iIn = h('input', { type: 'number', min: 0, max: 100, value: f.i, style: 'width:60px', onchange: () => { f.i = +iIn.value; S.render(); } });
  const tSel = h('select', { onchange: () => { f.t = tSel.value; } }, [['facilities', 'Modernise facilities (condition + asset value)'], ['rd', 'Research (tech of the goods you make)'], ['debt', 'Repay loans (highest rate first)']].map(([k, label]) => h('option', { value: k, selected: k === f.t }, label)));
  const ly = me.lastYear;
  return h('div', { class: 'panel' }, h('h2', null, 'Fiscal year-end policy'),
    h('div', { class: 'note' }, 'When the fiscal year closes (December, ' + (monthsLeft === 0 ? 'this turn' : 'in ' + monthsLeft + ' months') + ') your profit for the year ($' + Math.round(Math.max(0, profitYear)).toLocaleString('en-US') + ' so far) is split: dividends go to outside shareholders (' + (outside / mc.shares * 100).toFixed(0) + '% of your shares), part is invested, the rest stays as cash.'),
    h('div', { class: 'row' }, 'Dividends', dIn, '% · Invest', iIn, '% into', tSel, h('button', { class: 'primary', onclick: () => act({ type: 'setPolicy', dividend: +dIn.value, invest: +iIn.value, target: tSel.value as any }) }, 'Save')),
    h('div', { class: 'small muted' }, 'Kept as cash: ' + Math.max(0, 100 - (+dIn.value || 0) - (+iIn.value || 0)) + '%.' + (outside <= 0 ? ' No outside shareholders yet: issue shares in the Stock market tab, otherwise dividends are not paid.' : '')),
    ly ? h('div', { class: 'small' }, 'Last year: profit ' + money(ly.profit) + ' · dividends ' + money(ly.dividends) + ' · invested ' + money(ly.invested) + (ly.invested ? ' (' + ly.target + ')' : '')) : null);
}
const pctm = (r: number) => (r * 100).toFixed(2) + '% / mo';
const LOAN_DEFAULT = 'A missed payment costs a 3% fee. After three missed payments in a row the Lender seizes the pledged facilities (60% of their value) and restructures the rest at double interest.';
const repayText = (type: Lender['type'], per: number, amount: number, term: number): Kid[] => type === 'amortizing'
  ? ['The Borrower repays the principal in equal monthly instalments of ', h('b', null, money(per)), ', plus interest on what is still owed.']
  : ['The Borrower pays interest every month and repays the whole ', h('b', null, money(amount)), ' in month ', h('b', null, String(term)), '.'];
/** The loans you signed, as contracts. */
function obligationsPanel(): HTMLElement {
  const v = S.view!; const me = v.me; const loans = me.loans ?? []; const due = loans.map(loanDue); const tot = due.reduce((n, d) => n + d.interest + d.principal, 0);
  const items: FolderItem[] = loans.map((L, k) => { const l = LENDERS.find(x => x.id === L.lender)!; const left = L.startTurn + L.term - v.turn; const rate = L.rate * (L.defaulted ? 2 : 1);
    return { key: 'loan:' + L.id, title: 'Loan agreement', attention: !!L.late || left <= 1,
      status: L.defaulted ? { text: 'restructured', cls: 'bad' } : L.late ? { text: L.late + '/3 missed', cls: 'bad' } : left <= 1 ? { text: left > 0 ? 'due next month' : 'overdue', cls: 'warn' } : { text: left + ' mo left', cls: 'ok' },
      headline: [h('b', null, money(L.principal)), ' owed to ', h('b', null, l.name), ' · ', pctm(rate), ' · ', money(due[k].interest + due[k].principal), ' this month'],
      doc: () => contractDoc({ title: 'Loan agreement', no: L.id.toUpperCase(), turn: L.startTurn,
        me: { name: me.name, seed: me.id, signed: true, role: 'the Borrower' }, other: { name: l.name, seed: 'lender:' + l.id, signed: true, role: 'the Lender' },
        clauses: [
          ['The Lender lends the Borrower ', h('b', null, money(L.original)), '.'],
          repayText(L.type, L.installment, L.original, L.term),
          ['Interest: ', h('b', null, pctm(L.rate)), ' on the amount still owed', L.defaulted ? h('span', { class: 'bad' }, ' (doubled after the default: ' + pctm(rate) + ')') : null, '.'],
          ['This agreement runs for ', h('b', null, L.term + ' months'), ', until ', h('b', null, dateOfTurn(L.startTurn + L.term)), '.'],
          L.collateral.length ? ['The Borrower pledges as collateral: ', h('b', null, L.collateral.map(id => v.buildings.find(b => b.id === id)?.name ?? id).join(', ')), '.'] : ['No collateral is pledged.'],
          [LOAN_DEFAULT],
        ],
        foot: h('span', null, 'Still owed: ', h('b', null, money(L.principal)), ' · due this month: ', h('b', null, money(due[k].interest + due[k].principal)), ' (interest ' + money(due[k].interest) + (due[k].principal ? ' + principal ' + money(due[k].principal) : '') + ')', L.late ? h('span', { class: 'bad' }, ' · ' + L.late + '/3 payments missed') : null),
        actions: [h('button', { onclick: () => act({ type: 'repayLoan', id: L.id, amount: L.principal }) }, 'Repay all'), h('button', { onclick: () => { const x = prompt('Repay how much early? (max ' + L.principal + ')', String(Math.min(L.principal, Math.max(0, Math.floor(me.cash))))); if (x) act({ type: 'repayLoan', id: L.id, amount: +x }); } }, 'Repay part…')] }) }; });
  return h('div', { class: 'panel' }, h('h2', null, 'Your obligations'),
    loans.length ? h('div', { class: 'note' }, 'Due at the end of this turn: ', h('b', null, money(tot)), ' (interest + principal). Missing a payment costs a 3% fee; after 3 misses in a row the lender seizes the pledged facilities (60% of their value) and restructures the rest at double interest.') : null,
    contractFolder(items, 'You owe nothing. Pick a credit offer below to borrow.'));
}
const offerForm: Record<string, { amount: number; term: number; col: Set<string> }> = {};
let loanOpen: string | null = null, loanAnim = false;
/** What a lender would lend right now with the pledged facilities, at what rate. */
function offerTerms(l: Lender) {
  const v = S.view!; const me = v.me; const full = (me.loans ?? []).length >= MAX_LOANS;
  const f = offerForm[l.id] ??= { amount: 0, term: l.terms[Math.floor(l.terms.length / 2)], col: new Set<string>() };
  const myB = v.buildings.filter(b => !pledgedTo(me, b.id));
  for (const id of [...f.col]) if (!myB.some(b => b.id === id)) f.col.delete(id);
  const pledged = [...f.col].reduce((n, id) => n + collateralValue(v.buildings.find(b => b.id === id)!), 0);
  const secured = f.col.size > 0 && l.collateral !== 'none';
  const owed = (me.loans ?? []).filter(x => x.lender === l.id).reduce((n, x) => n + x.principal, 0);
  const unsec = l.collateral === 'required' ? 0 : l.base + l.nwFrac * Math.max(0, me.netWorth + me.debt);
  const max = Math.max(0, Math.floor(Math.min(unsec + (secured ? l.ltv * pledged : 0) - owed, Math.max(0, me.maxDebt + 0.7 * pledged - me.debt)) / 1000) * 1000);
  const rate = secured ? l.securedRate : l.rate;
  if (f.amount <= 0 || f.amount > max) f.amount = Math.max(0, Math.min(max, Math.max(l.min, f.amount || Math.round(max / 2 / 1000) * 1000)));
  const per = l.type === 'amortizing' ? Math.ceil(f.amount / f.term) : 0, int0 = f.amount * rate;
  const total = l.type === 'amortizing' ? int0 * (f.term + 1) / 2 : int0 * f.term;
  return { f, myB, max, rate, secured, per, int0, total, full, ok: !full && max >= l.min && f.amount >= l.min && f.amount <= max };
}
/** A lender's offer as a contract to fill in: the Lender has signed; you choose amount, term and collateral and sign. */
function loanDraft(l: Lender): HTMLElement {
  const v = S.view!; const me = v.me; const o = offerTerms(l); const f = o.f;
  const close = () => { loanOpen = null; S.render(); };
  const amount = h('input', { class: 'cfield', type: 'number', value: f.amount, step: 10000, min: l.min, max: o.max, style: 'width:110px', oninput: (e: Event) => { f.amount = +(e.target as HTMLInputElement).value; }, onchange: () => S.render() });
  const term = h('select', { class: 'cfield', onchange: (e: Event) => { f.term = +(e.target as HTMLSelectElement).value; S.render(); } }, l.terms.map(m => h('option', { value: m, selected: m === f.term }, String(m))));
  const col: Kid[] = l.collateral === 'none' ? ['The Lender accepts no collateral.'] : !o.myB.length ? [l.collateral === 'required' ? 'Collateral is required, but you have no free facilities to pledge.' : 'No collateral is pledged (you have no free facilities).']
    : [l.collateral === 'required' ? 'The Borrower pledges as collateral (required):' : 'The Borrower may pledge facilities as collateral, for more credit and a lower rate:',
      h('div', { class: 'cpledge' }, o.myB.map(b => h('label', null, h('input', { type: 'checkbox', checked: f.col.has(b.id), onchange: (e: Event) => { (e.target as HTMLInputElement).checked ? f.col.add(b.id) : f.col.delete(b.id); S.render(); } }), ' ' + b.name + ' · value ' + money(collateralValue(b)))))];
  const sign = () => act({ type: 'takeLoan', lender: l.id, amount: f.amount, term: f.term, collateral: [...f.col] }).then(r => { if (r) { f.col.clear(); f.amount = 0; loanOpen = null; S.render(); } });
  const doc = contractDoc({ title: 'Loan agreement', no: 'OFFER', turn: v.turn,
    me: { name: me.name, seed: me.id, signed: false, role: 'the Borrower' }, other: { name: l.name, seed: 'lender:' + l.id, signed: true, role: 'the Lender' },
    intro: [h('div', { class: 'cfoot' }, l.blurb)],
    clauses: [
      ['The Lender lends the Borrower $', amount, ' (available now: ', h('b', null, o.max >= l.min ? money(o.max) : 'nothing'), ', minimum ' + money(l.min) + ').'],
      repayText(l.type, o.per, f.amount, f.term),
      ['Interest: ', h('b', { class: o.secured ? 'good' : '' }, pctm(o.rate) + (o.secured ? ' (secured)' : '')), ' on the amount still owed.'],
      ['This agreement runs for ', term, ' months.'],
      col,
      [LOAN_DEFAULT],
    ],
    foot: l.type === 'amortizing' ? 'First month: ' + money(o.per + o.int0) + ' (' + money(o.per) + ' principal + ' + money(o.int0) + ' interest) · total interest about ' + money(o.total) + '.' : 'Monthly interest ' + money(o.int0) + ' · total interest about ' + money(o.total) + '.',
    actions: [h('button', { class: 'primary', disabled: !o.ok, title: o.full ? 'You already have ' + MAX_LOANS + ' open loans' : undefined, onclick: sign }, '✒ Sign the loan'), h('button', { onclick: close }, 'Not now')] });
  const ov = docOverlay(doc, close, loanAnim); loanAnim = false; return ov;
}
function offersPanel(): HTMLElement {
  const v = S.view!; const me = v.me; const full = (me.loans ?? []).length >= MAX_LOANS;
  const items: FolderItem[] = LENDERS.map(l => { const o = offerTerms(l);
    return { key: 'lo:' + l.id, title: 'Credit offer', open: () => { loanOpen = l.id; loanAnim = true; S.render(); },
      status: o.max >= l.min ? { text: 'up to ' + money(o.max), cls: 'ok' } : { text: l.collateral === 'required' ? 'needs collateral' : 'nothing available' },
      headline: [h('b', null, l.name), ' · ', pctm(l.rate), l.collateral !== 'none' ? ' (' + pctm(l.securedRate) + ' secured)' : '', ' · ', l.terms[0] + '–' + l.terms[l.terms.length - 1] + ' mo · ', l.type === 'amortizing' ? 'instalments' : 'repay at the end'],
      doc: () => h('div') }; });
  const open = LENDERS.find(l => l.id === loanOpen);
  return h('div', { class: 'panel' }, h('h2', null, 'Credit offers'), full ? h('div', { class: 'bad small' }, 'You already have ' + MAX_LOANS + ' open loans.') : null,
    h('div', { class: 'note' }, 'Each lender has signed an offer. Open one, choose the amount, the term and any collateral, and sign it.'),
    contractFolder(items, ''), open ? loanDraft(open) : null);
}
function chart(cv: HTMLCanvasElement) {
  const hist = S.view!.me.history; const g = cv.getContext('2d')!; g.clearRect(0, 0, 640, 260); g.fillStyle = '#fff'; g.fillRect(0, 0, 640, 260);
  if (hist.length < 2) { g.fillStyle = '#777'; g.font = '14px system-ui'; g.fillText(tr('Play a few turns to see history.'), 20, 30); return; }
  const series: [keyof typeof hist[0], string][] = [['netWorth', '#1f4e8c'], ['cash', '#1c7c3a'], ['profit', '#d98c00']];
  const all = hist.flatMap(p => series.map(([k]) => p[k] as number)); const lo = Math.min(0, ...all), hi = Math.max(1, ...all);
  const X = (i: number) => 60 + i / (hist.length - 1) * (640 - 80), Y = (val: number) => 260 - 25 - (val - lo) / (hi - lo) * (260 - 45);
  g.strokeStyle = '#ddd'; g.fillStyle = '#666'; g.font = '11px system-ui'; g.textAlign = 'right';
  for (let i = 0; i <= 4; i++) { const val = lo + (hi - lo) * i / 4; g.beginPath(); g.moveTo(60, Y(val)); g.lineTo(640 - 20, Y(val)); g.stroke(); g.fillText(Math.abs(val) >= 1e6 ? (val / 1e6).toFixed(1) + 'M' : Math.round(val / 1000) + 'k', 54, Y(val) + 4); }
  for (const [k, col] of series) { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); hist.forEach((p, i) => i ? g.lineTo(X(i), Y(p[k] as number)) : g.moveTo(X(i), Y(p[k] as number))); g.stroke(); }
  g.textAlign = 'center'; g.fillStyle = '#666'; g.fillText(tr('turn ') + hist[0].turn, 60, 260 - 8); g.fillText(tr('turn ') + hist[hist.length - 1].turn, 640 - 30, 260 - 8);
}

// ---------- Marketing

// ---------- Competitors: ranking, company profile, contracts and mail
let rankSel = '';
export function rankingsScreen(): HTMLElement {
  const v = S.view!; const rows = [...v.companies].sort((a, b) => Number(a.bankrupt) - Number(b.bankrupt) || b.netWorth - a.netWorth);
  if (!rows.some(c => c.id === rankSel)) rankSel = rows.find(c => c.id !== v.me.id && unreadFrom(c.id) > 0)?.id ?? rows.find(c => c.id !== v.me.id)?.id ?? v.me.id; // first visit: whoever wrote to you, else the leader
  const table = h('div', { class: 'panel' }, h('h2', null, 'Competitors'), h('table', null, h('thead', null, h('tr', null, ['#', '', 'Company', 'Type', 'Net worth', 'Buildings', 'Status'].map((x, i) => h('th', { class: i === 4 || i === 5 ? 'num' : '' }, x)))),
    h('tbody', null, rows.map((c, i) => h('tr', { class: 'clickable' + (c.id === rankSel ? ' sel' : ''), title: 'Show this company', onclick: () => { rankSel = c.id; S.render(); } }, h('td', null, i + 1), h('td', null, personImg(c.portrait, 30, 'border:2px solid ' + c.color)),
      h('td', null, c.name, c.id === v.me.id ? h('span', { class: 'muted' }, ' (you)') : null, unreadFrom(c.id) > 0 ? h('span', { class: 'badge', title: 'Unread messages' }, '✉ ' + unreadFrom(c.id)) : null), h('td', null, c.isAI ? 'AI' : 'Player'), h('td', { class: 'num' }, money(c.netWorth)), h('td', { class: 'num' }, c.buildings),
      h('td', null, c.bankrupt ? h('span', { class: 'bad' }, 'bankrupt') : c.isAI ? '' : c.ready ? h('span', { class: 'good' }, 'ready') : c.online ? 'planning…' : h('span', { class: 'muted' }, 'offline')))))),
    h('div', { class: 'note' }, v.settings.targetNetWorth > 0 ? 'Goal: first to ' + money(v.settings.targetNetWorth) + ' net worth, or richest after ' + v.settings.maxMonths + ' months.' : 'Richest company after ' + v.settings.maxMonths + ' months wins.'));
  return h('div', { class: 'grid2' }, table, companyCard(rankSel, rows.findIndex(c => c.id === rankSel) + 1));
}
/** What is publicly known about a company: what it sells, its facilities, its stock and the contracts it has with you. */
function companyCard(id: string, rank: number): HTMLElement {
  const v = S.view!; const c = v.companies.find(x => x.id === id)!; const isMe = id === v.me.id;
  const bs: { type: string; super?: boolean; product: ProductId | null; city: number; sells?: { product: ProductId; price: number; q: number }[] }[] = isMe
    ? v.buildings.map(b => ({ type: b.type, super: b.super, product: b.product, city: b.city, sells: b.type === 'store' ? b.slots.filter(x => x.product && x.stock.qty >= 0.5).map(x => ({ product: x.product!, price: x.price, q: Math.round(x.stock.q) })) : undefined }))
    : v.others.filter(o => o.owner === id);
  // facilities by kind
  const kinds = new Map<string, number>(); for (const b of bs) { const n = defOf(b as any).name; kinds.set(n, (kinds.get(n) ?? 0) + 1); }
  const cities = new Set(bs.map(b => b.city));
  // products: units sold last month, shelf prices, what its factories make
  const sold = PRODUCT_LIST.map(p => ({ p, n: (v.sales.local[p.id]?.[id] ?? 0) + (v.sales.world[p.id]?.[id] ?? 0) })).filter(x => x.n >= 0.5).sort((a, b) => b.n - a.n);
  const shelf = new Map<ProductId, number[]>(); for (const b of bs) for (const x of b.sells ?? []) shelf.set(x.product, [...(shelf.get(x.product) ?? []), x.price]);
  const made = new Set(bs.filter(b => b.product && b.type !== 'store' && b.type !== 'rd').map(b => b.product!));
  const products = [...new Set([...sold.map(x => x.p.id), ...shelf.keys(), ...made])];
  const prodRows = products.map(p => { const pr = shelf.get(p); const n = sold.find(x => x.p.id === p)?.n ?? 0;
    return h('tr', null, h('td', null, PRODUCTS[p].name), h('td', null, [made.has(p) ? 'makes' : '', pr ? 'sells in shops' : ''].filter(Boolean).join(' · ') || 'sells'), h('td', { class: 'num' }, pr ? money2(Math.min(...pr)) + (pr.length > 1 && Math.max(...pr) > Math.min(...pr) + 0.005 ? '–' + money2(Math.max(...pr)) : '') : '–'), h('td', { class: 'num' }, n ? num(Math.round(n)) : '–')); });
  const mineHeld = v.me.portfolio?.[id] ?? 0; const myCo = v.companies.find(x => x.id === v.me.id)!; const theirs = myCo.holders.find(x => x.id === id)?.qty ?? 0; // their stake in me
  const deals = isMe ? [] : v.contracts.filter(k => k.seller === id || k.buyer === id || k.proposer === id || k.to === id);
  return h('div', { class: 'col', style: 'gap:10px' },
    h('div', { class: 'panel col' },
      h('div', { class: 'row', style: 'gap:12px;align-items:center' }, personImg(c.portrait, 56, 'border:3px solid ' + c.color),
        h('div', null, h('h2', { style: 'margin:0' }, c.name, isMe ? h('span', { class: 'muted' }, ' (you)') : null), h('div', { class: 'muted small' }, '#' + rank + ' · ' + (c.isAI ? 'AI company' : 'Player') + (c.bankrupt ? ' · bankrupt' : '')))),
      h('div', { class: 'kv' }, h('label', null, 'Net worth'), h('b', null, money(c.netWorth)), h('label', null, 'Share price'), h('div', null, money2(c.price) + ' · market cap ' + money(c.price * c.shares)),
        h('label', null, 'Facilities'), h('div', null, h('b', null, String(bs.length)), bs.length ? ' in ' + cities.size + (cities.size === 1 ? ' city' : ' cities') + ': ' + [...kinds].map(([k, n]) => n + ' ' + k.toLowerCase()).join(', ') : ''),
        !isMe ? h('label', null, 'Your stake') : null, !isMe ? h('div', null, mineHeld ? num(mineHeld) + ' shares (' + (mineHeld / c.shares * 100).toFixed(1) + '%)' : 'none', theirs ? h('span', { class: theirs / myCo.shares > 0.3 ? 'bad' : '' }, ' · they hold ' + (theirs / myCo.shares * 100).toFixed(1) + '% of yours') : null) : null),
      !isMe && !c.bankrupt ? h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' },
        h('button', { onclick: () => openEditor({ to: id }) }, '✎ Propose a contract'),
        h('button', { onclick: () => { S.tab = 'stocks'; S.render(); } }, 'Stock market')) : null),
    h('div', { class: 'panel col' }, h('h2', null, 'Products'),
      products.length ? h('table', null, h('thead', null, h('tr', null, ['Product', '', 'Shelf price', 'Sold last month'].map((x, i) => h('th', { class: i > 1 ? 'num' : '' }, x)))), h('tbody', null, prodRows)) : h('div', { class: 'muted' }, 'Nothing on sale yet.')),
    !isMe ? h('div', { class: 'panel col' }, h('h2', null, 'Contracts with you'), contractFolder(deals.map(contractItem), 'No contracts with ' + c.name + (c.name.endsWith('.') ? '' : '.'))) : null,
    !isMe ? conversationPanel(id) : null);
}

// ---------- News
