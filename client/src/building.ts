// "Selected tile configuration" for an owned building: compact tabbed panel.
import { OVERSTAFF_CAP, OVERSTAFF_BONUS, BUILDINGS, PRODUCTS, PRODUCT_LIST, MAX_LINES, MAX_AUTO, MAX_STORE_SIZE, MODULES, FAC_GRID, MALL_UNITS, MALL_MIN_BRAND, MALL_LEASE, type ProductId, type ModuleType } from '../../shared/data.js';
import { requiredWorkers, capacity, slotCapacity, moduleStats, layoutIssues, isLinked, linkKey, cellNeed, adj8, linkable, staffFactor, staffCap, whCap, exportCap, cellCandidates, worldPrice, worldVolume, isUnlocked, canResearch, researchOf, UNLOCK_RATE } from '../../shared/engine.js';
import type { Building } from '../../shared/types.js';
import { areaInfo, AREA_R, haulCost, haulPath, cityTile, HAUL_RAIL, HAUL_ROAD, HAUL_OFF } from '../../shared/engine.js';
import { h, money, money2, num, cls, asset } from './util.js';
import { S, act, companyOf } from './state.js';
import { rentControls } from './realestate.js';

const numInput = (value: number, onchange: (v: number) => void, attrs: Record<string, any> = {}) => {
  const el = h('input', { type: 'number', value, ...attrs });
  el.addEventListener('change', () => onchange(+el.value));
  return el;
};

/** Explicit supply source: a harbour (import) or a factory (own, or one that sells to everyone). Nothing is bought without one. */
function sourceSelect(b: Building, product: ProductId, current: string, onchange: (v: string) => void) {
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
  if (harbours.length) sel.append(h('optgroup', { label: 'Harbours that stock it (imports)' }, harbours));
  const own = v.buildings.filter(o => o.product === product && o.id !== b.id && o.type !== 'store' && o.type !== 'rd')
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
    : b.type === 'factory' ? ['Production', 'Layout', 'Inputs', 'Staff', 'Report']
    : b.type === 'store' ? ['Shelves', 'Staff', 'Report']
      : b.type === 'rd' ? ['Research', 'Staff', 'Report']
        : ['Production', 'Staff', 'Report'];

/** Toggle that paints the haul-cost field of this facility on the map. */
function costToggle(b: Building): HTMLElement | null {
  if (b.type === 'mall') return null;
  return h('div', null,
    h('label', { class: 'costtoggle', title: 'Paint on the map what it costs to haul goods to this facility from every tile' },
      h('input', { type: 'checkbox', checked: S.costField === b.id, onchange: (e: Event) => { S.costField = (e.target as HTMLInputElement).checked ? b.id : null; S.render(); } }),
      ' Show transport cost field', h('span', { class: 'muted small' }, `  (path cost per tile: rail ${HAUL_RAIL}, road ${HAUL_ROAD}, nothing ${HAUL_OFF})`)),
    h('label', { class: 'costtoggle', title: 'Draw the cheapest route from every chosen supplier to this facility' },
      h('input', { type: 'checkbox', checked: S.showRoutes, onchange: (e: Event) => { S.showRoutes = (e.target as HTMLInputElement).checked; S.render(); } }),
      ' Show transport routes from the chosen sources'));
}
/** What the 5x5 surroundings of a tile would do for a building of this type (also used to preview a build site). */
export function areaLine(type: string, idx: number, prefix = true): HTMLElement | null {
  const v = S.view!; if (!S.world || type === 'mall') return null;
  const a = areaInfo({ cities: v.cities, world: S.world }, { type, idx }); const side = AREA_R * 2 + 1;
  const what = a.kind === 'pop' ? num(a.pop) + ' inhabitants' : a.count + ' of ' + a.max + ' ' + ({ deposits: type === 'oil' ? 'oil field tiles' : 'ore deposit tiles', trees: 'forest tiles', farmland: 'farmland tiles' } as Record<string, string>)[a.kind];
  const gain = Math.round((a.factor - 1) * 100); const target = ({ factory: 'production', store: 'customers', rd: 'research', farm: 'harvest', forest: 'timber output', mine: 'ore output', oil: 'oil output' } as Record<string, string>)[type] ?? 'output';
  return h('div', { class: 'areachip' }, h('b', null, `Area ${side}×${side}: `), what + ' → ', h('b', { class: gain >= 0 ? 'good' : 'bad' }, (gain >= 0 ? '+' : '') + gain + '% ' + target),
    prefix ? h('span', { class: 'muted small' }, a.kind === 'pop' ? '  (more people around = better)' : '  (more of them around = better)') : null);
}
const areaChip = (b: Building) => areaLine(b.type, b.idx);
function constructionBanner(b: Building): HTMLElement | null {
  const mall = b.mall ? S.view!.malls.find(m => m.id === b.mall) : null;
  if (b.building) return h('div', { class: 'banner', style: 'background:#f5e6b8;color:#5a4300;padding:3px 8px' }, `🚧 Under construction: ${b.building} more month${b.building === 1 ? '' : 's'} before it starts operating.${b.type === 'mall' ? ' Tenants can already reserve units.' : ''}`);
  if (mall && mall.opensIn) return h('div', { class: 'banner', style: 'background:#f5e6b8;color:#5a4300;padding:3px 8px' }, `🚧 ${mall.name} opens in ${mall.opensIn} month${mall.opensIn === 1 ? '' : 's'}: your shop starts trading then. You can already set up the shelf.`);
  return null;
}
function mgrChip(b: Building): HTMLElement {
  const m = S.view!.me.staff?.find(p => p.assigned === b.id);
  const go = () => { S.tab = 'personnel'; S.render(); };
  if (!m) return h('div', { class: 'mgrchip muted small clickable', onclick: go }, '👤 No manager assigned — open Personnel');
  const f = m.spec === b.type ? 1 : 0.5;
  return h('div', { class: 'mgrchip small clickable', onclick: go, title: 'Open Personnel' },
    h('img', { src: asset(`person/${String(m.portrait).padStart(2, '0')}.png`) }),
    h('b', null, m.name), ` · manager${f === 1 ? ' (specialist)' : ''} · efficiency +${(1.5 * m.eff * f).toFixed(1)}% · output +${(2 * m.prod * f).toFixed(0)}% · costs −${(2 * m.exp * f).toFixed(0)}%`);
}
export function buildingPanel(b: Building): HTMLElement {
  const v = S.view!; const def = BUILDINGS[b.type];
  const tabs = tabsFor(b); const tab = tabs.includes(S.cfgTab) ? S.cfgTab : tabs[0];
  const sections: Record<string, () => HTMLElement> = {
    Production: () => productionTab(b), Layout: () => layoutTab(b), Inputs: () => inputsTab(b), Staff: () => staffTab(b), Report: () => reportTab(b),
    Shelves: () => shelvesTab(b), Units: () => mallTab(b), Research: () => researchTab(b),
  };
  return h('div', { class: 'cfg' },
    h('div', { class: 'cfghead' },
      h('b', null, b.name), h('span', { class: 'muted small' }, def.name + ' · ' + v.cities[b.city].name + ' · invested ' + money(b.invested)),
      h('span', { class: 'grow' }),
      h('button', { class: 'mini', title: 'Rename', onclick: () => { const n = prompt('Rename building', b.name); if (n) act({ type: 'rename', id: b.id, name: n }); } }, 'Rename'),
      h('button', { class: 'mini danger', title: 'Demolish', onclick: () => { if (confirm('Demolish ' + b.name + '? You recover ' + money(b.invested * 0.4) + '. The land stays yours.')) act({ type: 'sellBuilding', id: b.id }); } }, 'Demolish +' + money(b.invested * 0.4)),
      h('button', { class: 'mini', title: 'Close', onclick: () => { S.sel = null; S.buildingId = null; S.render(); } }, '✕')),
    constructionBanner(b),
    areaChip(b),
    costToggle(b),
    mgrChip(b),
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
      h('table', null, h('thead', null, h('tr', null, ['Slot', 'Facility', 'Needs', 'Workers', 'Crew', 'Strength'].map((x, i) => h('th', { class: i > 1 ? 'num' : '' }, x)))),
        h('tbody', null, rows.map(({ c, i }) => {
          const n = cellNeed(b, i), w = c.workers ?? 0, ratio = staffFactor(w, n);
          return h('tr', null, h('td', null, '#' + (i + 1)), h('td', null, h('span', { class: 'tag', style: 'background:' + MODULES[c.m!].color }), MODULES[c.m!].name + (c.product && (c.m === 'line' || c.m === 'import') ? ' · ' + PRODUCTS[c.product].name : '')),
            h('td', { class: 'num' }, n), h('td', { class: 'num' }, numInput(w, x => act({ type: 'setCellStaff', id: b.id, cell: i, workers: x }), { min: 0, style: 'width:64px' })),
            h('td', null, n ? people(w, n, x => act({ type: 'setCellStaff', id: b.id, cell: i, workers: x })) : ''),
            h('td', { class: 'num ' + (ratio < 0.99 ? 'bad' : 'good') }, Math.round(ratio * 100) + '%'));
        }))),
      peopleLegend(),
      h('div', { class: 'note' }, 'Each facility slot works at the strength of its own crew: a production line makes proportionally less, an import cell buys less, and warehouses, robots, branding, R&D and quality control lose effect when understaffed — and gain when overstaffed.'),
      h('div', { class: 'kv2', style: 'margin-top:6px' }, ...wageRows));
  }
  return h('div', { class: 'kv2' },
    h('label', null, 'Workers (need ' + need + ', cap ' + (b.type === 'rd' ? '–' : staffCap(need)) + ')'), h('div', { class: 'row' }, numInput(b.workers, w => act({ type: 'setStaff', id: b.id, workers: w, wage: b.wage }), { min: 0 }), h('button', { class: 'mini', onclick: () => act({ type: 'setStaff', id: b.id, workers: need, wage: b.wage }) }, 'Fill'), b.type === 'rd' ? null : h('button', { class: 'mini', onclick: () => act({ type: 'setStaff', id: b.id, workers: staffCap(need), wage: b.wage }) }, 'Max')),
    ...(b.type === 'rd' ? [] : [h('label', null, 'Crew'), h('div', null, people(b.workers, need, w => act({ type: 'setStaff', id: b.id, workers: w, wage: b.wage })), peopleLegend())]),
    ...wageRows);
}

function productionTab(b: Building): HTMLElement {
  const v = S.view!; const def = BUILDINGS[b.type]; const pd = PRODUCTS[b.product!];
  const prodSel = def.products && def.products.length > 1 || b.type === 'factory'
    ? productSelect(b.type === 'factory' ? PRODUCT_LIST.filter(p => p.kind !== 'raw').map(p => p.id) : def.products!, b.product!, p => {
      if (b.type !== 'factory' || confirm('Retool factory for ' + PRODUCTS[p].name + '? This costs ' + money(def.cost * 0.15 * b.lines) + ' and clears input stock.')) act({ type: 'setProduct', id: b.id, product: p });
    }) : h('span', null, pd.name);
  const m = v.market[b.product!];
  const rows: (HTMLElement | false)[] = [
    h('label', null, 'Product'), prodSel,
    ...(b.type === 'factory'
      ? [h('label', null, 'Lines / robots'), h('div', { class: 'muted' }, b.lines + ' × ' + num(pd.cap) + ' ' + pd.unit + '/mo · ' + b.auto + ' robots (see Layout)')]
      : [h('label', null, 'Lines (max ' + MAX_LINES + ')'), h('div', { class: 'row' }, b.lines + ' × ' + num(pd.cap) + ' ' + pd.unit, h('button', { class: 'mini', disabled: b.lines >= MAX_LINES, onclick: () => act({ type: 'addLine', id: b.id }) }, '+ ' + money(def.cost * 0.6))),
        h('label', null, 'Automation ' + b.auto + '/' + MAX_AUTO), h('div', { class: 'row' }, '-' + b.auto * 8 + '% labour, +' + b.auto * 6 + '% output', h('button', { class: 'mini', disabled: b.auto >= MAX_AUTO, onclick: () => act({ type: 'upgradeAuto', id: b.id }) }, '+ ' + money(def.cost * 0.4 * (b.auto + 1))))]),
    h('label', null, 'Capacity'), h('div', null, num(capacity(b)) + ' ' + pd.unit + ' / month'),
    h('label', null, 'Production target %'), h('div', { class: 'row' }, numInput(b.target, p => act({ type: 'setTarget', id: b.id, pct: p }), { min: 0, max: 100, step: 5 }), h('span', { class: 'muted' }, 'avoid piling stock')),
    h('label', null, 'Stock'), h('div', null, num(b.stock.qty) + ' ' + pd.unit + ' · quality ' + b.stock.q.toFixed(0)),
    h('label', null, 'Sell to everyone'), h('div', { class: 'row' },
      h('input', { type: 'checkbox', checked: b.listPrice != null, onchange: (e: Event) => act({ type: 'setListPrice', id: b.id, price: (e.target as HTMLInputElement).checked ? +(pd.basePrice * m.idx).toFixed(2) : null }) }),
      b.listPrice != null && numInput(b.listPrice, p => act({ type: 'setListPrice', id: b.id, price: p }), { step: 0.5, min: 0.01 }),
      h('span', { class: 'muted' }, 'ref ' + money2(pd.basePrice * m.idx) + ' · import ' + money2(m.importPrice))),
    h('label', null, 'Sell to world market'), h('div', { class: 'row' },
      h('input', { type: 'checkbox', checked: !!b.world, onchange: (e: Event) => act({ type: 'setWorldSell', id: b.id, on: (e.target as HTMLInputElement).checked }) }),
      h('span', { class: 'muted' }, 'leftover stock at ~' + money2(worldPrice(S.view as any, b.product!)) + ' (price sags with volume, max ' + num(worldVolume(b.product!)) + '/month worldwide)')),
  ];
  return h('div', { class: 'row', style: 'align-items:flex-start;gap:10px' },
    h('div', { class: 'col', style: 'flex:none;gap:2px;width:120px;text-align:center' }, h('img', { src: asset(pd.photo), title: pd.name, style: 'width:120px;height:90px;object-fit:cover;border:2px inset #8a8470' }), h('b', null, pd.name)),
    h('div', { class: 'kv2 grow' }, ...rows.filter(Boolean) as HTMLElement[]));
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

function shelvesTab(b: Building): HTMLElement {
  const v = S.view!; const city = v.cities[b.city]; const need = requiredWorkers(b);
  const ref = (p: ProductId) => PRODUCTS[p].basePrice * 1.42 * v.market[p].idx * city.priceIdx;
  const rows = b.slots.map((sl, i) => {
    const prod = h('select', null, h('option', { value: '' }, '— empty —'), PRODUCT_LIST.filter(p => p.kind === 'consumer').map(p => h('option', { value: p.id, selected: p.id === sl.product, disabled: !!b.mall && p.id !== sl.product && v.me.brand[p.id] < MALL_MIN_BRAND }, (b.mall && p.id !== sl.product && v.me.brand[p.id] < MALL_MIN_BRAND ? '🔒 ' : '') + p.name)));
    const price = h('input', { type: 'number', value: sl.price, step: 0.5, style: 'width:78px' });
    const order = h('input', { type: 'number', value: sl.order, style: 'width:66px' });
    const commit = () => act({ type: 'setSlot', id: b.id, slot: i, product: (prod.value || null) as ProductId | null, price: +price.value, order: +order.value, source: prod.value === sl.product ? sl.source : '' });
    prod.addEventListener('change', () => { const p = (prod.value || null) as ProductId | null; act({ type: 'setSlot', id: b.id, slot: i, product: p, price: p ? +ref(p).toFixed(2) : 0, order: p ? slotCapacity(b, p) : 0, source: '' }); });
    price.addEventListener('change', commit); order.addEventListener('change', commit);
    const thumb = sl.product ? h('img', { src: asset(PRODUCTS[sl.product].photo), title: PRODUCTS[sl.product].name, style: 'width:52px;height:38px;object-fit:cover;border:2px inset #8a8470;display:block' }) : h('div', { style: 'width:52px;height:38px;border:2px inset #8a8470;background:#e4e0d0' });
    return h('tr', null, h('td', null, thumb), h('td', null, prod),
      h('td', null, sl.product ? h('div', { class: 'row', style: 'gap:3px;flex-wrap:nowrap' }, price, h('span', { class: 'muted small' }, money2(ref(sl.product)))) : ''),
      h('td', null, sl.product ? order : ''),
      h('td', null, sl.product ? sourceSelect(b, sl.product, sl.source, s => act({ type: 'setSlot', id: b.id, slot: i, product: sl.product, price: sl.price, order: sl.order, source: s })) : ''),
      h('td', { class: 'num' }, sl.product ? num(sl.stock.qty) + ' · q' + sl.stock.q.toFixed(0) : ''),
      h('td', { class: 'num' }, sl.product ? num(sl.sold) + (sl.lost > 0 ? ' ⚠' : '') : ''));
  });
  return h('div', null,
    b.mall ? h('div', { class: 'note', style: 'margin-bottom:4px' }, `Unit in ${v.malls.find(m => m.id === b.mall)?.name ?? 'a mall'} · rent ${money(b.rent ?? 0)}/month · lease until turn ${b.leaseEnd} (renews at the mall's current rent every ${MALL_LEASE} months) · staff need ${need}. Only branded products (brand ≥ ${MALL_MIN_BRAND}) may be sold here; keep advertising or the mall evicts you. Demolishing the unit ends the lease.`) : h('div', { class: 'row', style: 'margin-bottom:4px' }, h('span', null, 'Size ' + b.size + '/' + MAX_STORE_SIZE + ' · staff need ' + need), h('button', { class: 'mini', disabled: b.size >= MAX_STORE_SIZE, onclick: () => act({ type: 'upgradeSize', id: b.id }) }, 'Enlarge ' + money(BUILDINGS.store.cost * 0.5 * b.size))),
    h('table', null, h('thead', null, h('tr', null, ['Shelf', 'Product', 'Price (ref)', 'Order', 'Supplier', 'Stock', 'Sold'].map((x, i) => h('th', { class: i > 4 ? 'num' : '' }, x)))), h('tbody', null, rows)));
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
function reportTab(b: Building): HTMLElement {
  const r = b.report; const res = r.revenue - r.purchases - r.wages - r.maint; const prod = b.type !== 'store' && b.type !== 'rd' && b.type !== 'mall';
  return h('div', null, h('div', { class: 'kv2' },
    prod && h('label', null, 'Produced') as any, prod && h('div', null, num(r.produced, 1)) as any,
    h('label', null, 'Revenue'), h('div', null, money(r.revenue)), h('label', null, 'Purchases'), h('div', null, money(r.purchases)),
    h('label', null, 'Wages + upkeep'), h('div', null, money(r.wages + r.maint)), h('label', null, 'Operating result'), h('div', { class: cls(res) }, money(res))),
    r.note ? h('div', { class: 'note' }, r.note) : null);
}

// ---------- Factory facility layout designer (3x3 cells, clickable connections between cells)
let selCell = -1, selBuilding = '';
const CELL = 64, GAP = 26, NG = FAC_GRID, SZ = NG * CELL + (NG - 1) * GAP;
const shortName = (p?: ProductId) => (p ? PRODUCTS[p].name.slice(0, 9) : '?');
/** Product of a warehouse / export / import cell: shown as text when its links imply exactly one option, otherwise a choice among the products the links offer. */
function cellPicker(b: Building, i: number): HTMLElement {
  const c = b.layout![i]; const cands = cellCandidates(b, i);
  if (c.auto && c.product && cands.length === 1) return h('span', null, h('b', null, PRODUCTS[c.product].name), ' ', h('span', { class: 'muted' }, '(from its links)'));
  const ids = (cands.length ? cands : PRODUCT_LIST.map(p => p.id)); if (c.product && !ids.includes(c.product)) ids.push(c.product);
  const sel = h('select', null, h('option', { value: '' }, cands.length > 1 ? 'choose (' + cands.length + ' options)' : cands.length ? 'auto' : 'link it first, or pick'), ids.map(p => h('option', { value: p, selected: p === c.product }, PRODUCTS[p].name)));
  if (!c.product) sel.value = '';
  sel.addEventListener('change', () => act({ type: 'setCell', id: b.id, cell: i, product: (sel.value || null) as ProductId | null }));
  return sel;
}

function layoutTab(b: Building): HTMLElement {
  if (selBuilding !== b.id) { selBuilding = b.id; selCell = -1; }
  const L = b.layout ?? []; const st = moduleStats(b);
  const cv = h('canvas', { width: SZ, height: SZ, style: 'cursor:pointer;background:#e9e6dc;flex:none;border:2px inset #8a8470' });
  const g = cv.getContext('2d')!; let hovCell = -1, hovEdge = '';
  const pos = (i: number) => ({ x: (i % NG) * (CELL + GAP), y: Math.floor(i / NG) * (CELL + GAP) });
  const canLink = (i: number, j: number) => linkable(L[i].m, L[j].m);
  const edges: [number, number][] = []; for (let i = 0; i < NG * NG; i++) { if (i % NG < NG - 1) edges.push([i, i + 1]); if (i + NG < NG * NG) edges.push([i, i + NG]); const cx = i % NG, cy = Math.floor(i / NG); if (cx < NG - 1 && cy < NG - 1) edges.push([i, i + NG + 1]); if (cx > 0 && cy < NG - 1) edges.push([i, i + NG - 1]); }
  const edgeRect = (i: number, j: number) => { const p = pos(i); return j === i + 1 ? { x: p.x + CELL, y: p.y + CELL * 0.2, w: GAP, h: CELL * 0.6 } : { x: p.x + CELL * 0.2, y: p.y + CELL, w: CELL * 0.6, h: GAP }; };
  const draw = () => {
    g.clearRect(0, 0, SZ, SZ);
    for (const [i, j] of edges) {
      const on = isLinked(b, i, j), can = canLink(i, j), hov = hovEdge === linkKey(i, j); const diag = j - i !== 1 && j - i !== NG;
      const col = on ? '#e08a1e' : hov && can ? 'rgba(224,138,30,.45)' : can ? 'rgba(120,110,80,.22)' : 'rgba(120,110,80,.08)';
      if (diag) {
        const pa = pos(i), pb = pos(j); g.strokeStyle = col; g.lineCap = 'round'; g.lineWidth = on ? 8 : 6; g.beginPath();
        if (j - i === NG + 1) { g.moveTo(pa.x + CELL, pa.y + CELL); g.lineTo(pb.x, pb.y); } else { g.moveTo(pa.x, pa.y + CELL); g.lineTo(pb.x + CELL, pb.y); }
        g.stroke(); g.lineCap = 'butt';
        if (on) { g.fillStyle = '#fff'; const mx = pa.x + (j - i === NG + 1 ? CELL + GAP / 2 : -GAP / 2), my = pa.y + CELL + GAP / 2; g.beginPath(); g.arc(mx, my, 3, 0, 7); g.fill(); }
      } else {
        const r = edgeRect(i, j); g.fillStyle = col; g.fillRect(r.x, r.y, r.w, r.h);
        if (on) { g.fillStyle = '#fff'; g.beginPath(); g.arc(r.x + r.w / 2, r.y + r.h / 2, 3, 0, 7); g.fill(); }
      }
    }
    for (let i = 0; i < NG * NG; i++) {
      const { x, y } = pos(i), cell = L[i], m = cell.m;
      g.fillStyle = '#ded9c8'; g.fillRect(x, y, CELL, CELL);
      if (m) {
        const idle = st.idle.includes(i);
        g.globalAlpha = idle ? 0.4 : 1; g.fillStyle = MODULES[m].color; g.fillRect(x + 4, y + 4, CELL - 8, CELL - 8); g.globalAlpha = 1;
        g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = 'bold 24px system-ui'; g.fillText(MODULES[m].letter, x + CELL / 2, y + CELL / 2 - (m === 'line' || m === 'import' ? 8 : 0));
        if (m === 'line' || m === 'import') { g.font = 'bold 10px system-ui'; g.fillText(shortName(cell.product), x + CELL / 2, y + CELL - 14); }
        if (m === 'warehouse' || m === 'export') {
          g.font = 'bold 10px system-ui'; g.fillText(cell.product ? shortName(cell.product) : '(none)', x + CELL / 2, y + CELL - 14);
          const cap = m === 'export' ? exportCap(b, i) : whCap(b, i), q = cell.stock?.qty ?? 0; g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + 8, y + CELL - 11, CELL - 16, 5); g.fillStyle = '#ffe9a8'; g.fillRect(x + 8, y + CELL - 11, cap ? (CELL - 16) * Math.min(1, q / cap) : 0, 5);
          g.fillStyle = '#fff'; g.font = '9px system-ui'; g.fillText(cell.product ? num(q) + '/' + num(cap) : '', x + CELL / 2, y + 12);
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
    if (hh.edge) { const [i, j] = hh.edge; act({ type: 'setLink', id: b.id, a: i, b: j, on: !isLinked(b, i, j) }); return; }
    if (hh.cell < 0) return; selCell = hh.cell; S.render();
  });

  // selected cell configuration
  let cfg: HTMLElement | null = null; const cell = selCell >= 0 ? L[selCell] : undefined; const v0 = S.view!;
  const workerRow = () => { const cell = L[selCell]; const n = cellNeed(b, selCell); return h('div', { class: 'row' }, 'Workers', numInput(cell.workers ?? 0, w => act({ type: 'setCellStaff', id: b.id, cell: selCell, workers: w }), { min: 0, style: 'width:64px' }), h('span', { class: (cell.workers ?? 0) < n ? 'bad' : 'muted' }, 'needs ' + n + ' · cap ' + staffCap(n)), n ? people(cell.workers ?? 0, n, w => act({ type: 'setCellStaff', id: b.id, cell: selCell, workers: w })) : ''); };
  if (cell && cell.m === 'export') {
    const sel = cellPicker(b, selCell);
    const cap = exportCap(b, selCell), q = cell.stock?.qty ?? 0, pd = cell.product ? PRODUCTS[cell.product] : null, ref = pd ? pd.basePrice * v0.market[cell.product!].idx : 0;
    cfg = h('div', { class: 'cellcfg' }, h('b', null, 'Cell #' + (selCell + 1) + ' · export / dispatch'), h('div', { class: 'row' }, 'Exports', sel, pd ? null : h('span', { class: 'bad' }, '⚠ link it to a cell that supplies a product')),
      pd ? h('div', { class: 'note' }, 'Stock ' + num(q) + ' / ' + num(cap) + ' ' + pd.unit + ' · quality ' + (cell.stock?.q ?? 0).toFixed(0) + '. Filled monthly from linked lines (their spare capacity) and import cells of this product. Pick it as the source in your other facilities and shops to transport it there.') : null,
      pd ? h('div', { class: 'row' }, 'Sell to everyone', h('input', { type: 'checkbox', checked: cell.listPrice != null, onchange: (e: Event) => act({ type: 'setCell', id: b.id, cell: selCell, price: (e.target as HTMLInputElement).checked ? +ref.toFixed(2) : null }) }),
        cell.listPrice != null ? numInput(cell.listPrice, p => act({ type: 'setCell', id: b.id, cell: selCell, price: p }), { step: 0.5, min: 0.01, style: 'width:80px' }) : null, h('span', { class: 'muted' }, 'ref ' + money2(ref))) : null,
      pd ? h('div', { class: 'row' }, 'Sell to world market', h('input', { type: 'checkbox', checked: !!cell.world, onchange: (e: Event) => act({ type: 'setWorldSell', id: b.id, cell: selCell, on: (e.target as HTMLInputElement).checked }) }), h('span', { class: 'muted' }, '~' + money2(worldPrice(v0 as any, cell.product!)) + ' for what nobody buys')) : null,
      workerRow());
  } else if (cell && cell.m === 'warehouse') {
    const sel = cellPicker(b, selCell);
    const cap = whCap(b, selCell), q = cell.stock?.qty ?? 0, pu = cell.product ? PRODUCTS[cell.product].unit : '';
    cfg = h('div', { class: 'cellcfg' }, h('b', null, 'Cell #' + (selCell + 1) + ' · warehouse'), h('div', { class: 'row' }, 'Stores', sel, cell.product ? null : h('span', { class: 'bad' }, '⚠ link it to a cell that supplies a product')),
      h('div', { class: 'note' }, cell.product ? 'Stock ' + num(q) + ' / ' + num(cap) + ' ' + pu + ' · quality ' + (cell.stock?.q ?? 0).toFixed(0) + '. One product per warehouse; changing it empties the stock. Link it to an import cell of that product so it buys ahead with spare capacity.' : 'A warehouse holds exactly one product. Link it to an import cell of that product to stockpile it.'), workerRow());
  } else if (cell && cell.m && cell.m !== 'line' && cell.m !== 'import') cfg = h('div', { class: 'cellcfg' }, h('b', null, 'Cell #' + (selCell + 1) + ' · ' + MODULES[cell.m].name), workerRow());
  if (cell && (cell.m === 'line' || cell.m === 'import')) {
    if (cell.m === 'line') {
      const sel = productSelect(PRODUCT_LIST.filter(p => p.kind !== 'raw').map(p => p.id), cell.product ?? b.product!, p => act({ type: 'setCell', id: b.id, cell: selCell, product: p }), true);
      const rec = cell.product ? Object.entries(PRODUCTS[cell.product].recipe).map(([k, q]) => q + ' ' + PRODUCTS[k as ProductId].name).join(' + ') : '';
      cfg = h('div', { class: 'cellcfg' }, h('b', null, 'Cell #' + (selCell + 1) + ' · production line'), h('div', { class: 'row' }, 'Makes', sel), h('div', { class: 'note' }, 'needs per unit: ' + (rec || '—')), workerRow());
    } else {
      const sel = cellPicker(b, selCell);
      cfg = h('div', { class: 'cellcfg' }, h('b', null, 'Cell #' + (selCell + 1) + ' · import'), h('div', { class: 'row' }, 'Imports', sel, cell.product ? sourceSelect(b, cell.product, cell.source ?? '', src => act({ type: 'setCell', id: b.id, cell: selCell, source: src })) : ''),
        cell.product ? '' : h('div', { class: 'note' }, 'Link this cell to a production line (or pick a product) to choose the source.'), workerRow());
    }
  }
  const nm = (i: number) => '#' + (i + 1) + ' ' + (L[i].m ? MODULES[L[i].m!].name + (L[i].product ? ' (' + PRODUCTS[L[i].product!].name + ')' : '') : '');
  if (cell && cell.m) {
    const nbs = adj8(selCell).filter(j => L[j].m && isLinked(b, selCell, j));
    const n = cellNeed(b, selCell), ratio = staffFactor(cell.workers ?? 0, n), idle = st.idle.includes(selCell);
    const info = h('div', { class: 'cellinfo' },
      h('div', { class: 'note' }, MODULES[cell.m].desc),
      h('div', { class: 'small' }, h('b', null, 'Linked to: '), nbs.length ? nbs.map(nm).join(', ') : h('span', { class: 'muted' }, 'nothing yet — click the bars between cells')),
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
