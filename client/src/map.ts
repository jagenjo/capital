// Map screen: four areas like the original game
//   top-left: world view (minimap)      top-right: zoom view
//   bottom-left: selected tile stats    bottom-right: selected tile configuration
import { BUILDINGS, TERRAIN_INFO, PRODUCTS, PRODUCT_LIST, WORLD_SCALE, type ProductId, type Terrain, type BuildingType } from '../../shared/data.js';
import { facImg } from './prodimg.js';
import { rivalProducts, suppliesBox } from './prodcard.js';
import { BUILD_TAX } from '../../shared/data.js';
import { gridPrice, lotPrice, quoteBuild, terrainAt, isUnlocked, subsidyText, gridFor, GRID_COST } from '../../shared/engine.js';
import { nearestCity } from '../../shared/world.js';
import { h, money, num, asset, toast } from './util.js';
import { S, act, companyOf } from './state.js';
import { buildingPanel, areaLine } from './building.js';
import { worldPanels, focusCity, setViewSize } from './worldmap.js';
import { statsPanel, citiesPanel } from './tilestats.js';
import { harbourTable } from './tabs.js';
import { askPrice, newPrice, vacantName, buy, mallRentPanel, showOffer } from './realestate.js';
import { bid, bidInput, orderToast } from './desk.js';

const buildChoice: { product: ProductId | null; grid?: number } = { product: null };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export const TOPBAR_H = 54, NAV_H = 36, PAD = 8;

/** Where the centre of the four-panel layout sits, as a share of the width / height (null = automatic). Drag the centre to change it; stored in this browser. */
const split: { x: number | null; y: number | null } = (() => { try { return { x: null, y: null, ...JSON.parse(localStorage.getItem('capital.split') ?? '{}') }; } catch { return { x: null, y: null }; } })();
let drag: { axis: 'x' | 'y' | 'both'; availW: number; availH: number; gap: number } | null = null, dragFrame = 0;
const saveSplit = () => localStorage.setItem('capital.split', JSON.stringify(split));
window.addEventListener('mousemove', e => {
  if (!drag) return; const q = document.querySelector('.quad') as HTMLElement | null; if (!q) return; const r = q.getBoundingClientRect();
  if (drag.axis !== 'y') split.x = clamp((e.clientX - r.left) / drag.availW, 0.2, 0.8);
  if (drag.axis !== 'x') split.y = clamp((e.clientY - r.top) / drag.availH, 0.2, 0.8);
  if (!dragFrame) dragFrame = requestAnimationFrame(() => { dragFrame = 0; S.render(); });
});
window.addEventListener('mouseup', () => { if (drag) { drag = null; saveSplit(); document.body.style.cursor = ''; } });

export function mapScreen(): HTMLElement {
  const gap = 6;
  const availW = Math.max(900, window.innerWidth - 2 * PAD), availH = Math.max(520, window.innerHeight - TOPBAR_H - NAV_H - 2 * PAD - (S.view?.finished || S.view?.me.bankrupt ? 32 : 0));
  const topH = split.y != null ? clamp(Math.round(availH * split.y - gap / 2), 160, availH - gap - 160) : Math.floor((availH - gap) * 0.54), botH = availH - gap - topH;
  const wd = S.world; const aspect = wd ? wd.w / wd.h : 1.67;
  const LW = split.x != null ? clamp(Math.round(availW * split.x - gap / 2), 240, availW - gap - 300) : clamp(Math.round(topH * aspect), 360, Math.floor(availW * 0.44)), RW = availW - LW - gap;
  setViewSize(RW - 4, topH - 4);
  const { mini, main } = worldPanels(LW - 4, topH - 4);
  // draggable dividers: the vertical one, the horizontal one, and the centre where they cross (moves both); double-click to go back to automatic
  const grip = (axis: 'x' | 'y' | 'both', style: string, cursor: string) => h('div', { class: 'quad-grip', title: 'Drag to resize the panels (double-click: reset)', style: style + ';cursor:' + cursor,
    onmousedown: (e: MouseEvent) => { e.preventDefault(); drag = { axis, availW, availH, gap }; document.body.style.cursor = cursor; },
    ondblclick: () => { split.x = split.y = null; saveSplit(); S.render(); } });
  return h('div', { class: 'quad', style: 'position:relative;grid-template-columns:' + LW + 'px ' + RW + 'px;grid-template-rows:' + topH + 'px ' + botH + 'px;gap:' + gap + 'px' },
    mini, main, statsPanel(), configPanel(),
    grip('x', `left:${LW - 4}px;top:0;width:${gap + 8}px;height:100%`, 'col-resize'), grip('y', `top:${topH - 4}px;left:0;height:${gap + 8}px;width:100%`, 'row-resize'),
    grip('both', `left:${LW - 8}px;top:${topH - 8}px;width:${gap + 16}px;height:${gap + 16}px;z-index:3`, 'move'));
}

function configPanel(): HTMLElement {
  const v = S.view!; const wd = S.world;
  let body: HTMLElement;
  if (!wd) body = h('div', null, 'Loading…');
  else if (S.sel == null) {
    body = h('div', { class: 'cfg scroll' },
      h('div', { class: 'row', style: 'align-items:flex-start;flex-wrap:nowrap;gap:14px' },
        h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'chartlabel' }, 'How to play'),
          h('p', { style: 'margin:6px 0' }, 'Click a tile in the zoom view. Buy land, then build farms (farmland), logging camps (forest), mines (ore deposits), oil wells (oil fields), and factories, stores and labs in or near cities.'),
          h('p', { class: 'note' }, 'A building belongs to its nearest city (labour, wages, customers). Everything is executed when the month turns: set staffing, prices and suppliers, then press "End turn".')),
        h('div', { style: 'flex:1;min-width:0' }, citiesPanel(id => { S.city = id; S.sel = null; S.buildingId = null; focusCity(id); S.render(); }))));
  } else {
    const b = v.buildings.find(x => x.id === S.buildingId && x.idx === S.sel) ?? v.buildings.find(x => x.idx === S.sel && !x.mall);
    body = b ? buildingPanel(b) : lotPanel(S.sel);
  }
  return h('div', { class: 'panel area cfgarea' }, body);
}

function harbourPanel(idx: number): HTMLElement {
  const v = S.view!, wd = S.world!; const x = idx % wd.w, y = Math.floor(idx / wd.w);
  const ports = v.cities.filter(c => c.port); let best = ports[0]; let bd = Infinity;
  for (const c of ports) { const d = Math.hypot(c.x / WORLD_SCALE - x, c.y / WORLD_SCALE - y); if (d < bd) { bd = d; best = c; } }
  return h('div', { class: 'cfg scroll col' }, h('div', { class: 'row' }, h('b', { style: 'font-size:15px' }, '⚓ ' + best.name + ' harbour'), h('span', { class: 'muted' }, 'goods are imported here and stored for up to a year')),
    harbourTable([best.id]),
    h('div', { class: 'note' }, 'A harbour holds 4 different goods. When one sells out, or has been stored for a year, it is replaced by another import good. Use "⚓ harbour" as the source of an import cell or a store shelf; you can only choose goods that are in stock.'));
}

/** A pending order on this tile / facility: what it is, and a button to cancel it. */
function pendingNote(o: { id: string; label: string; bid: number }): HTMLElement {
  return h('div', { class: 'note col', style: 'gap:4px' }, h('div', null, '📝 Pending order: ', h('b', null, o.label), o.bid ? ' (bid ' + money(o.bid) + ')' : '', ' — carried out when the month is played.'),
    h('div', null, h('button', { class: 'mini danger', onclick: () => act({ type: 'cancelOrder', id: o.id }) }, 'Cancel order')));
}
/** Clicking the town hall: the city's name, size and the incentives it offers right now. */
function cityHallPanel(idx: number): HTMLElement {
  const v = S.view!; const c = v.cities[nearestCity(v.cities, idx)]; const subs = v.subsidies.filter(x => x.city === c.id); const tb = v.me.taxBreak;
  return h('div', { class: 'cfg scroll col' }, h('h2', null, 'City hall · ' + c.name),
    h('div', { class: 'note' }, 'Population ' + num(c.pop) + ' · wealth ' + c.wealth.toFixed(2) + (c.port ? ' · port' : '')),
    h('div', { class: 'chartlabel' }, 'City incentives (' + subs.length + ')'),
    tb && tb.city === c.id ? h('div', { class: 'good' }, `Your tax break here: −${Math.round(tb.cut * 100)}% tax, until turn ${tb.until}.`) : null,
    subs.length ? h('table', null, h('thead', null, h('tr', null, ['Offer', 'Expires'].map(x => h('th', null, x)))), h('tbody', null, subs.map(x => h('tr', { class: 'clickable', title: 'Show this offer in Real estate', onclick: () => showOffer(x.id) }, h('td', null, subsidyText(x)), h('td', null, 'turn ' + x.expires)))))
      : h('div', { class: 'muted' }, 'This city offers no incentives right now.'),
    h('div', { class: 'note' }, 'Cities reward the first company to set up a kind of business in their area: a share of the land paid, or a tax cut for some months. Build normally: the reward is applied when the order is carried out.'),
    h('button', { onclick: () => { S.tab = 'realestate'; S.render(); } }, 'All incentives →'));
}
function lotPanel(idx: number): HTMLElement {
  const v = S.view!; const wd = S.world!;
  const t = terrainAt({ world: wd }, idx) as Terrain;
  if (t === 'h') return cityHallPanel(idx);
  if (t === 'p') return harbourPanel(idx); const lot = v.lots[String(idx)]; const other = v.others.find(o => o.idx === idx);
  const om = other && v.malls.find(m => m.id === other.id); if (om) return mallRentPanel(om);
  if (other) return h('div', { class: 'cfg scroll col' }, h('div', null, h('b', null, other.name)), h('div', null, 'Owned by ', h('b', null, companyOf(other.owner)?.name ?? '?')), rivalProducts(other), suppliesBox(other.id), h('div', { class: 'note' }, 'You can only configure your own buildings.'));
  if (lot && lot.owner !== v.me.id) return h('div', { class: 'cfg scroll col' }, h('div', null, 'Owned by ', h('b', null, companyOf(lot.owner)?.name ?? '?')));
  const vac = v.vacant.find(x => x.idx === idx);
  if (vac) return h('div', { class: 'cfg scroll col' }, h('div', { class: 'row' }, h('b', { style: 'font-size:15px' }, '🏷 For sale: ' + vacantName(vac)), h('span', { class: 'muted' }, vac.origin === 'bankrupt' ? 'liquidated company' : vac.origin === 'closure' ? 'owner closed down' : 'estate sale')),
    h('div', null, 'Condition ' + vac.cond + '% · empty, no stock, no staff · land ' + money(vac.land) + ' + building ' + money(vac.build)),
    h('div', { class: 'note' }, 'Building new would cost ' + money(newPrice(vac)) + ' — you save ' + money(newPrice(vac) - askPrice(vac)) + ' (' + Math.round((1 - askPrice(vac) / newPrice(vac)) * 100) + '%).'),
    (() => { const o = v.orders.find(x => x.action.type === 'buyVacant' && (x.action as { id?: string }).id === vac.id); return o ? pendingNote(o) : h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => buy(vac) }, 'Order for ' + money(askPrice(vac))), bidInput()); })());
  const price = lot ? 0 : lotPrice({ cities: v.cities, world: wd }, idx);
  const opts = Object.values(BUILDINGS).filter(d => d.terrain.includes(t));
  const factProduct = h('select', null, PRODUCT_LIST.filter(p => p.kind !== 'raw').map(p => h('option', { value: p.id, selected: p.id === (buildChoice.product ?? 'bread'), disabled: !isUnlocked(v.me, p.id) }, (isUnlocked(v.me, p.id) ? '' : '🔒 ') + p.name)));
  factProduct.addEventListener('change', () => { buildChoice.product = factProduct.value as ProductId; });
  const rawProduct = h('select', null, BUILDINGS.farm.products!.map(p => h('option', { value: p }, PRODUCTS[p as ProductId].name)));
  const cityId = nearestCity(v.cities, idx);
  const cands = [...v.buildings.filter(b => b.type === 'factory' && b.product === 'buildings' && !b.building && b.stock.qty >= 1).map(b => ({ id: b.id, owner: b.owner, price: b.listPrice ?? Infinity, qty: Math.floor(b.stock.qty) })),
    ...v.listings.filter(l => l.product === 'buildings' && l.company !== v.me.id).map(l => ({ id: l.building, owner: l.company, price: l.price, qty: l.qty }))];
  const free = t !== 'u' && t !== 'l'; // the layout size can be chosen: 2x2 or 3x3 in a suburb or town, 2x2 to 4x4 on open land (the bigger the pricier)
  const subur = t === 's' || t === 'w'; const gridDef = subur ? Math.min(buildChoice.grid ?? 3, 3) : buildChoice.grid ?? 4;
  const gridSel = h('select', null, (subur ? [2, 3] : [2, 3, 4]).map(n => h('option', { value: String(n), selected: n === gridDef }, `${n}×${n} cells · ${Math.round(gridPrice(t, n) * 100)}% of the price`)));
  gridSel.addEventListener('change', () => { buildChoice.grid = +gridSel.value; S.render(); });
  const gridOf = (d: { type: string }) => d.type !== 'factory' ? 1 : free ? gridPrice(t, +gridSel.value) : 1;
  const quote = (d: { cost: number; type?: string }) => quoteBuild(v.market.buildings.idx, v.me.id, Math.round(d.cost * gridOf(d as { type: string })), cands);
  const taxOf = (d: { cost: number; type?: string }) => Math.round((price + quote(d).cost) * BUILD_TAX);
  const totalOf = (d: { cost: number; type?: string }) => price + quote(d).cost + taxOf(d);
  /** The price tag of a building: land, the construction of the installation, the city's tax, and the total. */
  const costLines = (d: { cost: number; type?: string }) => h('div', { class: 'costlines' }, h('span', null, 'Land'), h('b', null, money(price)), h('span', null, 'Installation'), h('b', null, money(quote(d).cost)), h('span', null, 'Taxes ' + Math.round(BUILD_TAX * 100) + '%'), h('b', null, money(taxOf(d))), h('span', { class: 'ct' }, 'Total'), h('b', { class: 'ct' }, money(totalOf(d))));
  const quoteNote = (d: { cost: number }) => { const q = quote(d), idx = v.market.buildings.idx; const pct = Math.round((q.cost / Math.max(1, d.cost * idx) - 1) * 100);
    return h('div', { class: 'note' }, 'Construction: ' + q.units + ' Buildings · ' + (q.source === 'own' ? 'from your own factory ' + pct + '%' : q.source === 'other' ? 'bought from ' + (companyOf(v.listings.find(l => l.building === q.from)?.company ?? '')?.name ?? 'a rival') + ' ' + pct + '%' : 'at the market price (×' + idx.toFixed(2) + ')')); };
  const subFor = (d: { type: string }) => v.subsidies.find(x => x.city === cityId && x.kind === d.type && (!x.product || (d.type === 'factory' && x.product === (factProduct.value as ProductId))));
  const pending = v.orders.find(x => (x.action.type === 'build' || x.action.type === 'buyExpansion') && (x.action as { idx?: number }).idx === idx);
  return h('div', { class: 'cfg scroll col' },
    h('div', { class: 'row' }, h('span', { class: 'grow' }, lot ? 'You own this lot.' : !TERRAIN_INFO[t].price ? 'This tile cannot be built on.' : 'Land price: ' + money(price)), TERRAIN_INFO[t].price && opts.length && !pending ? bidInput() : null),
    pending ? pendingNote(pending) : null,
    TERRAIN_INFO[t].price && opts.length === 0 ? h('div', { class: 'muted' }, 'Nothing can be built on this terrain. Farms need farmland, logging camps forest, mines ore deposits, oil wells oil fields; stores need downtown/suburb.') : h('div', { class: 'col' },
      opts.map(d => h('div', { class: 'row', style: 'border-top:1px solid #e3e3dc;padding-top:6px;flex-wrap:nowrap;align-items:flex-start' },
        facImg(d.type as BuildingType, 80, 52, 'border:1px solid #bbb'),
        h('div', { class: 'grow', style: 'min-width:0' }, h('b', null, d.name), h('div', { class: 'note' }, d.desc), areaLine(d.type, idx, false), quoteNote(d), d.type === 'factory' ? h('div', { class: 'row', style: 'gap:8px;flex-wrap:nowrap' }, free ? h('span', { class: 'row', style: 'gap:4px;flex-wrap:nowrap' }, 'Layout size', gridSel) : h('span', { class: 'note' }, `Layout ${gridFor(t)}×${gridFor(t)} cells (${t === 'u' || t === 'l' ? 'downtown' : 'suburb'})`), factProduct) : null, d.type === 'farm' && rawProduct, (() => { const x = subFor(d); return x ? h('div', { class: 'good', style: 'font-weight:bold' }, '🎁 ' + v.cities[cityId].name + ' offers ' + subsidyText(x)) : null; })()),
        h('div', { class: 'col', style: 'flex:none;align-items:stretch;gap:4px;min-width:150px' },
          h('button', { class: 'primary', style: 'flex:none;white-space:nowrap', disabled: !!pending, title: pending ? 'You already ordered something here: cancel that order first' : undefined, onclick: async () => {
          const product = d.type === 'factory' ? (factProduct.value as ProductId) : d.type === 'farm' ? (rawProduct.value as ProductId) : undefined;
          const r = await act({ type: 'build', idx, btype: d.type, product, grid: d.type === 'factory' && free ? +gridSel.value : undefined, bid: bid.value });
          if (orderToast(r)) return;
          if (r && r !== 'ok') { S.buildingId = r; toast(d.name + ' built', 'ok'); S.render(); }
        } }, 'Order'),
          costLines(d))))),
    lot ? h('button', { onclick: () => act({ type: 'releaseLot', idx }) }, 'Sell lot back (' + money(lot.paid * 0.9) + ')') : null);
}
