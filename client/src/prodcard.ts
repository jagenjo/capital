// Compact product card: picture on the left, a title bar, the key market facts as rows with bars, and price / quality / brand on the right.
import { PRODUCTS, type ProductId } from '../../shared/data.js';
import { h, money2, num } from './util.js';
import { S, companyOf } from './state.js';
import { prodImg } from './prodimg.js';
import type { Building } from '../../shared/types.js';

export interface Offer { id: string; owner: string; kind: string; name: string; city: number; idx: number; price: number; q: number; qty: number }

/** Every facility that sells the product to the public: shops with it on a shelf and factories selling to everyone. Cheapest first. */
export function offersOf(p: ProductId): Offer[] {
  const v = S.view!; const rows: Offer[] = [];
  for (const b of v.buildings) if (b.type === 'store') { const sl = b.slots.find(x => x.product === p && x.stock.qty >= 0.5); if (sl) rows.push({ id: b.id, owner: b.owner, kind: b.super ? 'Supermarket' : 'Shop', name: b.name, city: b.city, idx: b.idx, price: sl.price, q: Math.round(sl.stock.q), qty: sl.stock.qty }); }
  for (const o of v.others) { const sl = o.sells?.find(x => x.product === p); if (sl) rows.push({ id: o.id, owner: o.owner, kind: o.super ? 'Supermarket' : 'Shop', name: o.name, city: o.city, idx: o.idx, price: sl.price, q: sl.q, qty: 0 }); }
  for (const l of v.listings) if (l.product === p) { const id = l.building.split('#')[0]; const b = v.buildings.find(x => x.id === id) ?? v.others.find(x => x.id === id); rows.push({ id, owner: l.company, kind: 'Factory', name: b?.name ?? '', city: l.city, idx: b?.idx ?? -1, price: l.price, q: l.q, qty: l.qty }); }
  return rows.sort((a, b) => a.price - b.price);
}

const bar = (frac: number, color = '#e0a800') => h('span', { class: 'pc-bar' }, h('span', { style: `width:${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%;background:${color}` }));
const row = (label: string, value: Node | string | number, frac?: number, color?: string) =>
  h('div', { class: 'pc-row' }, h('span', { class: 'pc-l' }, label), frac == null ? h('span', { class: 'pc-v' }, value) : h('span', { class: 'pc-v' }, bar(frac, color), h('span', { class: 'pc-t' }, value)));

/** `w` is the width of the whole card; the picture takes the left 28%. */
/** `shop`: show one shop's shelf (its price, quality and stock) instead of the market's cheapest offer. */
export function productCard(id: ProductId, w = 460, shop?: { owner: string; city?: number; price: number; q: number; qty?: number }): HTMLElement {
  const v = S.view!, p = PRODUCTS[id], m = v.market[id]; const offers = offersOf(id); const best = offers[0];
  const hist = v.salesHist?.[id]; const demanded = hist?.d[hist.d.length - 1] ?? 0, sold = hist?.l[hist.l.length - 1] ?? 0;
  const onShelf = offers.reduce((a, o) => a + o.qty, 0);
  const q = offers.length ? Math.max(...offers.map(o => o.q)) : 0, brand = v.me.brand[id] ?? 0, tech = v.me.tech[id] ?? 0;
  const imgW = Math.round(w * 0.26);
  return h('div', { class: 'pcard', style: 'width:' + w + 'px;max-width:100%' },
    h('div', { class: 'pc-img' }, prodImg(id, imgW, 84, 'border:0;display:block')),
    h('div', { class: 'pc-main' },
      h('div', { class: 'pc-title' }, p.name),
      h('div', { class: 'pc-body' },
        h('div', { class: 'pc-col' },
          row(shop ? 'Seller' : 'Cheapest', shop ? (companyOf(shop.owner)?.name ?? '?') : best ? (companyOf(best.owner)?.name ?? '?') : '—'),
          row('City', shop ? (shop.city != null ? v.cities[shop.city].name : '—') : best ? v.cities[best.city].name : '—'),
          row('Demand', demanded ? num(demanded) : p.kind === 'consumer' ? '—' : 'n/a', p.kind === 'consumer' ? Math.min(1, m.demand / 2) : undefined),
          row('Supply', String(offers.length), demanded ? sold / demanded : offers.length ? 1 : 0, '#1f4e8c'),
          row('Market', m.idx.toFixed(2), m.idx / 2, m.idx > 1.05 ? '#b3261e' : m.idx < 0.95 ? '#1c7c3a' : '#e0a800')),
        h('div', { class: 'pc-col pc-side' },
          h('div', { class: 'pc-big' }, h('span', null, 'Price'), h('b', null, money2(shop ? shop.price : best ? best.price : p.basePrice * m.idx))),
          h('div', { class: 'pc-big' }, h('span', null, 'Quality'), h('b', null, shop ? Math.round(shop.q) : offers.length ? q : '–')),
          h('div', { class: 'pc-big' }, h('span', null, 'Brand'), h('b', null, brand.toFixed(0))),
          h('div', { class: 'pc-big' }, h('span', null, 'Tech'), h('b', null, tech.toFixed(0)))),
        h('span', { class: 'pc-vbar', title: 'Overall: your brand and technology' }, h('span', { style: `height:${Math.round((brand + tech) / 2)}%` }))),
      h('div', { class: 'pc-foot' }, 'Import ' + money2(m.importPrice) + (shop && shop.qty === 0 ? ' · out of stock' : shop?.qty ? ' · ' + num(shop.qty) + ' ' + p.unit + ' in stock' : onShelf && !shop ? ' · ' + num(onShelf) + ' ' + p.unit + ' on offer' : ''))));
}

/** What a rival's facility makes or sells, as resource cards (shown in the lower right panel): a shop's shelves with its own prices, a factory's product with its offer. */
export function rivalProducts(o: { id: string; owner: string; city: number; product: ProductId | null; products?: ProductId[]; shelf?: { product: ProductId; price: number; q: number; qty: number }[] }): HTMLElement | null {
  const v = S.view!;
  if (o.shelf) return h('div', { class: 'col', style: 'gap:6px' }, h('div', { class: 'chartlabel' }, 'On the shelves'),
    o.shelf.length ? h('div', { class: 'col', style: 'gap:6px' }, o.shelf.map(x => productCard(x.product, 400, { owner: o.owner, city: o.city, price: x.price, q: x.q, qty: x.qty })))
      : h('div', { class: 'note' }, 'Nothing on the shelves right now.'));
  // a factory can make several goods depending on its layout: the main product first, then every other line / export cell product
  const list = [...new Set([...(o.product ? [o.product] : []), ...(o.products ?? [])])]; if (!list.length) return null;
  return h('div', { class: 'col', style: 'gap:6px' }, h('div', { class: 'chartlabel' }, list.length > 1 ? 'Produces (' + list.length + ' goods)' : 'Produces'), list.map(pr => {
    const ls = v.listings.filter(x => x.building.split('#')[0] === o.id && x.product === pr).sort((a, b) => a.price - b.price); const l = ls[0];
    return productCard(pr, 400, l ? { owner: o.owner, city: o.city, price: l.price, q: l.q, qty: ls.reduce((n, x) => n + x.qty, 0) } : undefined); }));
}

/** SUPPLIES: to whom a facility provides goods: buildings that chose it as a source, supply contracts, and whether it sells to everyone / the world market. */
export function suppliesBox(id: string, own?: Building): HTMLElement | null {
  const v = S.view!; const list = v.customers?.[id] ?? [];
  const open: string[] = []; if (own) { if (own.listPrice != null) open.push('everyone, at ' + money2(own.listPrice)); if (own.world) open.push('the world market'); for (const c of own.layout ?? []) { if (c.m === 'export' && c.product && c.listPrice != null) open.push(PRODUCTS[c.product].name + ' to everyone, at ' + money2(c.listPrice)); if (c.m === 'export' && c.product && c.world) open.push(PRODUCTS[c.product].name + ' to the world market'); } }
  if (!list.length && !open.length && !own) return null;
  return h('div', { class: 'col', style: 'gap:2px' }, h('div', { class: 'chartlabel' }, 'Supplies'),
    list.length || open.length ? h('table', { class: 'stats supplies' }, h('tbody', null,
      ...list.map(c => { const co = companyOf(c.owner);
        return h('tr', { class: 'clickable', title: 'Show on the map', onclick: () => { const t = [...v.buildings, ...v.others].find(x => x.id === c.id); if (t) { S.city = t.city; S.sel = t.idx; S.buildingId = v.buildings.some(x => x.id === t.id) ? t.id : null; S.render(); } } },
          h('th', null, h('span', { class: 'tag', style: 'background:' + (co?.color ?? '#888') }), ' ' + c.name + (c.owner === v.me.id ? '' : ' · ' + (co?.name ?? '?'))),
          h('td', null, prodImg(c.product, 24, 16, 'margin-right:5px'), PRODUCTS[c.product].name + (c.how === 'contract' ? ' · contract' + (c.qty ? ' ' + num(c.qty) + '/mo' : '') : ''))); }),
      ...open.map(o => h('tr', null, h('th', null, 'Open market'), h('td', null, 'sells to ' + o))))) : h('div', { class: 'note' }, 'Nobody takes goods from here yet: pick this facility as a source in a shop, a factory import cell, or offer a supply contract.'));
}
