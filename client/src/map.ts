// Map screen: four areas like the original game
//   top-left: world view (minimap)      top-right: zoom view
//   bottom-left: selected tile stats    bottom-right: selected tile configuration
import { BUILDINGS, TERRAIN_INFO, PRODUCTS, PRODUCT_LIST, WORLD_SCALE, type ProductId, type Terrain } from '../../shared/data.js';
import { lotPrice, terrainAt, isUnlocked } from '../../shared/engine.js';
import { h, money, asset, toast } from './util.js';
import { S, act, companyOf } from './state.js';
import { buildingPanel } from './building.js';
import { worldPanels, focusCity, setViewSize } from './worldmap.js';
import { statsPanel, citiesPanel } from './tilestats.js';
import { harbourTable } from './tabs.js';
import { askPrice, newPrice, vacantName, buy, mallRentPanel } from './realestate.js';

const buildChoice: { product: ProductId | null } = { product: null };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export const TOPBAR_H = 54, NAV_H = 36, PAD = 8;

export function mapScreen(): HTMLElement {
  const gap = 6;
  const availW = Math.max(900, window.innerWidth - 2 * PAD), availH = Math.max(520, window.innerHeight - TOPBAR_H - NAV_H - 2 * PAD - (S.view?.finished || S.view?.me.bankrupt ? 32 : 0));
  const topH = Math.floor((availH - gap) * 0.54), botH = availH - gap - topH;
  const wd = S.world; const aspect = wd ? wd.w / wd.h : 1.67;
  const LW = clamp(Math.round(topH * aspect), 360, Math.floor(availW * 0.44)), RW = availW - LW - gap;
  setViewSize(RW - 4, topH - 4);
  const { mini, main } = worldPanels(LW - 4, topH - 4);
  return h('div', { class: 'quad', style: 'grid-template-columns:' + LW + 'px ' + RW + 'px;grid-template-rows:' + topH + 'px ' + botH + 'px;gap:' + gap + 'px' },
    mini, main, statsPanel(), configPanel());
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

function lotPanel(idx: number): HTMLElement {
  const v = S.view!; const wd = S.world!;
  const t = terrainAt({ world: wd }, idx) as Terrain;
  if (t === 'p') return harbourPanel(idx); const lot = v.lots[String(idx)]; const other = v.others.find(o => o.idx === idx);
  const om = other && v.malls.find(m => m.id === other.id); if (om) return mallRentPanel(om);
  if (other) return h('div', { class: 'cfg scroll col' }, h('div', null, h('b', null, other.name)), h('div', null, 'Owned by ', h('b', null, companyOf(other.owner)?.name ?? '?')), other.product && h('div', null, 'Produces ' + PRODUCTS[other.product].name), h('div', { class: 'note' }, 'You can only configure your own buildings.'));
  if (lot && lot.owner !== v.me.id) return h('div', { class: 'cfg scroll col' }, h('div', null, 'Owned by ', h('b', null, companyOf(lot.owner)?.name ?? '?')));
  const vac = v.vacant.find(x => x.idx === idx);
  if (vac) return h('div', { class: 'cfg scroll col' }, h('div', { class: 'row' }, h('b', { style: 'font-size:15px' }, '🏷 For sale: ' + vacantName(vac)), h('span', { class: 'muted' }, vac.origin === 'bankrupt' ? 'liquidated company' : vac.origin === 'closure' ? 'owner closed down' : 'estate sale')),
    h('div', null, 'Condition ' + vac.cond + '% · empty, no stock, no staff · land ' + money(vac.land) + ' + building ' + money(vac.build)),
    h('div', { class: 'note' }, 'Building new would cost ' + money(newPrice(vac)) + ' — you save ' + money(newPrice(vac) - askPrice(vac)) + ' (' + Math.round((1 - askPrice(vac) / newPrice(vac)) * 100) + '%).'),
    h('div', null, h('button', { class: 'primary', onclick: () => buy(vac) }, 'Buy for ' + money(askPrice(vac)))));
  const price = lot ? 0 : lotPrice({ cities: v.cities, world: wd }, idx);
  const opts = Object.values(BUILDINGS).filter(d => d.terrain.includes(t));
  const factProduct = h('select', null, PRODUCT_LIST.filter(p => p.kind !== 'raw').map(p => h('option', { value: p.id, selected: p.id === (buildChoice.product ?? 'bread'), disabled: !isUnlocked(v.me, p.id) }, (isUnlocked(v.me, p.id) ? '' : '🔒 ') + p.name + ' (' + Object.entries(p.recipe).map(([k, q]) => q + '× ' + PRODUCTS[k as ProductId].name).join(', ') + ')')));
  factProduct.addEventListener('change', () => { buildChoice.product = factProduct.value as ProductId; });
  const rawProduct = h('select', null, ['grain', 'livestock'].map(p => h('option', { value: p }, PRODUCTS[p as ProductId].name)));
  return h('div', { class: 'cfg scroll col' },
    h('div', null, lot ? 'You own this lot.' : !TERRAIN_INFO[t].price ? 'This tile cannot be built on.' : 'Land price: ' + money(price)),
    TERRAIN_INFO[t].price && opts.length === 0 ? h('div', { class: 'muted' }, 'Nothing can be built on this terrain. Farms need farmland, logging camps forest, mines ore deposits, oil wells oil fields; stores need downtown/suburb.') : h('div', { class: 'col' },
      opts.map(d => h('div', { class: 'row', style: 'border-top:1px solid #e3e3dc;padding-top:6px' },
        h('img', { src: asset(d.photo), style: 'width:80px;height:52px;object-fit:cover;border:1px solid #bbb' }),
        h('div', { class: 'grow' }, h('b', null, d.name), h('div', { class: 'note' }, d.desc), d.type === 'factory' && factProduct, d.type === 'farm' && rawProduct),
        h('button', { class: 'primary', onclick: async () => {
          const product = d.type === 'factory' ? (factProduct.value as ProductId) : d.type === 'farm' ? (rawProduct.value as ProductId) : undefined;
          const r = await act({ type: 'build', idx, btype: d.type, product });
          if (r && r !== 'ok') { S.buildingId = r; toast(d.name + ' built', 'ok'); S.render(); }
        } }, 'Build ' + money(d.cost + price))))),
    lot ? h('button', { onclick: () => act({ type: 'releaseLot', idx }) }, 'Sell lot back (' + money(lot.paid * 0.9) + ')') : null);
}
