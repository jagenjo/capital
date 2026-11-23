// "Selected tile configuration" for an owned building: compact tabbed panel.
type Kid = Node | string | number | null | undefined | false;
import { personImg } from './prodimg.js';
import { tr } from './i18n.js';
import { SUPER_PRODUCTS, TERRAIN_INFO, type Terrain, OVERSTAFF_CAP, OVERSTAFF_BONUS, SUPPLIES, SUPPLY_HAND, DECOR_COST, DECOR_FADE, DECOR_BRAND, DECOR_ATTRACT, BUILDINGS, defOf, PRODUCTS, PRODUCT_LIST, MAX_LINES, MAX_AUTO, MAX_STORE_SIZE, MODULES, FAC_GRID, MALL_UNITS, MALL_MIN_BRAND, MALL_LEASE, type ProductId, type ModuleType } from '../../shared/data.js';
import { prodImg, hasPhoto } from './prodimg.js';
import { productCard, suppliesBox } from './prodcard.js';
import { tilePop, shopReach, requiredWorkers, capacity, slotCapacity, moduleStats, layoutIssues, cellWarnings, isLinked, linkKey, flowsTo, canFlow, incoming, outgoing, cellNeed, adj8, linkable, staffFactor, staffCap, whCap, impCap, exportCap, lineCap, effortFx, staffRatio, EFFORT_MIN, EFFORT_MAX, cellCandidates, gridN, worldPrice, worldVolume, isUnlocked, canResearch, researchOf, UNLOCK_RATE } from '../../shared/engine.js';
import type { Building } from '../../shared/types.js';
import { areaPopSplit, TASTE, areaR, superBonus, superGoods, SUPER_MIN_GOODS, SUPER_BONUS_PER_GOOD, areaInfo, AREA_R, EXPAND_TYPES, EXPAND_BONUS, expansionIssue, lotPrice, haulCost, haulPath, cityTile, HAUL_RAIL, HAUL_ROAD, HAUL_OFF } from '../../shared/engine.js';
import { h, money, money2, num, cls, asset, crisp } from './util.js';
import { S, act, companyOf } from './state.js';
import { icon } from './icons.js';
import { rentControls } from './realestate.js';
import { bid, bidInput, orderToast } from './desk.js';
import { tileCtx } from './worldmap.js';

const numInput = (value: number, onchange: (v: number) => void, attrs: Record<string, any> = {}) => {
  const el = h('input', { type: 'number', value, ...attrs });
  el.addEventListener('change', () => onchange(+el.value));
  return el;
};

/** Explicit supply source: a harbour (import) or a factory (own, or one that sells to everyone). Nothing is bought without one. */
function sourceSelect(b: Building, product: ProductId, current: string, onchange: (v: string) => void, market = false) {
  const v = S.view!; const pd = PRODUCTS[product];
  const ctx = { cities: v.cities, world: S.world! };
  const transport = (fromTile: number) => haulCost(ctx, product, fromTile, b.idx);
  const path = (fromTile: number) => ' (path ' + num(haulPath(ctx, fromTile, b.idx)) + ')';
  const tileOf = (id: string) => [...v.buildings, ...v.others].find(o => o.id === id.split('#')[0])?.idx ?? b.idx;
  const sel = h('select', { style: 'max-width:270px', class: current ? '' : 'nosrc' }, h('option', { value: '' }, '⚠ select a source'));
  const harbours = v.cities.flatMap(c => (c.port ? (c.harbour ?? []).filter(g => g.product === product && g.qty > 0.5).map(g => ({ c, g })) : [])).map(({ c, g }) => {
    const price = v.market[product].importPrice * g.mult, tr = transport(cityTile(ctx, c));
    return h('option', { value: 'harbour:' + c.id, selected: current === 'harbour:' + c.id }, '⚓ ' + c.name + ' harbour: ' + money2(price) + ' + transport ' + money2(tr) + path(cityTile(ctx, c)) + ' = ' + money2(price + tr) + ' · q35 · ' + num(g.qty) + ' left');
  });
  if (market) sel.append(h('option', { value: 'market', selected: current === 'market' }, '⛽ Local market: ' + money2(v.market[product].importPrice) + ' (import price, no transport)'));
  if (harbours.length) sel.append(h('optgroup', { label: 'Harbours that stock it (imports)' }, harbours));
  const cons = v.contracts.filter(k => k.status === 'active' && k.buyer === v.me.id && k.product === product).map(k => { const fromIdx = [...v.buildings, ...v.others].find(o => o.id === k.from)?.idx ?? b.idx;
    return h('option', { value: 'contract:' + k.id, selected: current === 'contract:' + k.id }, '📜 Contract with ' + (companyOf(k.seller)?.name ?? '?') + ': ' + money2(k.price) + ' + transport ' + money2(transport(fromIdx)) + ' · ' + num(k.qty) + '/month · ' + k.months + ' months left'); });
  if (cons.length) sel.append(h('optgroup', { label: 'Your supply contracts' }, cons));
  const own = v.buildings.filter(o => o.product === product && o.id !== b.id && o.type !== 'store' && o.type !== 'rd' && o.type !== 'factory') // a factory ships only from its export cells
    .map(o => h('option', { value: o.id, selected: current === o.id }, o.name + ' (' + v.cities[o.city].name + '): internal + transport ' + money2(transport(o.idx)) + path(o.idx) + ' · stock ' + num(o.stock.qty)));
  if (own.length) sel.append(h('optgroup', { label: 'Your factories' }, own));
  const ownEx = v.buildings.flatMap(o => (o.layout ?? []).map((c, i) => ({ o, c, i })).filter(x => x.c.m === 'export' && x.c.product === product && x.o.id !== b.id))
    .map(({ o, c, i }) => h('option', { value: o.id + '#' + i, selected: current === o.id + '#' + i }, o.name + ' export cell #' + (i + 1) + ' (' + v.cities[o.city].name + '): internal + transport ' + money2(transport(o.idx)) + path(o.idx) + ' · stock ' + num(c.stock?.qty ?? 0)));
  if (ownEx.length) sel.append(h('optgroup', { label: 'Your export cells' }, ownEx));
  const others = v.listings.filter(l => l.product === product && l.company !== v.me.id)
    .map(l => h('option', { value: l.building, selected: current === l.building }, (companyOf(l.company)?.name ?? '?') + ', ' + v.cities[l.city].name + ': ' + money2(l.price) + ' + ' + money2(transport(tileOf(l.building))) + path(tileOf(l.building)) + ' = ' + money2(l.price + transport(tileOf(l.building))) + ' · q' + l.q + ' · ' + num(l.qty) + ' avail'));
  if (others.length) sel.append(h('optgroup', { label: 'Factories & export cells selling to everyone' }, others));
  if (current && ![...sel.querySelectorAll('option')].some(o => o.value === current)) sel.append(h('option', { value: current, selected: true }, 'Chosen source (not selling right now)'));
  sel.addEventListener('change', () => onchange(sel.value));
  return sel;
}

function productSelect(ids: ProductId[], current: ProductId, onchange: (p: ProductId) => void, gate = false) {
  const me = S.view!.me; // gate: hi-tech goods you have not researched yet cannot be picked
  const s = h('select', null, ids.map(p => { const lock = !isUnlocked(me, p); return h('option', { value: p, selected: p === current, disabled: gate && lock }, (lock ? '🔒 ' : '') + PRODUCTS[p].name); }));
  s.addEventListener('change', () => { const p = s.value as ProductId; s.value = current; onchange(p); });
  return s;
}

const tabsFor = (b: Building): string[] =>
  b.type === 'mall' ? ['Units', 'Report']
    : b.type === 'factory' ? ['Production', 'Layout', 'Inputs', 'Supplies', 'Area', 'Staff', 'Report']
    : b.type === 'store' ? ['Shelves', 'Shop', 'Supplies', 'Area', 'Staff', 'Report']
      : b.type === 'rd' ? ['Research', 'Area', 'Staff', 'Report']
        : ['Production', 'Supplies', 'Area', 'Staff', 'Report'];

/** Two small icon toggles for the title bar: paint the haul-cost field / the supplier routes on the map. */
function mapToggles(b: Building): HTMLElement | null {
  if (b.type === 'mall') return null;
  const on = S.costField === b.id;
  return h('span', { class: 'row', style: 'gap:3px;flex:none' },
    h('button', { class: 'mini icon' + (on ? ' on' : ''), title: `Transport cost field: paint on the map what it costs to haul goods to this facility from every tile (path cost per tile: rail ${HAUL_RAIL}, road ${HAUL_ROAD}, open land 10, forest 20, mountain 100, sea 5, land↔sea 500)`, onclick: () => { S.costField = on ? null : b.id; S.render(); } }, icon('heat')),
    h('button', { class: 'mini icon' + (S.showRoutes ? ' on' : ''), title: 'Transport routes: draw the cheapest route from every chosen supplier to this facility', onclick: () => { S.showRoutes = !S.showRoutes; S.render(); } }, icon('route')));
}
const qualityBit = (a: { quality?: number; qualityName?: string; factor: number }) => a.quality == null ? null : h('span', null, h('b', null, a.qualityName + ' '), Math.round(a.quality * 100) + '% · ');
/** What the 5x5 surroundings of a tile do for a building of this type (also used to preview a build site). */
export function areaLine(type: string, idx: number, prefix = true, expand?: number[]): HTMLElement | null {
  const v = S.view!; if (!S.world || type === 'mall') return null;
  const a = areaInfo(tileCtx(), { type, idx, expand }); const side = areaR(type) * 2 + 1;
  const target = ({ factory: 'production', store: 'customers', supermarket: 'customers', rd: 'research', farm: 'harvest', forest: 'timber output', mine: 'ore output', copper: 'ore output', quarry: 'stone output', rare: 'rare ore output', oil: 'oil output' } as Record<string, string>)[type] ?? 'output';
  const gain = Math.round((a.factor - 1) * 100);
  if (a.kind !== 'pop') {
    const tiles = ({ deposits: type === 'oil' ? 'oil field tiles' : type === 'copper' ? 'copper deposit tiles' : type === 'quarry' ? 'mountain tiles' : type === 'rare' ? 'rare ore deposit tiles' : 'iron deposit tiles', trees: 'forest tiles', farmland: 'farmland tiles' } as Record<string, string>)[a.kind];
    return h('div', { class: 'areachip' }, qualityBit(a), h('b', null, `Area ${side}×${side}: `), expand ? `${a.count} of ${a.max} ${tiles} bought → ` : `${a.max} ${tiles} around, each can be bought as an expansion → `,
      h('b', { class: 'good' }, expand ? '+' + gain + '% ' + target : '+' + Math.round(EXPAND_BONUS * 100) + '% ' + target + ' per tile'));
  }
  return h('div', { class: 'areachip' }, qualityBit(a), h('b', null, `Area ${side}×${side}: `), num(a.pop) + ' inhabitants → ', h('b', { class: gain >= 0 ? 'good' : 'bad' }, (gain >= 0 ? '+' : '') + gain + '% ' + target),
    prefix ? h('span', { class: 'muted small' }, '  (more people around = better)') : null,
    a.hall ? h('div', null, '🏛 Town hall nearby: ', h('b', { class: 'good' }, '+' + Math.round(a.hall * 100) + '% customers')) : null,
    type === 'store' || type === 'supermarket' ? shopperMix(idx) : null);
}
/** Downtown vs suburban shoppers around a store: they want different products. */
function shopperMix(idx: number): HTMLElement {
  const d = areaPopSplit(tileCtx(), { idx }); const pct = Math.round(d * 100);
  const top = (k: 0 | 1) => (Object.entries(TASTE) as [ProductId, [number, number]][]).filter(([, t]) => t[k] > 1.05).sort((x, y) => y[1][k] - x[1][k]).slice(0, 4).map(([p]) => PRODUCTS[p].name.toLowerCase()).join(', ');
  return h('div', { class: 'small' }, '🛍 Shoppers here: ', h('b', null, pct + '% downtown · ' + (100 - pct) + '% suburban'), h('span', { class: 'muted' }, ' — downtown buys more ' + top(0) + '; suburbs more ' + top(1) + '.'));
}
const areaChip = (b: Building) => areaLine(b.type, b.idx, true, b.expand ?? []);
let expSel: number | null = null;
/** Zoom of the square (5x5; 7x7 for farms) around an extractive facility: buy neighbouring tiles as expansions. */
function areaTab(b: Building): HTMLElement {
  if (!EXPAND_TYPES.includes(b.type)) return h('div', { class: 'col', style: 'gap:6px' }, areaChip(b), h('div', { class: 'note' }, b.type === 'rd' ? 'Laboratories do better with many people in the 5×5 square around them.' : 'The more inhabitants live in the 5×5 square around it, the better it does.'));
  const v = S.view!, wd = S.world!; const R = areaR(b.type), side = R * 2 + 1; const x0 = b.idx % wd.w, y0 = Math.floor(b.idx / wd.w);
  const ctx = { ...tileCtx(), lots: v.lots, vacant: v.vacant, buildings: Object.fromEntries([...v.buildings, ...v.others].map(o => [o.id, o])) };
  const a = areaInfo(ctx, b); const fitTerrain = ({ mine: 'e', copper: 'c', quarry: 'm', rare: 'x', oil: 'o', forest: 't', farm: 'f' } as Record<string, string>)[b.type];
  const mine = new Set([b.idx, ...(b.expand ?? [])]);
  const cell = (dx: number, dy: number) => {
    const x = x0 + dx, y = y0 + dy; if (x < 0 || y < 0 || x >= wd.w || y >= wd.h) return h('div', { class: 'xcell off' });
    const i = y * wd.w + x; const t = wd.tiles[i] as Terrain; const lot = v.lots[String(i)]; const ok = !mine.has(i) && !expansionIssue(ctx, b, i);
    const fit = t === fitTerrain; const owner = lot ? companyOf(lot.owner) : null;
    return h('div', { class: 'xcell' + (i === expSel ? ' sel' : '') + (ok ? ' buyable' : ''), style: `background:${TERRAIN_INFO[t].color};` + (owner ? `outline:3px solid ${owner.color};outline-offset:-3px` : ''), title: TERRAIN_INFO[t].name + (owner ? ' · ' + owner.name : ''), onclick: () => { expSel = i; S.render(); } },
      i === b.idx ? h('b', { class: 'xmark', style: `background:${BUILDINGS[b.type].color}` }, BUILDINGS[b.type].letter) : mine.has(i) ? h('b', { class: 'xown' }, '✓') : null,
      fit ? h('span', { class: 'xfit' }, '+20%') : null,
      ok ? h('span', { class: 'xprice' }, money(lotPrice(ctx, i))) : null);
  };
  const grid = h('div', { class: 'xgrid', style: `grid-template-columns:repeat(${side},46px)` }); for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) grid.append(cell(dx, dy));
  const sel = expSel != null && Math.max(Math.abs(expSel % wd.w - x0), Math.abs(Math.floor(expSel / wd.w) - y0)) <= R ? expSel : null;
  let side2: HTMLElement;
  if (sel == null) side2 = h('div', { class: 'muted' }, 'Click a tile of the square to see whether you can buy it.');
  else {
    const t = wd.tiles[sel] as Terrain, why = mine.has(sel) ? (sel === b.idx ? 'The facility itself.' : 'Yours: part of this facility.') : expansionIssue(ctx, b, sel), price = lotPrice(ctx, sel);
    side2 = h('div', { class: 'col', style: 'gap:4px' }, h('b', null, TERRAIN_INFO[t].name + ` (${sel % wd.w}, ${Math.floor(sel / wd.w)})`),
      t === fitTerrain ? h('div', { class: 'good' }, '+' + Math.round(EXPAND_BONUS * 100) + '% ' + 'output if you own it') : h('div', { class: 'muted' }, 'This terrain adds nothing to the output (it only extends your reach).'),
      why ? h('div', { class: 'muted' }, why) : h('div', null, 'Price: ' + money(price)),
      !why ? (() => { const o = S.view!.orders.find(x => (x.action.type === 'buyExpansion' || x.action.type === 'build') && (x.action as { idx?: number }).idx === sel);
        return o ? h('div', { class: 'note col', style: 'gap:4px' }, h('div', null, '📝 Pending order: ', h('b', null, o.label), o.bid ? ' (bid ' + money(o.bid) + ')' : ''), h('div', null, h('button', { class: 'mini danger', onclick: () => act({ type: 'cancelOrder', id: o.id }) }, 'Cancel order')))
          : h('div', { class: 'row' }, h('button', { class: 'primary', onclick: async () => { orderToast(await act({ type: 'buyExpansion', id: b.id, idx: sel, bid: bid.value })); } }, 'Order for ' + money(price)), bidInput()); })() : null);
  }
  return h('div', { class: 'col', style: 'gap:6px' }, areaChip(b),
    h('div', { class: 'row', style: 'align-items:flex-start;gap:16px' }, grid, h('div', { class: 'grow' }, side2)),
    h('div', { class: 'note' }, 'Only the tiles you buy as expansions count: each tile of the right terrain adds ' + Math.round(EXPAND_BONUS * 100) + '% output, with no new facility to build. A tile must touch the facility or one of its expansions. Nobody else can use a tile once you own it.'),
    h('div', { class: 'muted small' }, `Currently ${a.count} of ${a.max} matching tiles in the area.`));
}
function constructionBadge(b: Building): HTMLElement | null {
  const mall = b.mall ? S.view!.malls.find(m => m.id === b.mall) : null;
  const left = b.building || (mall && mall.opensIn) || 0; if (!left) return null;
  const txt = b.building ? `Under construction: ${left} more month${left === 1 ? '' : 's'} before it starts operating.${b.type === 'mall' ? ' Tenants can already reserve units.' : ''}` : `${mall!.name} opens in ${left} month${left === 1 ? '' : 's'}: your shop starts trading then. You can already set up the shelf.`;
  return h('span', { class: 'buildbadge', title: txt }, '🚧 ' + left + (left === 1 ? ' month' : ' months'));
}
function mgrChip(b: Building): HTMLElement {
  const m = S.view!.me.staff?.find(p => p.assigned === b.id);
  const go = () => { S.tab = 'personnel'; S.render(); };
  if (!m) return h('div', { class: 'mgrchip muted small clickable', onclick: go }, '👤 No manager assigned — open Personnel');
  const f = m.spec === b.type ? 1 : 0.5;
  return h('div', { class: 'mgrchip small clickable', onclick: go, title: 'Open Personnel' },
    personImg(m.portrait, 24),
    h('b', null, m.name), ` · manager${f === 1 ? ' (specialist)' : ''} · efficiency +${(1.5 * m.eff * f).toFixed(1)}% · output +${(2 * m.prod * f).toFixed(0)}% · costs −${(2 * m.exp * f).toFixed(0)}%`);
}
export function buildingPanel(b: Building): HTMLElement {
  const v = S.view!; const def = defOf(b);
  const tabs = tabsFor(b); const tab = tabs.includes(S.cfgTab) ? S.cfgTab : tabs[0];
  const sections: Record<string, () => HTMLElement> = {
    Production: () => productionTab(b), Layout: () => layoutTab(b), Inputs: () => inputsTab(b), Staff: () => h('div', { class: 'col', style: 'gap:6px' }, mgrChip(b), staffTab(b)), Supplies: () => suppliesTab(b), Report: () => reportTab(b),
    Area: () => areaTab(b), Shelves: () => shelvesTab(b), Shop: () => shopTab(b), Units: () => mallTab(b), Research: () => researchTab(b),
  };
  return h('div', { class: 'cfg' },
    h('div', { class: 'cfghead' },
      h('b', null, b.name), constructionBadge(b), h('span', { class: 'muted small' }, def.name + ' · ' + v.cities[b.city].name + ' · invested ' + money(b.invested)),
      h('span', { class: 'grow' }), mapToggles(b),
      h('button', { class: 'mini', title: 'Rename', onclick: () => { const n = prompt('Rename building', b.name); if (n) act({ type: 'rename', id: b.id, name: n }); } }, 'Rename'),
      h('button', { class: 'mini danger', title: 'Demolish', onclick: () => { if (confirm('Demolish ' + b.name + '? You recover ' + money(b.invested * 0.4) + '. The land stays yours.')) act({ type: 'sellBuilding', id: b.id }); } }, 'Demolish +' + money(b.invested * 0.4)),
      h('button', { class: 'mini', title: 'Close', onclick: () => { S.sel = null; S.buildingId = null; S.render(); } }, '✕')),
    h('div', { class: 'tabs' }, tabs.map(t => h('button', { class: 'tab' + (t === tab ? ' active' : ''), onclick: () => { S.cfgTab = t; S.render(); } }, t))),
    h('div', { class: 'tabbody' }, sections[tab]()));
}

// ---------------------------------------------------------------- tabs
/** Row of little people: green = working, red = missing for the requirement, blue = extra crew (improves output, up to the cap), grey = free room under the cap. Click one to set the headcount. */
function people(w: number, need: number, onSet: (n: number) => void): HTMLElement {
  const cap = staffCap(need), n = Math.max(cap, w);
  return h('div', { class: 'people', title: w + ' workers · needs ' + need + ' · cap ' + cap },
    ...Array.from({ length: n }, (_, i) => h('span', { class: 'pp ' + (i < Math.min(w, need) ? 'ok' : i < need ? 'miss' : i < w ? 'extra' : 'free'), onclick: () => onSet(i + 1 === w ? i : i + 1) })));
}
/** A row of clickable squares like the workers row: filled up to the value; click a square to set it (click the last filled one to step back). */
function squares(value: number, min: number, max: number, step: number, onSet: (n: number) => void, tone: (v: number) => string, title: string): HTMLElement {
  const n = Math.round((max - min) / step);
  return h('div', { class: 'people sq', title }, ...Array.from({ length: n }, (_, k) => { const v = min + (k + 1) * step; const on = value >= v - 1e-9;
    return h('span', { class: 'pp sqr' + (on ? ' on' : ''), style: on ? 'background:' + tone(v) : '', title: v + '%', onclick: () => onSet(Math.abs(value - v) < 1e-9 ? v - step : v) }); }));
}
const peopleLegend = () => h('div', { class: 'note' }, h('span', { class: 'pp ok' }), ' working  ', h('span', { class: 'pp miss' }), ' missing  ', h('span', { class: 'pp extra' }), ' extra (each counts +' + Math.round(OVERSTAFF_BONUS * 100) + '% — more output)  ', h('span', { class: 'pp free' }), ' free up to the cap of ' + OVERSTAFF_CAP + '× the need. Click an icon to set the crew.');

function staffTab(b: Building): HTMLElement {
  const v = S.view!; const need = requiredWorkers(b); const cw = v.cityWages[b.city];
  const wageRows = [
    h('label', null, 'Wage (city ' + money(cw) + ')'), h('div', { class: 'row' }, numInput(b.wage, w => act({ type: 'setStaff', id: b.id, workers: b.workers, wage: w }), { min: 500, step: 50 }), h('span', { class: b.wage < cw * 0.9 ? 'bad' : 'muted' }, b.wage < cw * 0.9 ? 'workers quit' : Math.round(b.wage / cw * 100) + '%')),
    h('label', null, 'Maintenance %'), h('div', { class: 'row' }, numInput(b.maint, p => act({ type: 'setMaint', id: b.id, pct: p }), { min: 0, max: 200, step: 10 }), h('span', { class: 'muted' }, 'cond. ' + b.condition.toFixed(0) + '%')),
    h('label', null, 'Payroll / month'), h('div', null, money(b.workers * b.wage)),
  ];
  if (b.type === 'factory' && b.layout) {
    const rows = b.layout.map((c, i) => ({ c, i })).filter(x => x.c.m);
    return h('div', null,
      h('div', { class: 'row', style: 'margin-bottom:4px' }, h('b', null, 'Workers per facility slot'), h('span', { class: 'muted' }, b.workers + ' / ' + need + ' total'),
        h('button', { class: 'mini', onclick: () => act({ type: 'setStaff', id: b.id, workers: need, wage: b.wage }) }, 'Fill all slots'), h('button', { class: 'mini', onclick: () => act({ type: 'setStaff', id: b.id, workers: staffCap(need), wage: b.wage }) }, 'Max crew'), h('button', { class: 'mini', onclick: () => act({ type: 'setStaff', id: b.id, workers: 0, wage: b.wage }) }, 'Fire all')),
      h('table', null, h('thead', null, h('tr', null, ['Slot', 'Facility', 'Needs', 'Crew', 'Strength'].map((x, i) => h('th', { class: i > 1 ? 'num' : '' }, x)))),
        h('tbody', null, rows.map(({ c, i }) => {
          const n = cellNeed(b, i), w = c.workers ?? 0, ratio = staffFactor(w, n);
          return h('tr', null, h('td', null, '#' + (i + 1)), h('td', null, h('span', { class: 'tag', style: 'background:' + MODULES[c.m!].color }), MODULES[c.m!].name + (c.product && (c.m === 'line' || c.m === 'import') ? ' · ' + PRODUCTS[c.product].name : '')),
            h('td', { class: 'num' }, n),
            h('td', null, n ? people(w, n, x => act({ type: 'setCellStaff', id: b.id, cell: i, workers: x })) : ''),
            h('td', { class: 'num ' + (ratio < 0.99 ? 'bad' : 'good') }, Math.round(ratio * 100) + '%'));
        }))),
      peopleLegend(),
      h('div', { class: 'note' }, 'Each facility slot works at the strength of its own crew: a production line makes proportionally less, an import cell buys less, and warehouses, robots, branding, R&D and quality control lose effect when understaffed — and gain when overstaffed.'),
      h('div', { class: 'kv2', style: 'margin-top:6px' }, ...wageRows));
  }
  return h('div', { class: 'kv2' },
    h('label', null, 'Crew (need ' + need + ', cap ' + (b.type === 'rd' ? '–' : staffCap(need)) + ')'), h('div', { class: 'col', style: 'gap:4px' },
      h('div', { class: 'row' }, h('b', null, b.workers + ' / ' + need), h('button', { class: 'mini', onclick: () => act({ type: 'setStaff', id: b.id, workers: need, wage: b.wage }) }, 'Fill'), h('button', { class: 'mini', onclick: () => act({ type: 'setStaff', id: b.id, workers: 0, wage: b.wage }) }, 'Send all home')),
      b.type === 'rd' ? h('div', { class: 'muted' }, 'Scientists: more of them research faster.') : people(b.workers, need, w => act({ type: 'setStaff', id: b.id, workers: w, wage: b.wage })), b.type === 'rd' ? null : peopleLegend()),
    ...wageRows);
}

/** Production cost of one unit of a good in a building: ingredients at today's reference market prices, plus the wages of the crew a line needs. */
function unitCost(b: Building, p: ProductId): { materials: number; labour: number; total: number } {
  const v = S.view!; const P = PRODUCTS[p];
  const materials = Object.entries(P.recipe).reduce((n, [k, q]) => n + (q as number) * PRODUCTS[k as ProductId].basePrice * v.market[k].idx, 0);
  const labour = P.workers * (b.wage || v.cityWages[b.city]) / Math.max(1, P.cap);
  return { materials, labour, total: materials + labour };
}
const selGood: Record<string, ProductId> = {}; // which good of a multi-product factory the Production tab shows
/** SALES of a factory's good: it leaves only through export cells, so the prices and the world-market switch live on the cells that hold it. */
function exportSales(b: Building, cur: ProductId): HTMLElement {
  const v = S.view!; const L = b.layout ?? []; const P = PRODUCTS[cur]; const mk = v.market[cur]; const ref = P.basePrice * mk.idx;
  const exp = L.map((c, i) => ({ c, i })).filter(x => x.c.m === 'export' && x.c.product === cur); const stockQ = exp.reduce((n, x) => n + (x.c.stock?.qty ?? 0), 0);
  // the settings apply to every export cell that holds this good
  const setAll = async (f: (i: number) => Parameters<typeof act>[0]) => { for (const x of exp) await act(f(x.i)); };
  const first = exp[0]?.c; const stockTxt = 'stock ' + num(stockQ);
  const sales2 = h('div', { class: 'pgroup' }, h('div', { class: 'pg-t' }, 'Sales'),
    ...(exp.length ? [
      h('div', { class: 'sale' }, h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: first!.listPrice != null, onchange: (e: Event) => setAll(i => ({ type: 'setCell', id: b.id, cell: i, price: (e.target as HTMLInputElement).checked ? +ref.toFixed(2) : null })) }), h('b', null, 'Sell to everyone')),
        first!.listPrice != null ? numInput(first!.listPrice, p => setAll(i => ({ type: 'setCell', id: b.id, cell: i, price: p })), { step: 0.5, min: 0.01 }) : null, h('span', { class: 'muted' }, 'ref ' + money2(ref) + ' · ' + stockTxt)),
      h('div', { class: 'sale' }, h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: !!first!.world, onchange: (e: Event) => setAll(i => ({ type: 'setWorldSell', id: b.id, cell: i, on: (e.target as HTMLInputElement).checked })) }), h('b', null, 'Sell to world market')),
        h('span', { class: 'muted' }, '~' + money2(worldPrice(S.view as any, cur)) + ' for what nobody buys'))]
      : [h('div', { class: 'sale' }, h('span', { class: 'muted' }, 'Nothing in the layout exports this good, so the factory cannot sell it. Add an export cell in the Layout tab and draw an arrow from the line into it.'))]));
  return sales2;
}
function productionTab(b: Building): HTMLElement {
  const v = S.view!; const def = BUILDINGS[b.type]; const pd = PRODUCTS[b.product!];
  const prodSel = def.products && def.products.length > 1 || b.type === 'factory'
    ? productSelect(b.type === 'factory' ? PRODUCT_LIST.filter(p => p.kind !== 'raw').map(p => p.id) : def.products!, b.product!, p => {
      if (b.type !== 'factory' || confirm('Retool factory for ' + PRODUCTS[p].name + '? This costs ' + money(def.cost * 0.15 * b.lines) + ' and clears input stock.')) act({ type: 'setProduct', id: b.id, product: p });
    }) : h('span', null, pd.name);
  const m = v.market[b.product!];
  const fld = (label: string, ...val: Kid[]) => h('div', { class: 'fld' }, h('div', { class: 'fl' }, label), h('div', { class: 'fv' }, ...val));
  const group = (title: string, ...kids: Kid[]) => h('div', { class: 'pgroup' }, h('div', { class: 'pg-t' }, title), h('div', { class: 'fgrid' }, ...kids));
  const lines = b.type === 'factory'
    ? [fld('Lines', b.lines + ' × ' + num(pd.cap) + ' ' + pd.unit + '/mo'), fld('Robots', b.auto + ' (see Layout)')]
    : [fld('Lines (max ' + MAX_LINES + ')', b.lines + ' × ' + num(pd.cap) + ' ' + pd.unit, h('button', { class: 'mini', disabled: b.lines >= MAX_LINES, onclick: () => act({ type: 'addLine', id: b.id }) }, '+ ' + money(def.cost * 0.6))),
      fld('Automation ' + b.auto + '/' + MAX_AUTO, h('span', { class: 'muted' }, '-' + b.auto * 8 + '% labour, +' + b.auto * 6 + '% output'), h('button', { class: 'mini', disabled: b.auto >= MAX_AUTO, onclick: () => act({ type: 'upgradeAuto', id: b.id }) }, '+ ' + money(def.cost * 0.4 * (b.auto + 1))))];
  // a factory makes more than its final product when its layout has other production lines or export cells: one card each
  const more = b.type === 'factory' && b.layout ? [...new Set(b.layout.filter(c => (c.m === 'line' || c.m === 'export') && c.product && c.product !== pd.id).map(c => c.product!))] : [];
  const output = group('Output', fld('Capacity', num(capacity(b)) + ' ' + pd.unit + ' / month'), fld('Stock', num(b.stock.qty) + ' ' + pd.unit), fld('Quality', b.stock.q.toFixed(0) + ' / 100'), fld('Cost per ' + pd.unit, money2(unitCost(b, pd.id).total) + ' (materials ' + money2(unitCost(b, pd.id).materials) + ')'), fld('Margin per ' + pd.unit, h('span', { class: cls(pd.basePrice * m.idx - unitCost(b, pd.id).total) }, money2(pd.basePrice * m.idx - unitCost(b, pd.id).total))), fld('Target', numInput(b.target, p => act({ type: 'setTarget', id: b.id, pct: p }), { min: 0, max: 100, step: 5 }), '%'));
  const sales = h('div', { class: 'pgroup' }, h('div', { class: 'pg-t' }, 'Sales'),
    h('div', { class: 'sale' }, h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: b.listPrice != null, onchange: (e: Event) => act({ type: 'setListPrice', id: b.id, price: (e.target as HTMLInputElement).checked ? +(pd.basePrice * m.idx).toFixed(2) : null }) }), h('b', null, 'Sell to everyone')),
      b.listPrice != null ? numInput(b.listPrice, p => act({ type: 'setListPrice', id: b.id, price: p }), { step: 0.5, min: 0.01 }) : null,
      h('span', { class: 'muted' }, 'ref ' + money2(pd.basePrice * m.idx) + ' · import ' + money2(m.importPrice))),
    h('div', { class: 'sale' }, h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: !!b.world, onchange: (e: Event) => act({ type: 'setWorldSell', id: b.id, on: (e.target as HTMLInputElement).checked }) }), h('b', null, 'Sell to world market')),
      h('span', { class: 'muted' }, 'leftover stock at ~' + money2(worldPrice(S.view as any, b.product!)) + ' (price sags with volume, max ' + num(worldVolume(b.product!)) + '/month worldwide)')));
  const salesBlock = b.type === 'factory' ? exportSales(b, pd.id) : sales; // a factory sells only through its export cells
  // several goods: click a card to see the Output / Production / Sales of that good
  const goods = [pd.id, ...more]; const cur: ProductId = goods.includes(selGood[b.id]) ? selGood[b.id] : pd.id;
  const pick = (id: ProductId) => h('div', { class: 'pcpick' + (id === cur && goods.length > 1 ? ' on' : ''), title: goods.length > 1 ? 'Show this good' : undefined, onclick: goods.length > 1 ? () => { selGood[b.id] = id; S.render(); } : undefined }, productCard(id, 360));
  const cards = goods.map(pick);
  // operating supplies a facility burns while it works (a farm's fuel)
  const sup = Object.entries(SUPPLIES[b.type] ?? {}) as [ProductId, number][];
  const supplies = sup.length ? h('div', { class: 'pgroup' }, h('div', { class: 'pg-t' }, 'Operating supplies'), ...sup.map(([p, per]) => { const P = PRODUCTS[p], st = b.inputs[p]; const use = capacity(b) * (b.target / 100) * per;
    return h('div', { class: 'sale' }, h('b', null, P.name), sourceSelect(b, p, b.sources[p] ?? 'market', src => act({ type: 'setSource', id: b.id, product: p, source: src }), true),
      h('span', { class: 'muted' }, per + ' ' + P.unit + ' per ' + pd.unit + ' · ~' + num(use) + ' ' + P.unit + '/month · in stock ' + num(st?.qty ?? 0) + '. Without it the work is done by hand at ' + Math.round(SUPPLY_HAND * 100) + '% output.')); })) : null;
  if (cur === pd.id) return h('div', { class: 'row', style: 'align-items:flex-start;gap:10px' },
    h('div', { class: 'col', style: 'flex:none;width:360px;gap:8px' }, ...cards, output),
    h('div', { class: 'col grow', style: 'gap:8px;min-width:0' }, group('Production', fld('Product', prodSel), ...lines), salesBlock, supplies));
  // a side good of the layout: made on its own lines, used inside the factory and/or held by export cells
  const L = b.layout ?? []; const P = PRODUCTS[cur]; const lineCells = L.filter(c => c.m === 'line' && c.product === cur);
  const exp = L.map((c, i) => ({ c, i })).filter(x => x.c.m === 'export' && x.c.product === cur);
  const stockQ = exp.reduce((n, x) => n + (x.c.stock?.qty ?? 0), 0); const avgQ = stockQ > 0 ? exp.reduce((n, x) => n + (x.c.stock?.qty ?? 0) * (x.c.stock?.q ?? 0), 0) / stockQ : 0;
  const users = [...new Set(L.filter(c => c.m === 'line' && c.product && PRODUCTS[c.product].recipe[cur]).map(c => PRODUCTS[c.product!].name))];
  const mk = v.market[cur]; const costOf = unitCost(b, cur); const ref = P.basePrice * mk.idx;
  const out2 = group('Output', fld('Lines', lineCells.length + ' × ' + num(P.cap) + ' ' + P.unit + '/mo'), fld('Capacity', num(lineCells.length * P.cap) + ' ' + P.unit + ' / month'), fld('Export stock', num(stockQ) + ' ' + P.unit), fld('Export quality', stockQ > 0 ? avgQ.toFixed(0) + ' / 100' : '–'));
  const prod2 = group('Production', fld('Good', h('b', null, P.name)), fld('Ingredients', Object.keys(P.recipe).length ? Object.entries(P.recipe).map(([k, q]) => q + ' × ' + PRODUCTS[k as ProductId].name).join(', ') : 'none (raw)'),
    fld('Materials per ' + P.unit, money2(costOf.materials)), fld('Labour per ' + P.unit, money2(costOf.labour)), fld('Cost per ' + P.unit, h('b', null, money2(costOf.total))),
    fld('Reference price', money2(ref)), fld('Margin per ' + P.unit, h('b', { class: cls(ref - costOf.total) }, money2(ref - costOf.total))), fld('Used in', users.length ? users.join(', ') : 'nothing inside this factory'));
  const sales2 = exportSales(b, cur);
  return h('div', { class: 'row', style: 'align-items:flex-start;gap:10px' }, h('div', { class: 'col', style: 'flex:none;width:360px;gap:8px' }, ...cards, out2), h('div', { class: 'col grow', style: 'gap:8px;min-width:0' }, prod2, sales2));
}

function inputsTab(b: Building): HTMLElement {
  const L = b.layout ?? []; const rows = L.map((c, i) => ({ c, i })).filter(x => x.c.m === 'import');
  const issues = layoutIssues(b, S.view!.cities);
  return h('div', null,
    rows.length ? h('table', null, h('thead', null, h('tr', null, ['Cell', 'Imports', 'Source'].map(x => h('th', null, x)))),
      h('tbody', null, rows.map(({ c, i }) => h('tr', null, h('td', null, '#' + (i + 1)), h('td', null, c.product ? PRODUCTS[c.product].name : h('span', { class: 'bad' }, '⚠ no product')),
        h('td', null, c.product ? sourceSelect(b, c.product, c.source ?? '', src => act({ type: 'setCell', id: b.id, cell: i, source: src })) : h('span', { class: 'muted' }, 'choose a product in the Layout tab')))))) : h('div', { class: 'muted' }, 'This factory has no import cells. Add one in the Layout tab.'),
    h('div', { class: 'note', style: 'margin-top:6px' }, 'Each import cell buys one product from a harbour that currently stocks it (each harbour holds 4 goods that rotate when sold out or after a year) or from a factory (your own, or one that sells to everyone). Link it to the lines that need it in the Layout tab.'),
    issues.length ? h('div', { class: 'bad small', style: 'margin-top:6px' }, issues.map(m => h('div', null, '⚠ ' + m))) : null);
}

function researchTab(b: Building): HTMLElement {
  const c = S.view!.me; const P = PRODUCTS[b.product!]; const locked = !!P.research && !isUnlocked(c, b.product!);
  const hi = PRODUCT_LIST.filter(p => p.research && !isUnlocked(c, p.id));
  return h('div', { class: 'kv2' }, h('label', null, 'Researching'), productSelect(PRODUCT_LIST.map(p => p.id), b.product!, p => act({ type: 'setProduct', id: b.id, product: p })),
    locked ? h('label', null, 'Unlock progress') : h('label', null, 'Tech level'),
    locked ? h('div', { class: 'row' }, h('div', { class: 'bar', style: 'width:140px' }, h('div', { style: 'width:' + Math.round(researchOf(c, b.product!) / P.research! * 100) + '%' })), Math.round(researchOf(c, b.product!)) + ' / ' + P.research + ' points')
      : h('div', { class: 'row' }, h('div', { class: 'bar', style: 'width:140px' }, h('div', { style: 'width:' + c.tech[b.product!] + '%' })), c.tech[b.product!].toFixed(1) + ' / 100'),
    locked && !canResearch(c, b.product!) ? h('div', { class: 'bad small', style: 'grid-column:1/-1' }, 'Needs ' + PRODUCTS[P.after!].name + ' unlocked first.') : null,
    h('div', { class: 'note', style: 'grid-column:1/-1' }, locked ? 'This is a hi-tech product: scientists develop it (about ' + UNLOCK_RATE + ' unlock points per research point). Once unlocked you can build factories and production lines for it; then keep researching to raise its quality.'
      : 'Each scientist adds research points per month, with diminishing returns. Higher tech raises the quality of everything you make or sell of that product.' + (hi.length ? ' Pick a hi-tech product (🔒) to unlock it: ' + hi.map(p => p.name + ' (' + p.research + ')').join(', ') + '.' : '')));
}

/** SHOP tab: the shop itself (size, crew, decoration that builds the brand of what it sells; the lease for a mall unit). */
function shopTab(b: Building): HTMLElement {
  const v = S.view!; const need = requiredWorkers(b);
  const fld = (label: string, ...val: Kid[]) => h('div', { class: 'fld' }, h('div', { class: 'fl' }, label), h('div', { class: 'fv' }, ...val));
  const decor = b.decor ?? 0; const unit = DECOR_COST * (b.mall ? 1 : b.size); const sold = b.slots.filter(x => x.product).length;
  const decorBtn = (amount: number) => h('button', { class: 'mini', disabled: decor >= 99.5, title: '+' + Math.round(amount / unit) + ' decoration points', onclick: () => act({ type: 'decorate', id: b.id, amount }) }, '+ ' + money(amount));
  const shop = h('div', { class: 'pgroup' }, h('div', { class: 'pg-t' }, 'Shop'),
    h('div', { class: 'fgrid' },
      b.mall ? fld('Place', 'mall unit') : fld('Size', h('span', null, squaresRow(b.size, MAX_STORE_SIZE, '#2f6fb5')), h('button', { class: 'mini', disabled: b.size >= MAX_STORE_SIZE, onclick: () => act({ type: 'upgradeSize', id: b.id }) }, b.size >= MAX_STORE_SIZE ? 'max' : '+ ' + money(BUILDINGS.store.cost * 0.5 * b.size))),
      fld('Shelves in use', sold + ' / ' + b.slots.length), fld('Crew', b.workers + ' / ' + need),
      fld('Decoration', h('span', null, squaresRow(Math.round(decor / 10), 10, '#b0508c')), h('b', null, Math.round(decor) + '%')),
      fld('Customer attraction', h('b', { class: decor > 0 ? 'good' : '' }, '+' + Math.round(DECOR_ATTRACT * decor) + '%')),
      fld('Brand gain / month', sold ? '+' + (DECOR_BRAND * decor / 100).toFixed(1) + ' to each of ' + sold + ' product' + (sold > 1 ? 's' : '') : 'put goods on the shelves')),
    h('div', { class: 'sale' }, h('b', null, 'Decorate'), decorBtn(10000), decorBtn(50000), decorBtn(250000), h('span', { class: 'muted' }, money(unit) + ' per decoration point; it fades ' + Math.round(DECOR_FADE * 100) + '% a month. A decorated shop attracts more customers (up to +' + Math.round(DECOR_ATTRACT * 100) + '% at 100) and raises the brand of everything it sells (brand makes customers prefer you).')));
  return h('div', { class: 'col', style: 'gap:10px;max-width:760px' },
    b.mall ? h('div', { class: 'note' }, `Unit in ${v.malls.find(m => m.id === b.mall)?.name ?? 'a mall'} · rent ${money(b.rent ?? 0)}/month · lease until turn ${b.leaseEnd} (renews at the mall's current rent every ${MALL_LEASE} months) · staff need ${need}. Mall units only sell products whose brand is at least ${MALL_MIN_BRAND}.`) : null,
    shop);
}
let openSrc = ''; // the shelf whose supplier list is open
function shelvesTab(b: Building): HTMLElement {
  const v = S.view!; const city = v.cities[b.city]; const need = requiredWorkers(b);
  const fld = (label: string, ...val: Kid[]) => h('div', { class: 'fld' }, h('div', { class: 'fl' }, label), h('div', { class: 'fv' }, ...val));
  const ref = (p: ProductId) => PRODUCTS[p].basePrice * 1.42 * v.market[p].idx * city.priceIdx;
  const shelves = b.slots.map((sl, i) => {
    const prod = h('select', null, h('option', { value: '' }, '— empty —'), PRODUCT_LIST.filter(p => p.kind === 'consumer' && (!b.super || SUPER_PRODUCTS.includes(p.id))).map(p => h('option', { value: p.id, selected: p.id === sl.product, disabled: !!b.mall && p.id !== sl.product && v.me.brand[p.id] < MALL_MIN_BRAND }, p.name + (b.mall && v.me.brand[p.id] < MALL_MIN_BRAND ? ' (brand ' + MALL_MIN_BRAND + ' needed)' : ''))));
    const price = h('input', { type: 'number', value: sl.price, step: 0.5, style: 'width:78px' });
    const order = h('input', { type: 'number', value: sl.order, style: 'width:64px' });
    const commit = () => act({ type: 'setSlot', id: b.id, slot: i, product: (prod.value || null) as ProductId | null, price: +price.value, order: +order.value, source: prod.value === sl.product ? sl.source : '' });
    prod.addEventListener('change', () => { const p = (prod.value || null) as ProductId | null; act({ type: 'setSlot', id: b.id, slot: i, product: p, price: p ? +ref(p).toFixed(2) : 0, order: p ? slotCapacity(b, p) : 0, source: '' }); });
    price.addEventListener('change', commit); order.addEventListener('change', commit);
    const key = b.id + ':' + i; const srcOpen = openSrc === key;
    const srcLabel = !sl.product ? '' : !sl.source ? 'no supplier chosen' : sl.source.startsWith('harbour:') ? '⚓ ' + (v.cities[+sl.source.slice(8)]?.name ?? 'harbour') + ' harbour' : sl.source.startsWith('contract:') ? 'supply contract' : (() => { const o = [...v.buildings, ...v.others].find(x => x.id === sl.source.split('#')[0]); return o ? o.name + (sl.source.includes('#') ? ' (export cell)' : '') : 'supplier'; })();
    const srcBtn = sl.product ? h('button', { class: 'mini srcbtn' + (sl.source ? '' : ' bad'), title: 'Supplier: ' + srcLabel + ' (click to change)', onclick: () => { openSrc = srcOpen ? '' : key; S.render(); } }, sl.source ? '⇄' : '⚠') : null;
    const head = h('div', { class: 'sc-head' }, sl.product ? prodImg(sl.product, 96, 68, 'border:2px inset #8a8470;display:block') : h('div', { style: 'width:96px;height:68px;border:2px inset #8a8470;background:#e4e0d0;flex:none' }), h('div', { class: 'col', style: 'gap:4px;align-items:flex-start' }, prod, srcBtn));
    if (!sl.product) return h('div', { class: 'shelfcard empty' }, head);
    const r = ref(sl.product), diff = r > 0 ? sl.price / r - 1 : 0; const fill = sl.order > 0 ? Math.min(1, sl.stock.qty / sl.order) : 0;
    return h('div', { class: 'shelfcard' }, head,
      srcOpen ? h('div', { class: 'sc-src' }, h('span', { class: 'fl' }, 'Supplier: ' + srcLabel), sourceSelect(b, sl.product, sl.source, s => { openSrc = ''; act({ type: 'setSlot', id: b.id, slot: i, product: sl.product, price: sl.price, order: sl.order, source: s }); })) : null,
      h('div', { class: 'sc-line' }, h('span', { class: 'fl' }, 'Price'), price, h('span', { class: diff > 0.1 ? 'bad small' : diff < -0.1 ? 'good small' : 'muted small', title: 'reference price ' + money2(r) }, (diff >= 0 ? '+' : '') + Math.round(diff * 100) + '%'),
        h('span', { class: 'fl', style: 'margin-left:auto' }, 'Order/month'), order, h('span', { class: 'muted small' }, '≤' + num(slotCapacity(b, sl.product)))),
      h('div', { class: 'sc-line' }, h('span', { class: 'fl' }, 'Stock'), h('div', { class: 'gbar', style: 'flex:none;width:110px;height:14px' }, h('div', { style: `width:${Math.round(fill * 100)}%;background:${fill < 0.25 ? '#c0504d' : '#4a8f3f'}` })), h('b', null, num(sl.stock.qty)), h('span', { class: 'muted small' }, 'q' + sl.stock.q.toFixed(0)),
        h('span', { class: 'fl', style: 'margin-left:auto' }, 'Sold last month'), h('b', null, num(sl.sold)), sl.lost > 0 ? h('span', { class: 'bad small' }, '⚠ ' + num(sl.lost) + ' unmet') : null));
  });
  const variety = b.super ? h('div', { class: superBonus(b) > 0 ? 'areachip' : 'note' }, h('b', null, 'Variety: '), `${superGoods(b)} of ${SUPER_PRODUCTS.length} goods on sale → `, superBonus(b) > 0 ? h('b', { class: 'good' }, '+' + Math.round(superBonus(b) * 100) + '% customers') : `no bonus yet (needs more than ${SUPER_MIN_GOODS} goods; each extra good adds +${Math.round(SUPER_BONUS_PER_GOOD * 100)}%)`) : null;
  return h('div', { class: 'col', style: 'gap:10px' }, variety, h('div', { class: 'shelfgrid' }, shelves));
}
/** A row of small squares: `n` of `max` filled. */
function squaresRow(n: number, max: number, color: string): HTMLElement {
  return h('span', { class: 'sqrow' }, Array.from({ length: max }, (_, k) => h('span', { class: 'sq', style: k < n ? 'background:' + color : '' })));
}

function mallTab(b: Building): HTMLElement {
  const v = S.view!; const m = v.malls.find(x => x.id === b.id); if (!m) return h('div', null, '…');
  const free = MALL_UNITS - m.tenants.length; const income = m.tenants.reduce((n, x) => n + x.rent, 0);
  const rent = h('input', { type: 'number', value: b.rent ?? 0, step: 500, style: 'width:90px' }); rent.addEventListener('change', () => act({ type: 'setRent', id: b.id, rent: +rent.value }));
  return h('div', null,
    h('div', { class: 'row', style: 'margin-bottom:6px' }, h('span', null, 'Asking rent per unit / month'), rent, h('span', { class: 'muted small' }, `${m.tenants.length}/${MALL_UNITS} units let · income ${money(income)}/month · condition ${m.cond}%`)),
    h('div', { class: 'note' }, 'Existing tenants keep their rent until their lease renews (every ' + MALL_LEASE + ' months). Tenants sell one branded product each; the mall gives them extra foot traffic and boosts the pull of their brand. Maintenance keeps the mall attractive.'),
    h('table', null, h('thead', null, h('tr', null, ['Unit', 'Tenant', 'Product', 'Rent', 'Lease until'].map((x, i) => h('th', { class: i > 2 ? 'num' : '' }, x)))),
      h('tbody', null, Array.from({ length: MALL_UNITS }, (_, i) => { const t = m.tenants[i]; return t ? h('tr', null, h('td', null, '#' + (i + 1)), h('td', null, h('span', { class: 'tag', style: 'background:' + (companyOf(t.company)?.color ?? '#888') }), ' ' + (companyOf(t.company)?.name ?? '?')), h('td', null, t.product ? PRODUCTS[t.product].name : '—'), h('td', { class: 'num' }, t.company === m.owner ? 'own use' : money(t.rent)), h('td', { class: 'num' }, 'T' + t.leaseEnd)) : h('tr', { class: 'muted' }, h('td', null, '#' + (i + 1)), h('td', { colspan: 4 }, 'vacant')); }))),
    free > 0 ? h('div', { style: 'margin-top:6px' }, h('b', null, 'Open a shop of your own here: '), rentControls(m)) : null);
}
/** Cost per unit sold (and made): what each unit costs in inputs, wages and upkeep, against what it earns. */
function unitCosts(b: Building): HTMLElement {
  const r = b.report; const cost = r.purchases + r.wages + r.maint; const per = (x: number, n: number) => n > 0 ? money2(x / n) : '–';
  const fld = (label: string, ...val: (Node | string)[]) => h('div', { class: 'fld' }, h('div', { class: 'fl' }, label), h('div', { class: 'fv' }, ...val));
  const profit = r.sold > 0 ? (r.revenue - cost) / r.sold : 0;
  return h('div', { class: 'pgroup', style: 'margin-top:8px' }, h('div', { class: 'pg-t' }, 'Cost per unit'),
    h('div', { class: 'fgrid' },
      fld('Units sold', num(r.sold, 1)),
      fld('To the local market', num(r.soldLocal ?? 0, 1)), fld('To other companies', num(r.soldCo ?? 0, 1)), (r.soldWorld ?? 0) > 0 ? fld('To the world market', num(r.soldWorld!, 1)) : '',
      fld('Cost per unit sold', per(cost, r.sold)),
      fld('Inputs', per(r.purchases, r.sold)), fld('Wages + upkeep', per(r.wages + r.maint, r.sold)),
      fld('Revenue per unit', per(r.revenue, r.sold)),
      fld('Profit per unit', h('span', { class: r.sold > 0 ? cls(profit) : '' }, r.sold > 0 ? money2(profit) : '–')),
      b.type !== 'store' && b.type !== 'rd' && b.type !== 'mall' ? fld('Cost per unit made', per(cost, r.produced)) : ''));
}
/** Units produced and sold per month over the last two years (a line chart with a legend). */
function productionChart(b: Building, prod: boolean): HTMLElement {
  const H = b.prodHist ?? []; const W = 560, Ht = 190; const cv = crisp(h('canvas', { style: 'display:block;background:#fff;border:1px solid #b9b9b0;max-width:100%' }), W, Ht); const g = cv.getContext('2d')!;
  const unit = b.product && b.type !== 'store' ? PRODUCTS[b.product].unit : 'units';
  if (H.length < 2) { g.fillStyle = '#888'; g.font = '12px system-ui'; g.fillText(tr('Play a few turns to see history.'), 12, Ht / 2); }
  else {
    const hi = Math.max(1, ...H.map(x => Math.max(prod ? x.p : 0, x.s))) * 1.1, L = 48, R = 12, T = 16, B = 26; const X = (i: number) => L + i / (H.length - 1) * (W - L - R), Y = (v: number) => Ht - B - v / hi * (Ht - B - T);
    g.strokeStyle = '#e2e2dc'; g.fillStyle = '#666'; g.font = '10px system-ui'; g.textAlign = 'right'; g.lineWidth = 1;
    for (let k = 0; k <= 4; k++) { const v = hi * k / 4; g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(W - R, Y(v)); g.stroke(); g.fillText(num(Math.round(v)), L - 4, Y(v) + 3); }
    g.textAlign = 'center'; g.fillText(H.length - 1 + ' ' + tr('turns ago'), L + 12, Ht - 8); g.fillText(tr('last turn'), W - R - 18, Ht - 8);
    const line = (vals: number[], col: string, fill: boolean) => { if (fill) { g.fillStyle = col + '22'; g.beginPath(); g.moveTo(X(0), Y(0)); vals.forEach((v, i) => g.lineTo(X(i), Y(v))); g.lineTo(X(vals.length - 1), Y(0)); g.fill(); } g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); vals.forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))); g.stroke(); };
    if (prod) line(H.map(x => x.p), '#2e8b3a', true); line(H.map(x => x.s), '#1f4e8c', !prod);
  }
  const legend = h('div', { class: 'row small', style: 'gap:12px' }, prod ? h('span', null, h('span', { class: 'tag', style: 'background:#2e8b3a' }), ' ' + tr('Produced')) : null, h('span', null, h('span', { class: 'tag', style: 'background:#1f4e8c' }), ' ' + tr('Sold')), h('span', { class: 'muted' }, unit + ' per month'));
  return h('div', { class: 'col', style: 'gap:4px;margin-top:8px' }, h('div', { class: 'chartlabel' }, prod ? 'Production over time' : 'Sales over time'), cv, legend);
}
/** A shop's customers: the people living in the tiles it reaches, what each shelf sold them, and the rival shops that share them. */
function storeCustomers(b: Building): HTMLElement {
  const v = S.view!, wd = S.world!, ctx = tileCtx(); const R = shopReach(b); const x0 = b.idx % wd.w, y0 = Math.floor(b.idx / wd.w);
  let down = 0, sub = 0, tiles = 0;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const x = x0 + dx, y = y0 + dy; if (x < 0 || y < 0 || x >= wd.w || y >= wd.h) continue; const i = y * wd.w + x, ch = wd.tiles[i]; if (!'ulhsw'.includes(ch)) continue; const p = tilePop(ctx, i); tiles++; if (ch === 's' || ch === 'w') sub += p; else down += p; }
  const rivals = v.others.filter(o => o.type === 'store' && !o.building && Math.abs((o.idx % wd.w) - x0) <= R + shopReach(o) && Math.abs(Math.floor(o.idx / wd.w) - y0) <= R + shopReach(o));
  const mine = v.buildings.filter(o => o.type === 'store' && o.id !== b.id && !o.building && Math.abs((o.idx % wd.w) - x0) <= R + shopReach(o) && Math.abs(Math.floor(o.idx / wd.w) - y0) <= R + shopReach(o));
  const shelves = b.slots.filter(x => x.product);
  return h('div', { class: 'col', style: 'gap:10px;max-width:640px' },
    h('div', { class: 'pgroup' }, h('div', { class: 'pg-t' }, 'Customers: people this shop reaches'),
      h('div', { class: 'fgrid' }, h('div', { class: 'fld' }, h('div', { class: 'fl' }, 'People in reach'), h('div', { class: 'fv' }, num(down + sub))), h('div', { class: 'fld' }, h('div', { class: 'fl' }, 'Downtown'), h('div', { class: 'fv' }, num(down))),
        h('div', { class: 'fld' }, h('div', { class: 'fl' }, 'Suburbs & towns'), h('div', { class: 'fv' }, num(sub))), h('div', { class: 'fld' }, h('div', { class: 'fl' }, 'City tiles'), h('div', { class: 'fv' }, tiles + ' in ' + (R * 2 + 1) + '×' + (R * 2 + 1))))),
    shelves.length ? h('table', null, h('thead', null, h('tr', null, ['Product', 'Price', 'Sold', 'Unmet demand', 'Revenue'].map((x, i) => h('th', { class: i ? 'num' : '' }, x)))),
      h('tbody', null, shelves.map(sl => h('tr', null, h('td', null, prodImg(sl.product!, 28, 18, 'margin-right:6px'), PRODUCTS[sl.product!].name), h('td', { class: 'num' }, money2(sl.price)), h('td', { class: 'num' }, num(sl.sold)), h('td', { class: 'num ' + (sl.lost > 0 ? 'bad' : 'muted') }, num(sl.lost)), h('td', { class: 'num' }, money(sl.revenue)))))) : h('div', { class: 'note' }, 'No product on the shelves yet.'),
    h('div', { class: 'chartlabel' }, 'Other shops sharing these customers (' + (rivals.length + mine.length) + ')'),
    rivals.length + mine.length ? h('table', { class: 'stats' }, h('tbody', null, [...mine.map(o => ({ o, mine: true })), ...rivals.map(o => ({ o, mine: false }))].map(({ o }) => { const co = companyOf(o.owner);
      return h('tr', { class: 'clickable', title: 'Show on the map', onclick: () => { S.city = o.city; S.sel = o.idx; S.buildingId = o.owner === v.me.id ? o.id : null; S.render(); } }, h('th', null, h('span', { class: 'tag', style: 'background:' + (co?.color ?? '#888') }), ' ' + o.name), h('td', null, o.owner === v.me.id ? 'yours' : co?.name ?? '?')); }))) : h('div', { class: 'note' }, 'No other shop reaches these people.'),
    h('div', { class: 'note' }, 'Shoppers are the people living on the downtown, suburb and town tiles within reach of the shop (supermarkets reach further, mall units furthest). Each tile buys from the shops that reach it, in proportion to price, quality, brand and staffing. "Unmet demand" is what the shelf could not supply.'));
}
/** SUPPLIES tab: to whom this facility provides goods (buildings that took it as a source, supply contracts, open market sales). */
function suppliesTab(b: Building): HTMLElement {
  if (b.type === 'store') return storeCustomers(b);
  return h('div', { class: 'col', style: 'gap:8px;max-width:640px' }, suppliesBox(b.id, b) ?? h('div', { class: 'note' }, 'Nothing to show.'),
    h('div', { class: 'note' }, 'A shop, a factory import cell or a farm lists this facility as its supplier when you pick it as the source there. Supply contracts you have signed from here are listed too. Click a row to see the customer on the map.'));
}
/** Quality of what the building made, month by month (0-100). */
function qualityChart(b: Building): HTMLElement {
  const H = (b.prodHist ?? []).map(x => x.q ?? null); const pts = H.filter((x): x is number => x != null); const W = 560, Ht = 150; const cv = crisp(h('canvas', { style: 'display:block;background:#fff;border:1px solid #b9b9b0;max-width:100%' }), W, Ht); const g = cv.getContext('2d')!;
  if (pts.length < 2) { g.fillStyle = '#888'; g.font = '12px system-ui'; g.fillText(tr('Play a few turns to see history.'), 12, Ht / 2); }
  else {
    const L = 48, R = 12, T = 12, B = 24; const X = (i: number) => L + i / (H.length - 1) * (W - L - R), Y = (v: number) => Ht - B - v / 100 * (Ht - B - T);
    g.strokeStyle = '#e2e2dc'; g.fillStyle = '#666'; g.font = '10px system-ui'; g.textAlign = 'right'; g.lineWidth = 1;
    for (const v of [0, 25, 50, 75, 100]) { g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(W - R, Y(v)); g.stroke(); g.fillText(String(v), L - 4, Y(v) + 3); }
    g.textAlign = 'center'; g.fillText(H.length - 1 + ' ' + tr('turns ago'), L + 12, Ht - 8); g.fillText(tr('last turn'), W - R - 18, Ht - 8);
    g.strokeStyle = '#8e5ab8'; g.lineWidth = 2; g.beginPath(); let pen = false; H.forEach((v, i) => { if (v == null) { pen = false; return; } if (pen) g.lineTo(X(i), Y(v)); else { g.moveTo(X(i), Y(v)); pen = true; } }); g.stroke();
    g.fillStyle = '#8e5ab8'; H.forEach((v, i) => { if (v != null) { g.beginPath(); g.arc(X(i), Y(v), 2.5, 0, 7); g.fill(); } });
  }
  return h('div', { class: 'col', style: 'gap:4px;margin-top:8px' }, h('div', { class: 'chartlabel' }, 'Quality over time'), cv, h('div', { class: 'row small', style: 'gap:12px' }, h('span', null, h('span', { class: 'tag', style: 'background:#8e5ab8' }), ' ' + tr('Quality')), h('span', { class: 'muted' }, '0–100, of what was made each month')));
}
function reportTab(b: Building): HTMLElement {
  const r = b.report; const res = r.revenue - r.purchases - r.wages - r.maint; const prod = b.type !== 'store' && b.type !== 'rd' && b.type !== 'mall';
  return h('div', null, h('div', { class: 'kv2' },
    prod && h('label', null, 'Produced') as any, prod && h('div', null, num(r.produced, 1)) as any,
    h('label', null, 'Revenue'), h('div', null, money(r.revenue)), h('label', null, 'Purchases'), h('div', null, money(r.purchases)),
    h('label', null, 'Wages + upkeep'), h('div', null, money(r.wages + r.maint)), h('label', null, 'Operating result'), h('div', { class: cls(res) }, money(res))),
    productionChart(b, prod),
    prod ? qualityChart(b) : null,
    unitCosts(b),
    r.note ? h('div', { class: 'note' }, r.note) : null);
}

// ---------- Factory facility layout designer (3x3 cells, clickable connections between cells)
let selCell = -1, selBuilding = '';
const CELL = 78, GAP = 26;
const compact = (n: number) => n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n));
const CELL_NAME: Record<string, string> = { line: 'Production', robot: 'Robotics', warehouse: 'Warehouse', import: 'Import', brand: 'Branding', rd: 'R&D', qa: 'Quality', export: 'Export' };
const shortName = (p?: ProductId) => (p ? PRODUCTS[p].name.slice(0, 9) : '?');
/** Product of a warehouse / export / import cell: shown as text when its links imply exactly one option, otherwise a choice among the products the links offer. */
function cellPicker(b: Building, i: number): HTMLElement {
  const c = b.layout![i]; const cands = cellCandidates(b, i);
  if (c.auto && c.product && cands.length === 1) return h('span', null, h('b', null, PRODUCTS[c.product].name), ' ', h('span', { class: 'muted' }, '(from its links)'));
  if (c.m === 'warehouse' && !cands.length) return c.product ? h('span', null, h('b', null, PRODUCTS[c.product].name), ' ', h('span', { class: 'bad' }, '(no arrow brings it any more: it empties, then frees up)')) : h('span', { class: 'muted' }, 'draw an arrow into it first: from an import cell or a production line');
  const ids = (cands.length || c.m === 'warehouse' ? [...cands] : PRODUCT_LIST.map(p => p.id)); if (c.product && !ids.includes(c.product)) ids.push(c.product); // a warehouse only offers what its links bring
  const sel = h('select', null, h('option', { value: '' }, cands.length > 1 ? 'choose (' + cands.length + ' options)' : cands.length ? 'auto' : 'draw an arrow into it first'), ids.map(p => h('option', { value: p, selected: p === c.product }, PRODUCTS[p].name)));
  if (!c.product) sel.value = '';
  sel.addEventListener('change', () => act({ type: 'setCell', id: b.id, cell: i, product: (sel.value || null) as ProductId | null }));
  return sel;
}

/** The state of the link between cells i < j: an arrow i->j ('ab'), j->i ('ba'), a plain support link, or none. */
function linkState(b: Building, i: number, j: number): 'ab' | 'ba' | 'plain' | 'none' {
  if (flowsTo(b, i, j)) return 'ab'; if (flowsTo(b, j, i)) return 'ba'; return b.links?.includes(linkKey(i, j)) ? 'plain' : 'none';
}
/** What one click does: none -> an arrow one way -> the arrow the other way (if the cells allow it) -> none. */
function nextLink(b: Building, i: number, j: number): 'ab' | 'ba' | 'plain' | 'none' {
  const L = b.layout!; const fw = canFlow(L[i].m, L[j].m), bw = canFlow(L[j].m, L[i].m); const cur = linkState(b, i, j);
  if (cur === 'none') return fw ? 'ab' : bw ? 'ba' : 'plain';
  if (cur === 'ab') return bw ? 'ba' : 'none'; return 'none';
}
function layoutTab(b: Building): HTMLElement {
  if (selBuilding !== b.id) { selBuilding = b.id; selCell = -1; }
  const L = b.layout ?? []; const st = moduleStats(b); const NG = gridN(b), SZ = NG * CELL + (NG - 1) * GAP; // 2x2 downtown, 3x3 suburb, 4x4 elsewhere
  const cv = crisp(h('canvas', { style: 'cursor:pointer;background:#e9e6dc;flex:none;outline:2px inset #8a8470;margin:2px' }), SZ, SZ); // fixed size, never scaled by CSS: crisp text and exact hit-testing
  const g = cv.getContext('2d')!; let hovCell = -1, hovEdge = '';
  const pos = (i: number) => ({ x: (i % NG) * (CELL + GAP), y: Math.floor(i / NG) * (CELL + GAP) });
  const canLink = (i: number, j: number) => linkable(L[i].m, L[j].m);
  const edges: [number, number][] = []; for (let i = 0; i < NG * NG; i++) { if (i % NG < NG - 1) edges.push([i, i + 1]); if (i + NG < NG * NG) edges.push([i, i + NG]); const cx = i % NG, cy = Math.floor(i / NG); if (cx < NG - 1 && cy < NG - 1) edges.push([i, i + NG + 1]); if (cx > 0 && cy < NG - 1) edges.push([i, i + NG - 1]); }
  const edgeRect = (i: number, j: number) => { const p = pos(i); return j === i + 1 ? { x: p.x + CELL, y: p.y + CELL * 0.2, w: GAP, h: CELL * 0.6 } : { x: p.x + CELL * 0.2, y: p.y + CELL, w: CELL * 0.6, h: GAP }; };
  const warn = cellWarnings(b, S.view!.cities);
  const draw = () => {
    g.clearRect(0, 0, SZ, SZ);
    for (const [i, j] of edges) {
      const st2 = linkState(b, i, j), can = canLink(i, j), hov = hovEdge === linkKey(i, j); const diag = j - i !== 1 && j - i !== NG; const on = st2 !== 'none';
      const col = on ? '#e08a1e' : hov && can ? 'rgba(224,138,30,.6)' : can ? 'rgba(120,110,80,.30)' : 'rgba(120,110,80,.10)';
      // end points of the connection between the two cells, in the gap that separates them
      const pa = pos(i), pb = pos(j); let x1: number, y1: number, x2: number, y2: number;
      if (diag) { if (j - i === NG + 1) { x1 = pa.x + CELL; y1 = pa.y + CELL; x2 = pb.x; y2 = pb.y; } else { x1 = pa.x; y1 = pa.y + CELL; x2 = pb.x + CELL; y2 = pb.y; } }
      else if (j === i + 1) { x1 = pa.x + CELL; y1 = pa.y + CELL / 2; x2 = pb.x; y2 = pb.y + CELL / 2; } else { x1 = pa.x + CELL / 2; y1 = pa.y + CELL; x2 = pb.x + CELL / 2; y2 = pb.y; }
      const dir = st2 === 'ba' ? -1 : 1; const [fx, fy, tx, ty] = dir > 0 ? [x1, y1, x2, y2] : [x2, y2, x1, y1];
      g.strokeStyle = col; g.fillStyle = col; g.lineCap = 'round'; g.lineWidth = on ? 3.5 : hov && can ? 3 : 2; g.beginPath(); g.moveTo(fx, fy); g.lineTo(tx, ty); g.stroke(); g.lineCap = 'butt';
      if (st2 === 'ab' || st2 === 'ba' || (hov && can)) { // arrowhead at the receiving end (a hovered, unlinked edge previews the next arrow)
        const nx = hov && !on ? (canFlow(L[i].m, L[j].m) ? 1 : -1) : dir; const [ax, ay, bx, by] = nx > 0 ? [x1, y1, x2, y2] : [x2, y2, x1, y1]; const ang = Math.atan2(by - ay, bx - ax), hl = 9;
        if (on || (canFlow(L[i].m, L[j].m) || canFlow(L[j].m, L[i].m))) { g.beginPath(); g.moveTo(bx, by); g.lineTo(bx - hl * Math.cos(ang - 0.45), by - hl * Math.sin(ang - 0.45)); g.lineTo(bx - hl * Math.cos(ang + 0.45), by - hl * Math.sin(ang + 0.45)); g.closePath(); g.fill(); }
      } else if (st2 === 'plain') { g.fillStyle = '#fff'; g.beginPath(); g.arc((x1 + x2) / 2, (y1 + y2) / 2, 3, 0, 7); g.fill(); }
    }
    for (let i = 0; i < NG * NG; i++) {
      const { x, y } = pos(i), cell = L[i], m = cell.m;
      g.fillStyle = '#ded9c8'; g.fillRect(x, y, CELL, CELL);
      if (m) {
        const idle = st.idle.includes(i);
        g.globalAlpha = idle ? 0.4 : 1; g.fillStyle = MODULES[m].color; g.fillRect(x + 4, y + 4, CELL - 8, CELL - 8); g.globalAlpha = 1;
        g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; const cx = x + CELL / 2;
        g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x + 4, y + 4, CELL - 8, 15); g.fillStyle = '#fff'; g.font = 'bold 10px system-ui'; g.fillText(CELL_NAME[m] ?? MODULES[m].name, cx, y + 12); // name on top
        // three lines of the facts that matter for this kind of cell (the title already says what it is), then a bar
        const rows: [string, string?][] = []; const bars: { f: number; col: string }[] = [];
        const pname = cell.product ? PRODUCTS[cell.product].name : '';
        const srcName = (src?: string) => { if (!src) return ''; if (src.startsWith('harbour:')) return '⚓ ' + (S.view!.cities[+src.slice(8)]?.name ?? 'harbour'); const id = src.split('#')[0]; const o = S.view!.buildings.find(x => x.id === id); if (o) return 'own ' + BUILDINGS[o.type].name.toLowerCase(); const r = S.view!.others.find(x => x.id === id); return r ? (companyOf(r.owner)?.name ?? 'rival') : 'supplier'; };
        if (m === 'line') {
          const cp = lineCap(b, i), made = cell.made ?? 0, e = cell.effort ?? 100, rate = cell.rate ?? 100;
          rows.push([pname || '(no product)'], [compact(made) + ' / ' + compact(cp) + (rate < 100 ? ' (≤' + rate + '%)' : ' a month')], [(made > 0 ? 'quality ' + Math.round(cell.madeQ ?? 0) : 'quality –') + (e !== 100 ? ' · ' + e + '%' : ''), e > 100 ? '#ffe28a' : undefined]);
          bars.push({ f: cp ? Math.min(1, made / cp) : 0, col: '#9be08a' });
        } else if (m === 'import' || m === 'warehouse' || m === 'export') {
          const cap = m === 'export' ? exportCap(b, i) : m === 'warehouse' ? whCap(b, i) : impCap(b, i), q = cell.stock?.qty ?? 0, moved = cell.moved ?? 0;
          rows.push([pname || '(none)'], [cell.product ? compact(q) + ' / ' + compact(cap) + ' stored' : 'pick a product']);
          if (m === 'import') rows.push(cell.product ? (cell.source ? [srcName(cell.source) + (moved > 0.5 ? ' +' + compact(moved) : '')] : ['no source!', '#ffb3a8']) : ['']);
          else if (m === 'warehouse') rows.push([moved > 0.5 ? '+' + compact(moved) + ' last month' : 'nothing moved in']);
          else rows.push([cell.listPrice != null ? 'sells ' + money2(cell.listPrice) : cell.world ? 'to world market' : 'own use only']);
          bars.push({ f: cap ? Math.min(1, q / cap) : 0, col: '#ffe9a8' });
        } else {
          const n = cellNeed(b, i), w = cell.workers ?? 0, r = staffRatio(b, i), idleNow = st.idle.includes(i);
          const effect = m === 'robot' ? 'fewer workers' : m === 'qa' ? '+' + Math.round(3 * r) + ' quality' : m === 'brand' ? 'builds brand' : m === 'rd' ? 'raises tech' : '';
          rows.push([idleNow ? 'not linked to a line' : effect, idleNow ? '#ffb3a8' : undefined], ['crew ' + w + ' / ' + n], [Math.round(r * 100) + '% strength']);
          bars.push({ f: Math.min(1, r), col: '#8ab8ff' });
        }
        rows.forEach(([t, col], k) => { g.font = k === 0 ? 'bold 10px system-ui' : '9px system-ui'; g.fillStyle = col ?? '#fff'; g.fillText(t, cx, y + 31 + k * 12, CELL - 10); }); g.fillStyle = '#fff';
        bars.forEach((br, k) => { const by = y + CELL - 7 - (bars.length - k) * 7 + 2; g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(x + 8, by, CELL - 16, 6); g.fillStyle = br.col; g.fillRect(x + 8, by, (CELL - 16) * br.f, 6); });
        if (warn[i]?.length) { // warning sign: the cell cannot operate properly
          const wx = x + CELL - 17, wy = y + 21; g.fillStyle = '#ffd400'; g.strokeStyle = '#7a1d12'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(wx + 8, wy); g.lineTo(wx + 16, wy + 14); g.lineTo(wx, wy + 14); g.closePath(); g.fill(); g.stroke();
          g.fillStyle = '#7a1d12'; g.font = 'bold 11px system-ui'; g.textAlign = 'center'; g.fillText('!', wx + 8, wy + 11); g.fillStyle = '#fff';
        }
        if (idle) { g.strokeStyle = '#b3261e'; g.lineWidth = 2; g.setLineDash([4, 3]); g.strokeRect(x + 4, y + 4, CELL - 8, CELL - 8); g.setLineDash([]); }
      }
      g.strokeStyle = i === selCell ? '#ffd400' : i === hovCell ? '#1f4e8c' : 'rgba(0,0,0,.3)'; g.lineWidth = i === selCell ? 4 : i === hovCell ? 3 : 1; g.strokeRect(x + .5, y + .5, CELL - 1, CELL - 1);
    }
  };
  draw();
  const hit = (e: MouseEvent): { cell: number; edge: [number, number] | null } => {
    const r = cv.getBoundingClientRect(); const px = (e.clientX - r.left) * SZ / r.width, py = (e.clientY - r.top) * SZ / r.height;
    const col = Math.min(NG - 1, Math.floor(px / (CELL + GAP))), row = Math.min(NG - 1, Math.floor(py / (CELL + GAP)));
    const ox = px - col * (CELL + GAP), oy = py - row * (CELL + GAP), i = row * NG + col;
    if (ox <= CELL && oy <= CELL) return { cell: i, edge: null };
    if (ox > CELL && oy <= CELL && col < NG - 1) return { cell: -1, edge: [i, i + 1] };
    if (oy > CELL && ox <= CELL && row < NG - 1) return { cell: -1, edge: [i, i + NG] };
    if (ox > CELL && oy > CELL && col < NG - 1 && row < NG - 1) { const u = ox - CELL, w = oy - CELL; return Math.abs(u - w) <= Math.abs(u + w - GAP) ? { cell: -1, edge: [i, i + NG + 1] } : { cell: -1, edge: [i + 1, i + NG] }; }
    return { cell: -1, edge: null };
  };
  cv.addEventListener('mousemove', e => { const hh = hit(e); const he = hh.edge ? linkKey(hh.edge[0], hh.edge[1]) : ''; if (hh.cell !== hovCell || he !== hovEdge) { hovCell = hh.cell; hovEdge = he; draw(); } });
  cv.addEventListener('mouseleave', () => { hovCell = -1; hovEdge = ''; draw(); });
  cv.addEventListener('click', e => {
    const hh = hit(e);
    if (hh.edge) { const [i, j] = hh.edge; if (!canLink(i, j)) return; act({ type: 'setLink', id: b.id, a: i, b: j, dir: nextLink(b, i, j) }); return; } // click: arrow one way, then the other way, then none
    if (hh.cell < 0) return; selCell = hh.cell; S.render();
  });

  // selected cell configuration
  let cfg: HTMLElement | null = null; const cell = selCell >= 0 ? L[selCell] : undefined; const v0 = S.view!;
  const workerRow = () => { const cell = L[selCell]; const n = cellNeed(b, selCell); return h('div', { class: 'row' }, 'Workers', h('b', null, String(cell.workers ?? 0)), h('span', { class: (cell.workers ?? 0) < n ? 'bad' : 'muted' }, 'needs ' + n + ' · cap ' + staffCap(n)), n ? people(cell.workers ?? 0, n, w => act({ type: 'setCellStaff', id: b.id, cell: selCell, workers: w })) : ''); };
  if (cell && cell.m === 'export') {
    const sel = cellPicker(b, selCell);
    const cap = exportCap(b, selCell), q = cell.stock?.qty ?? 0, pd = cell.product ? PRODUCTS[cell.product] : null, ref = pd ? pd.basePrice * v0.market[cell.product!].idx : 0;
    cfg = h('div', { class: 'cellcfg' }, h('b', null, 'Cell #' + (selCell + 1) + ' · export / dispatch'), h('div', { class: 'row' }, 'Exports', sel, pd ? null : h('span', { class: 'bad' }, '⚠ draw an arrow into it from a line, warehouse or import cell')),
      pd ? h('div', { class: 'note' }, 'Stock ' + num(q) + ' / ' + num(cap) + ' ' + pd.unit + ' · quality ' + (cell.stock?.q ?? 0).toFixed(0) + '. Filled monthly from linked lines (their spare capacity), warehouses (their stock) and import cells of this product. Pick it as the source in your other facilities and shops to transport it there.') : null,
      pd ? h('div', { class: 'row' }, h('span', { style: 'min-width:140px' }, 'Sell to everyone'), h('input', { type: 'checkbox', checked: cell.listPrice != null, onchange: (e: Event) => act({ type: 'setCell', id: b.id, cell: selCell, price: (e.target as HTMLInputElement).checked ? +ref.toFixed(2) : null }) }),
        cell.listPrice != null ? numInput(cell.listPrice, p => act({ type: 'setCell', id: b.id, cell: selCell, price: p }), { step: 0.5, min: 0.01, style: 'width:80px' }) : null, h('span', { class: 'muted' }, 'ref ' + money2(ref))) : null,
      pd ? h('div', { class: 'row' }, h('span', { style: 'min-width:140px' }, 'Sell to world market'), h('input', { type: 'checkbox', checked: !!cell.world, onchange: (e: Event) => act({ type: 'setWorldSell', id: b.id, cell: selCell, on: (e.target as HTMLInputElement).checked }) }), h('span', { class: 'muted' }, '~' + money2(worldPrice(v0 as any, cell.product!)) + ' for what nobody buys')) : null,
      workerRow());
  } else if (cell && cell.m === 'warehouse') {
    const sel = cellPicker(b, selCell);
    const cap = whCap(b, selCell), q = cell.stock?.qty ?? 0, pu = cell.product ? PRODUCTS[cell.product].unit : '';
    cfg = h('div', { class: 'cellcfg' }, h('b', null, 'Cell #' + (selCell + 1) + ' · warehouse'), h('div', { class: 'row' }, 'Stores', sel, cell.product ? null : h('span', { class: 'bad' }, '⚠ draw an arrow into it from a cell that supplies a product')),
      h('div', { class: 'note' }, cell.product ? 'Stock ' + num(q) + ' / ' + num(cap) + ' ' + pu + ' · quality ' + (cell.stock?.q ?? 0).toFixed(0) + '. One product per warehouse; changing it empties the stock. Link it to an import cell of that product so it buys ahead with spare capacity; draw an arrow from the line making the final product into it to store finished goods (the output of the line is shared equally between the warehouses and export cells it points at); link it to an export cell to ship the stock out.' : 'A warehouse holds exactly one product. Link it to an import cell of that product to stockpile it.'), (cell.stock?.qty ?? 0) > 0.5 ? h('button', { class: 'mini danger', onclick: () => { if (confirm('Throw away ' + num(cell.stock!.qty) + ' ' + (cell.product ? PRODUCTS[cell.product].unit + ' of ' + PRODUCTS[cell.product].name : 'units') + '? The goods are lost.')) act({ type: 'setCell', id: b.id, cell: selCell, discard: true }); } }, '🗑 Throw away the stock') : null, workerRow());
  } else if (cell && cell.m && cell.m !== 'line' && cell.m !== 'import') cfg = h('div', { class: 'cellcfg' }, h('b', null, 'Cell #' + (selCell + 1) + ' · ' + MODULES[cell.m].name), workerRow());
  if (cell && (cell.m === 'line' || cell.m === 'import')) {
    if (cell.m === 'line') {
      const sel = productSelect(PRODUCT_LIST.filter(p => p.kind !== 'raw').map(p => p.id), cell.product ?? b.product!, p => act({ type: 'setCell', id: b.id, cell: selCell, product: p }), true);
      const rec = cell.product ? Object.entries(PRODUCTS[cell.product].recipe).map(([k, q]) => q + ' ' + PRODUCTS[k as ProductId].name).join(' + ') : '';
      const e = cell.effort ?? 100, rate = cell.rate ?? 100, fe = effortFx(e), P = cell.product ? PRODUCTS[cell.product] : null;
      const uc = cell.product ? unitCost(b, cell.product) : null; const ucE = uc ? uc.materials * fe.inputs + uc.labour / fe.speed : 0;
      cfg = h('div', { class: 'cellcfg' }, h('b', null, 'Cell #' + (selCell + 1) + ' · production line'), h('div', { class: 'row' }, 'Makes', sel), h('div', { class: 'note' }, 'needs per unit: ' + (rec || '—')),
        h('div', { class: 'row' }, h('span', { style: 'min-width:110px' }, 'Output limit'), squares(rate, 0, 100, 10, r => act({ type: 'setCell', id: b.id, cell: selCell, rate: r }), () => '#2e8b3a', 'Output limit: click a square'), h('b', null, rate + '%'), h('span', { class: 'muted' }, 'of capacity')),
        h('div', { class: 'row' }, h('span', { style: 'min-width:110px' }, 'Quality effort'), squares(e, EFFORT_MIN - 10, EFFORT_MAX, 10, x => act({ type: 'setCell', id: b.id, cell: selCell, effort: Math.max(EFFORT_MIN, x) }), v => v > 100 ? '#d9a400' : v === 100 ? '#2e8b3a' : '#6b8fc4', 'Quality effort: click a square (the green one is normal)'), h('b', null, e + '%'),
          h('span', { class: 'muted' }, (fe.q >= 0 ? '+' : '') + Math.round(fe.q) + ' quality · ' + Math.round(fe.inputs * 100) + '% ingredients · ' + Math.round(fe.speed * 100) + '% speed')),
        P ? h('div', { class: 'note' }, 'Last month: made ' + num(cell.made ?? 0) + ' of ' + num(lineCap(b, selCell)) + ' ' + P.unit + ((cell.made ?? 0) > 0 ? ' at quality ' + Math.round(cell.madeQ ?? 0) : '') + ' · cost about ' + money2(ucE) + ' per ' + P.unit + ' at this effort (ref. price ' + money2(P.basePrice * v0.market[cell.product!].idx) + ').') : null,
        workerRow());
    } else {
      const sel = cellPicker(b, selCell);
      cfg = h('div', { class: 'cellcfg' }, h('b', null, 'Cell #' + (selCell + 1) + ' · import'), h('div', { class: 'row' }, 'Imports', sel, cell.product ? sourceSelect(b, cell.product, cell.source ?? '', src => act({ type: 'setCell', id: b.id, cell: selCell, source: src })) : ''),
        cell.product ? h('div', { class: 'note' }, 'Buffer ' + num(cell.stock?.qty ?? 0) + ' / ' + num(impCap(b, selCell)) + ' ' + PRODUCTS[cell.product].unit + ' · quality ' + (cell.stock?.q ?? 0).toFixed(0) + '. A small stock bought ahead with spare buying capacity; lines use it first. A warehouse keeps forty times as much.') : h('div', { class: 'note' }, 'Link this cell to a production line (or pick a product) to choose the source.'), workerRow());
    }
  }
  const nm = (i: number) => '#' + (i + 1) + ' ' + (L[i].m ? MODULES[L[i].m!].name + (L[i].product ? ' (' + PRODUCTS[L[i].product!].name + ')' : '') : '');
  if (cell && cell.m) {
    const nbs = adj8(selCell, NG).filter(j => L[j].m && isLinked(b, selCell, j)); const fromN = incoming(b, selCell).filter(j => L[j].m), toN = outgoing(b, selCell).filter(j => L[j].m), plainN = nbs.filter(j => !fromN.includes(j) && !toN.includes(j));
    const n = cellNeed(b, selCell), ratio = staffFactor(cell.workers ?? 0, n), idle = st.idle.includes(selCell);
    const info = h('div', { class: 'cellinfo' },
      h('div', { class: 'note' }, MODULES[cell.m].desc),
      h('div', { class: 'small' }, h('b', null, 'Receives from: '), fromN.length ? fromN.map(nm).join(', ') : h('span', { class: 'muted' }, 'nothing')),
      h('div', { class: 'small' }, h('b', null, 'Sends to: '), toN.length ? toN.map(nm).join(', ') : h('span', { class: 'muted' }, 'nothing')),
      plainN.length ? h('div', { class: 'small' }, h('b', null, 'Linked to: '), plainN.map(nm).join(', ')) : null,
      !nbs.length ? h('div', { class: 'small muted' }, 'Click the gap between two cells: one click draws an arrow one way, another click the other way, a third removes it.') : null,
      warn[selCell]?.length ? h('div', { class: 'warnbox' }, warn[selCell].map(m => h('div', null, '⚠ ' + m))) : null,
      n ? h('div', { class: 'small ' + (ratio < 0.99 ? 'bad' : 'good') }, 'Staffing strength ' + Math.round(ratio * 100) + '%') : null,
      idle ? h('div', { class: 'bad small' }, '⚠ Idle: this module only works when linked to a production line.') : null);
    cfg!.append(info,
      h('button', { class: 'mini danger', style: 'margin-top:6px', onclick: () => { const i = selCell; act({ type: 'setModule', id: b.id, cell: i, module: null }); } }, 'Remove cell (refund ' + money(Math.round(MODULES[cell.m].cost * 0.4)) + ')'));
  } else if (cell) {
    cfg = h('div', { class: 'cellcfg' }, h('b', null, 'Cell #' + (selCell + 1) + ' · empty'), h('div', { class: 'note' }, 'Choose what to build here:'),
      h('div', { class: 'col', style: 'gap:3px' }, Object.values(MODULES).map(m => {
        const cnt = L.filter(x => x.m === m.type).length, full = cnt >= m.max;
        return h('button', { class: 'mini modbtn', disabled: full, title: m.desc, onclick: () => act({ type: 'setModule', id: b.id, cell: selCell, module: m.type }) },
          h('span', { class: 'tag', style: 'background:' + m.color }), h('b', null, m.name), ' ', h('span', { class: 'muted' }, cnt + '/' + m.max + ' · ' + money(m.cost)), h('div', { class: 'note', style: 'text-align:left' }, m.desc));
      })));
  }
  const issues = layoutIssues(b, S.view!.cities);
  return h('div', { class: 'row', style: 'align-items:flex-start;flex-wrap:nowrap;gap:14px' }, cv,
    h('div', { class: 'col', style: 'gap:6px;min-width:0;flex:1' }, cfg ?? h('div', { class: 'note' }, 'Click a cell to see its info or build in it. Click the bars between neighbouring cells (or the diagonals in the corners) to link them: an import cell or a line then passes its product on to the linked line.'),
      issues.length ? h('div', { class: 'bad small' }, issues.map(m => h('div', null, '⚠ ' + m))) : h('div', { class: 'good small' }, '✓ All lines are supplied.'),
      h('div', { class: 'note' }, st.lines + ' lines (' + st.final + ' final) · ' + Math.round(st.robots * 10) / 10 + ' robots · ' + st.warehouse + ' warehouses · ' + st.imports + ' imports · ' + st.brand + ' branding · ' + st.rd + ' R&D · ' + st.qa + ' QA')));
}
