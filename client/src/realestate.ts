// Real estate: ready-built facilities for sale, cheaper than building new.
import { BUILDINGS, PRODUCTS, PRODUCT_LIST, MALL_UNITS, MALL_MIN_BRAND, MALL_FITOUT, MALL_LEASE, type ProductId } from '../../shared/data.js';
import { VACANT_LIFE, subsidyText } from '../../shared/engine.js';
import type { Vacancy, MallInfo } from '../../shared/types.js';
import { h, money, toast } from './util.js';
import { S, act, companyOf } from './state.js';
import { focusTile, focusCity } from './worldmap.js';

const ORIGIN = { closure: 'Owner closed down', bankrupt: 'Liquidated company', estate: 'Estate sale' };
export const newPrice = (v: Vacancy) => v.land + BUILDINGS[v.type].cost;
export const askPrice = (v: Vacancy) => v.land + v.build;
export const showOnMap = (v: Vacancy) => { S.city = v.city; S.sel = v.idx; S.buildingId = null; S.tab = 'map'; focusTile(v.idx, 14); S.render(); };
export async function buy(v: Vacancy) {
  const r = await act({ type: 'buyVacant', id: v.id });
  if (r && r !== 'ok') { S.buildingId = r; S.sel = v.idx; S.tab = 'map'; toast(BUILDINGS[v.type].name + ' acquired', 'ok'); S.render(); }
}
export const vacantName = (v: Vacancy) => BUILDINGS[v.type].name + (v.product && v.type !== 'store' && v.type !== 'rd' ? ' · ' + PRODUCTS[v.product].name : '');

export function realEstateScreen(): HTMLElement {
  const vw = S.view!; const rows = [...vw.vacant].sort((a, b) => (askPrice(b) / newPrice(b)) - (askPrice(a) / newPrice(a)));
  return h('div', null, h('div', { class: 'panel' }, h('h2', null, 'Real estate — facilities for sale (' + rows.length + ')'),
    h('div', { class: 'note' }, 'Ready-built, empty facilities: no stock, no staff and a worn condition, but 35–55% cheaper than building from scratch. Listings expire after ' + VACANT_LIFE + ' months; liquidated companies put their buildings here too. Click a row to see it on the map.'),
    rows.length ? h('table', null, h('thead', null, h('tr', null, ['Facility', 'City', 'Reason', 'Condition', 'Land', 'Building', 'Asking', 'New build', 'Saving', 'Listed', ''].map((x, i) => h('th', { class: i > 2 && i < 10 ? 'num' : '' }, x)))),
      h('tbody', null, rows.map(v => {
        const ask = askPrice(v), nw = newPrice(v);
        return h('tr', { class: 'clickable', onclick: () => showOnMap(v) },
          h('td', null, h('span', { class: 'tag', style: 'background:' + BUILDINGS[v.type].color }), vacantName(v)), h('td', null, vw.cities[v.city].name), h('td', null, ORIGIN[v.origin]),
          h('td', { class: 'num' }, v.cond + '%'), h('td', { class: 'num' }, money(v.land)), h('td', { class: 'num' }, money(v.build)), h('td', { class: 'num' }, h('b', null, money(ask))), h('td', { class: 'num' }, money(nw)),
          h('td', { class: 'num good' }, Math.round((1 - ask / nw) * 100) + '%'), h('td', { class: 'num' }, 'T' + v.listedTurn),
          h('td', null, h('button', { class: 'primary', onclick: (e: Event) => { e.stopPropagation(); buy(v); } }, 'Buy')));
      }))) : h('div', { class: 'muted' }, 'Nothing is for sale right now. New listings appear most months.')), mallsSection(), subsidiesSection());
}

/** Product picker (branded goods only) and a Rent button for one mall. */
export function rentControls(m: MallInfo): HTMLElement {
  const v = S.view!; const ok = PRODUCT_LIST.filter(p => p.kind === 'consumer' && v.me.brand[p.id] >= MALL_MIN_BRAND && !m.tenants.some(t => t.company === v.me.id && t.product === p.id));
  if (!ok.length) return h('span', { class: 'muted small' }, `You need a brand of at least ${MALL_MIN_BRAND} in a consumer good (advertising / branding studios) to open a unit.`);
  const sel = h('select', null, ok.map(p => h('option', { value: p.id }, p.name + ' (brand ' + v.me.brand[p.id].toFixed(0) + ')')));
  const own = m.owner === v.me.id;
  return h('span', { class: 'row', style: 'gap:6px;display:inline-flex' }, sel, h('button', { class: 'primary', onclick: async () => {
    const r = await act({ type: 'rentUnit', id: m.id, product: sel.value as ProductId });
    if (r && r !== 'ok') { S.buildingId = r; S.sel = m.idx; S.tab = 'map'; S.cfgTab = 'Shelves'; toast('Unit opened — set a supplier and price on its shelf', 'ok'); S.render(); }
  } }, 'Rent ' + (own ? 'for yourself' : money(m.rent) + '/month') + ' + ' + money(MALL_FITOUT) + ' fit-out'));
}
export const mallShowOnMap = (m: MallInfo) => { S.city = m.city; S.sel = m.idx; S.buildingId = null; S.tab = 'map'; focusTile(m.idx, 14); S.render(); };
/** Tenants and conditions of one mall; used on the map when you click a mall that is not yours. */
export function mallRentPanel(m: MallInfo): HTMLElement {
  const v = S.view!; const mine = m.tenants.filter(t => t.company === v.me.id);
  return h('div', { class: 'cfg scroll col' }, h('div', { class: 'row' }, h('b', { style: 'font-size:15px' }, '🏬 ' + m.name), h('span', { class: 'muted' }, 'owned by ' + (companyOf(m.owner)?.name ?? '?') + ' · condition ' + m.cond + '%')),
    h('div', null, `Rent ${money(m.rent)}/month per unit · ${m.tenants.length}/${MALL_UNITS} units let · ${MALL_LEASE}-month leases`),
    m.tenants.length ? h('div', { class: 'note' }, 'Tenants: ' + m.tenants.map(t => (companyOf(t.company)?.name ?? '?') + ' (' + (t.product ? PRODUCTS[t.product].name : '—') + ')').join(', ')) : null,
    mine.map(t => h('div', null, h('button', { onclick: () => { S.buildingId = t.building; S.cfgTab = 'Shelves'; S.render(); } }, 'Open my ' + (t.product ? PRODUCTS[t.product].name.toLowerCase() : '') + ' shop'))),
    m.tenants.length < MALL_UNITS ? rentControls(m) : h('div', { class: 'muted' }, 'The mall is full.'));
}
function mallsSection(): HTMLElement {
  const v = S.view!;
  return h('div', { class: 'panel', style: 'margin-top:10px' }, h('h2', null, 'Shopping malls — rent a unit (' + v.malls.length + ')'),
    h('div', { class: 'note' }, `A mall unit sells one branded product (your brand in it must be at least ${MALL_MIN_BRAND}). Tenants get extra foot traffic and a stronger brand pull, and pay the owner a monthly rent. Build your own mall on a downtown or suburb lot to become a landlord.`),
    v.malls.length ? h('table', null, h('thead', null, h('tr', null, ['Mall', 'City', 'Owner', 'Rent / unit', 'Units let', 'Condition', 'Tenants'].map((x, i) => h('th', { class: i > 2 && i < 6 ? 'num' : '' }, x)))),
      h('tbody', null, v.malls.map(m => h('tr', { class: 'clickable', onclick: () => mallShowOnMap(m) }, h('td', null, m.name), h('td', null, v.cities[m.city].name), h('td', null, companyOf(m.owner)?.name ?? '?'),
        h('td', { class: 'num' }, money(m.rent)), h('td', { class: 'num' }, m.tenants.length + '/' + MALL_UNITS), h('td', { class: 'num' }, m.cond + '%'),
        h('td', null, m.tenants.map(t => t.product ? PRODUCTS[t.product].name : '').filter(Boolean).join(', ') || '—'))))) : h('div', { class: 'muted' }, 'No mall has been built yet.'));
}

function subsidiesSection(): HTMLElement {
  const v = S.view!; const tb = v.me.taxBreak;
  return h('div', { class: 'panel', style: 'margin-top:10px' }, h('h2', null, 'City incentives (' + v.subsidies.length + ')'),
    h('div', { class: 'note' }, 'Cities reward the first company to set up a kind of business in their area: a share of the land paid, or a tax cut for some months (it applies while you keep a building in that city). Offers vanish once someone claims them or after a few months. Build normally: the reward is applied automatically.'),
    tb ? h('div', { class: 'good' }, `Your tax break: −${Math.round(tb.cut * 100)}% tax thanks to ${v.cities[tb.city].name}, until turn ${tb.until}.`) : null,
    v.subsidies.length ? h('table', null, h('thead', null, h('tr', null, ['City', 'Offer', 'Expires'].map(x => h('th', null, x)))),
      h('tbody', null, v.subsidies.map(x => h('tr', { class: 'clickable', onclick: () => { S.city = x.city; S.sel = null; S.buildingId = null; S.tab = 'map'; focusCity(x.city); S.render(); } }, h('td', null, v.cities[x.city].name), h('td', null, subsidyText(x)), h('td', null, 'turn ' + x.expires))))) : h('div', { class: 'muted' }, 'No city is offering incentives right now.'));
}
