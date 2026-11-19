// "Selected tile stats" area (bottom-left): photo, owner, key figures and a 12-month profit chart.
import { BUILDINGS, PRODUCTS, TERRAIN_INFO, MODULES, type Terrain } from '../../shared/data.js';
import { capacity, requiredWorkers, slotCapacity, terrainAt, railMap, tilePop, tileTransport, lotPrice, RAIL_COST_MUL, RAIL_SHIP_MUL } from '../../shared/engine.js';
import type { Building } from '../../shared/types.js';
import { h, money, num, asset, cls } from './util.js';
import { S, companyOf } from './state.js';

const TERRAIN_PHOTO: Record<string, string> = {
  u: 'urban.jpg', s: 'suburb.jpg', g: 'l_grass.jpg', f: 'f_farm.jpg', t: 'f_fore.jpg', h: 'l_hill.jpg', m: 'l_hill2.jpg', e: 'f_mine.jpg', o: 'f_oil.jpg',
  b: 'l_grasea.jpg', a: 'l_sea.jpg', d: 'l_sea2.jpg', n: 'l_hill2.jpg', r: 'l_grass2.jpg', p: 'f_sea2.jpg',
};
const PHOTO_H = 'height:clamp(80px,15vh,140px)';

export function miniChart(values: number[], w: number, hgt: number, color = '#c0392b'): HTMLCanvasElement {
  const cv = h('canvas', { width: w, height: hgt, style: 'display:block;background:#fff;border:1px solid #b9b9b0' });
  const g = cv.getContext('2d')!;
  if (values.length < 2) { g.fillStyle = '#888'; g.font = '12px system-ui'; g.fillText('Play a few turns to see history.', 8, hgt / 2); return cv; }
  const lo = Math.min(0, ...values), hi = Math.max(1, ...values), pad = 18;
  const X = (i: number) => 6 + i / (values.length - 1) * (w - 12), Y = (v: number) => hgt - pad - (v - lo) / (hi - lo) * (hgt - pad - 12);
  g.strokeStyle = '#999'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(w, Y(0)); g.stroke(); g.setLineDash([]);
  g.fillStyle = 'rgba(192,57,43,.12)'; g.beginPath(); g.moveTo(X(0), Y(0)); values.forEach((v, i) => g.lineTo(X(i), Y(v))); g.lineTo(X(values.length - 1), Y(0)); g.fill();
  g.strokeStyle = color; g.lineWidth = 2; g.beginPath(); values.forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))); g.stroke();
  g.fillStyle = '#444'; g.font = '10px system-ui'; g.textAlign = 'left'; g.fillText(money(hi), 4, 11); g.fillText(money(lo), 4, hgt - 4);
  const last = values[values.length - 1]; g.fillStyle = last >= 0 ? '#1c7c3a' : '#b3261e'; g.fillRect(w - 16, Y(Math.max(0, last)), 10, Math.abs(Y(last) - Y(0)) || 2);
  return cv;
}

function kvRows(rows: [string, string | HTMLElement][]) {
  return h('table', { class: 'stats' }, h('tbody', null, rows.map(([k, v]) => h('tr', null, h('th', null, k), h('td', { class: 'num' }, v)))));
}

function companyBox(owner: string) {
  const c = companyOf(owner); if (!c) return h('div');
  return h('div', { class: 'row', style: 'gap:6px' },
    h('div', { class: 'logo', style: 'background:' + c.color }, c.name.slice(0, 1)),
    h('img', { src: asset('person/' + String(c.portrait).padStart(2, '0') + '.png'), style: 'width:56px;height:56px;border:2px solid ' + c.color + ';image-rendering:pixelated' }),
    h('div', null, h('b', null, c.name), h('div', { class: 'note' }, c.isAI ? 'AI company' : 'Player')));
}

function buildingStats(b: Building): HTMLElement {
  const v = S.view!; const def = BUILDINGS[b.type]; const city = v.cities[b.city]; const need = requiredWorkers(b);
  let units = '', util = 0, quality = '–';
  if (b.type === 'store') {
    const caps = b.slots.filter(s => s.product).reduce((a, s) => a + slotCapacity(b, s.product!), 0);
    units = b.size + ' (size)'; util = caps ? b.report.sold / caps : 0; quality = b.slots.filter(s => s.product).map(s => s.stock.q.toFixed(0)).join('/') || '–';
  } else if (b.type === 'rd') { units = b.workers + ' scientists'; util = b.report.produced; } else {
    units = b.lines + ' line' + (b.lines > 1 ? 's' : ''); util = capacity(b) ? b.report.produced / capacity(b) : 0; quality = b.stock.q.toFixed(0);
  }
  const res = b.report.revenue - b.report.purchases - b.report.wages - b.report.maint;
  const stock = b.type === 'store' ? b.slots.reduce((a, s) => a + s.stock.qty, 0) : b.stock.qty;
  const mods = b.layout ? Object.values(MODULES).map(m => [m.name, b.layout!.filter(x => x.m === m.type).length] as const).filter(x => x[1]).map(x => x[1] + '× ' + x[0]).join(', ') : '';
  return h('div', { class: 'statgrid' },
    h('div', { class: 'col', style: 'flex:none;width:236px;gap:4px' },
      h('img', { src: asset(b.product && b.type !== 'store' && b.type !== 'rd' ? PRODUCTS[b.product].photo : def.photo), style: 'width:236px;' + PHOTO_H + ';object-fit:cover;border:2px inset #8a8470' }),
      h('div', { class: 'deptname' }, b.name), h('div', { class: 'chartlabel' }, 'Result — past 12 months'), miniChart(b.hist ?? [], 236, 96)),
    h('div', { class: 'col grow', style: 'gap:6px;min-width:0' }, companyBox(b.owner),
      kvRows([['Employees', b.workers + (b.type === 'rd' ? '' : ' / ' + need)], ['Units', units], ['Unit level (robots)', String(Math.round(b.auto * 10) / 10)],
        ['Utilization', b.type === 'rd' ? '+' + util.toFixed(2) + ' tech' : Math.round(util * 100) + '%'], ['Stock', num(stock)], ['Quality', quality], ['Condition', b.condition.toFixed(0) + '%'],
        ['Last month result', h('span', { class: cls(res) }, money(res))], ['Population here', num(tilePop({ cities: v.cities, world: S.world! }, b.idx))], ['Transport availability', tileTransport({ cities: v.cities, world: S.world! }, b.idx) + ' / 100'], ['Price to build here', money(lotPrice({ cities: v.cities, world: S.world! }, b.idx))], ['Railway', (railMap({ world: S.world! })?.comp[b.idx] ?? -1) >= 0 ? 'connected: −' + Math.round((1 - RAIL_COST_MUL) * 100) + '% freight, ×' + RAIL_SHIP_MUL + ' shipments' : 'none nearby'], ['City', city.name]]),
      mods ? h('div', { class: 'note' }, 'Facility: ' + mods) : null,
      b.type === 'store' ? h('div', { class: 'row', style: 'gap:4px' }, b.slots.filter(sl => sl.product).map(sl => h('img', { src: asset(PRODUCTS[sl.product!].photo), title: PRODUCTS[sl.product!].name + ' · stock ' + num(sl.stock.qty), style: 'width:48px;height:36px;object-fit:cover;border:2px inset #8a8470' }))) : null));
}

function overview(): HTMLElement {
  const v = S.view!; const me = v.me;
  return h('div', { class: 'statgrid' },
    h('div', { class: 'col', style: 'flex:none;width:236px;gap:4px' }, h('div', { class: 'deptname' }, 'Company overview'), h('div', { class: 'chartlabel' }, 'Monthly profit — past 12 months'), miniChart(me.history.slice(-12).map(p => p.profit), 236, 130)),
    h('div', { class: 'col grow', style: 'gap:6px;min-width:0' }, companyBox(me.id),
      kvRows([['Cash', h('span', { class: cls(me.cash) }, money(me.cash))], ['Net worth', money(me.netWorth)], ['Debt', money(me.debt)], ['Buildings', String(v.buildings.length)],
        ['Last month profit', h('span', { class: cls(me.ledger.profit) }, money(me.ledger.profit))], ['Last month revenue', money(me.ledger.revenue)]]),
      h('div', { class: 'note' }, 'Click a tile in the zoom view to see its stats here and configure it on the right.')));
}

function tileInfo(idx: number): HTMLElement {
  const v = S.view!, wd = S.world!; const t = terrainAt({ world: wd }, idx) as Terrain; const city = v.cities[S.city];
  const lot = v.lots[String(idx)]; const other = v.others.find(o => o.idx === idx);
  return h('div', { class: 'statgrid' },
    h('div', { class: 'col', style: 'flex:none;width:236px;gap:4px' }, h('img', { src: asset('pict/' + TERRAIN_PHOTO[t]), style: 'width:236px;' + PHOTO_H + ';object-fit:cover;border:2px inset #8a8470' }), h('div', { class: 'deptname' }, TERRAIN_INFO[t].name),
      other ? h('div', { class: 'note' }, other.name + (other.product ? ' · ' + PRODUCTS[other.product].name : '')) : null),
    h('div', { class: 'col grow', style: 'gap:6px;min-width:0' }, lot ? companyBox(lot.owner) : h('div', { class: 'note' }, TERRAIN_INFO[t].price ? 'Unowned land' : 'Not buildable'),
      kvRows([['Tile', (idx % wd.w) + ', ' + Math.floor(idx / wd.w)], ['Population here', num(tilePop({ cities: v.cities, world: wd }, idx))], ['Transport availability', tileTransport({ cities: v.cities, world: wd }, idx) + ' / 100'], ['Price to build here', TERRAIN_INFO[t].price ? money(lotPrice({ cities: v.cities, world: wd }, idx)) : 'not buildable'], ['Nearest city', city.name], ['Population', num(city.pop)], ['Wealth index', city.wealth.toFixed(2)], ['Local wage', '$' + num(v.cityWages[city.id])],
        ['Labour used', num(v.cityLabor[city.id].used) + ' / ' + num(v.cityLabor[city.id].pool)], ['Port', city.port ? 'yes — harbour for imports' : 'no']])));
}

export function statsPanel(): HTMLElement {
  const v = S.view!; const wd = S.world;
  let body: HTMLElement;
  if (!wd || S.sel == null) body = overview();
  else { const b = v.buildings.find(x => x.idx === S.sel); body = b ? buildingStats(b) : tileInfo(S.sel); }
  return h('div', { class: 'panel area' }, body);
}

export function citiesPanel(onPick: (id: number) => void): HTMLElement {
  const v = S.view!;
  return h('div', { class: 'col', style: 'gap:4px' }, h('div', { class: 'chartlabel' }, 'Cities'), h('table', null, h('thead', null, h('tr', null, ['City', 'Pop.', 'Wage', 'Mine'].map((x, i) => h('th', { class: i ? 'num' : '' }, x)))),
    h('tbody', null, v.cities.map(c => h('tr', { class: 'clickable' + (c.id === S.city ? ' sel' : ''), onclick: () => onPick(c.id) },
      h('td', null, (c.port ? '⚓ ' : '') + c.name), h('td', { class: 'num' }, num(c.pop)), h('td', { class: 'num' }, '$' + num(v.cityWages[c.id])), h('td', { class: 'num' }, v.buildings.filter(b => b.city === c.id).length))))));
}
