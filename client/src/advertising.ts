// Advertising: brand campaigns are bought as contracts with newspapers, radio and TV stations.
import { PRODUCTS, PRODUCT_LIST, MEDIA, MEDIA_TERMS, MEDIA_DISCOUNT, MEDIA_CANCEL_MONTHS } from '../../shared/data.js';
import type { ProductId } from '../../shared/data.js';
import { h, money, asset } from './util.js';
import { S, act } from './state.js';
import { icon } from './icons.js';

const KIND_LABEL = { newspaper: 'Newspaper', radio: 'Radio', tv: 'Television' } as const;
const pick = { product: '' as ProductId | '', term: 6 };

export function marketingScreen(): HTMLElement {
  const v = S.view!; const me = v.me;
  const consumer = PRODUCT_LIST.filter(p => p.kind === 'consumer');
  if (!pick.product) pick.product = consumer[0].id;
  const fees = v.adContracts.reduce((a, x) => a + x.fee, 0);
  const mediaOf = (id: string) => MEDIA.find(m => m.id === id)!;
  const power = (p: ProductId) => v.adContracts.filter(x => x.product === p).reduce((a, x) => a + x.fee * mediaOf(x.media).lev, 0);
  const next = (p: ProductId) => Math.min(100, me.brand[p] * 0.92 + 0.8 * Math.sqrt(power(p) / 100));

  const summary = h('div', { class: 'panel' }, h('h2', null, icon('marketing'), 'Advertising — ' + money(fees) + ' / month'),
        h('div', { class: 'note' }, 'Brand awareness boosts how attractive your shelves are against competitors. It decays 8% per month, so campaigns must be sustained. Advertising is bought through contracts with media outlets: the money you pay has diminishing returns (square-root curve), and the longer the term the cheaper the fee.'),
    h('img', { class: 'hero', src: asset('title/t_ads.jpg'), style: 'height:110px;max-width:600px;margin-top:8px' }));

  const prodTable = h('div', { class: 'panel' }, h('h2', null, 'Campaigns by product'),
    h('table', null, h('thead', null, h('tr', null, ['Product', 'Brand', 'Next month', 'Tech', 'Media contracts'].map(x => h('th', null, x)))), h('tbody', null,
      consumer.map(p => {
        const mine = v.adContracts.filter(x => x.product === p.id);
        const nx = next(p.id), d = nx - me.brand[p.id];
        return h('tr', null, h('td', null, p.name),
          h('td', null, h('div', { class: 'row' }, h('div', { class: 'bar', style: 'width:120px' }, h('div', { style: 'width:' + me.brand[p.id] + '%' })), me.brand[p.id].toFixed(0))),
          h('td', null, h('span', { class: d > 0.05 ? 'good' : d < -0.05 ? 'bad' : '' }, nx.toFixed(0) + (d > 0.05 ? ' ▲' : d < -0.05 ? ' ▼' : ' ='))),
          h('td', null, me.tech[p.id].toFixed(0)),
          h('td', null, mine.length ? mine.map(x => h('span', { class: 'adchip', title: mediaOf(x.media).name }, icon(mediaOf(x.media).kind === 'newspaper' ? 'news' : mediaOf(x.media).kind), x.end - v.turn + ' mo')) : h('span', { class: 'muted' }, '—')));
      }))));

  const termSel = h('select', null, MEDIA_TERMS.map(t => h('option', { value: String(t), selected: t === pick.term }, t + ' months' + (MEDIA_DISCOUNT[t] ? ` (−${Math.round(MEDIA_DISCOUNT[t] * 100)}% fee)` : ''))));
  termSel.addEventListener('change', () => { pick.term = +termSel.value; S.render(); });
  const prodSel = h('select', null, consumer.map(p => h('option', { value: p.id, selected: p.id === pick.product }, p.name)));
  prodSel.addEventListener('change', () => { pick.product = prodSel.value as ProductId; S.render(); });
  const cards = MEDIA.map(m => {
    const used = v.mediaUsed[m.id] ?? 0, free = m.slots - used; const fee = Math.round(m.fee * (1 - (MEDIA_DISCOUNT[pick.term] ?? 0)));
    const have = v.adContracts.some(x => x.media === m.id && x.product === pick.product);
    return h('div', { class: 'mediacard' },
      h('div', { class: 'row' }, h('span', { class: 'mediaico' }, icon(m.kind === 'newspaper' ? 'news' : m.kind)), h('div', { class: 'grow' }, h('b', null, m.name), h('div', { class: 'muted small' }, KIND_LABEL[m.kind]))),
      h('div', { class: 'note' }, m.blurb),
      h('div', { class: 'small' }, 'Fee ', h('b', null, money(fee) + ' / month'), ' · ×' + m.lev + ' brand power · ', h('span', { class: free > 0 ? '' : 'bad' }, free > 0 ? free + '/' + m.slots + ' slots free' : 'full')),
      h('button', { class: 'primary', disabled: free <= 0 || have, onclick: () => act({ type: 'adContract', media: m.id, product: pick.product as ProductId, months: pick.term }) }, have ? 'Already advertising' : 'Sign contract'));
  });
  const media = h('div', { class: 'panel' }, h('h2', null, 'Newspapers, radio & television'),
    h('div', { class: 'note' }, 'Sign a contract with a media outlet to advertise one product for a fixed number of months. The fee is paid every month; cancelling early costs ' + MEDIA_CANCEL_MONTHS + ' months of fee. Each outlet only carries a few advertisers, so slots go to whoever signs first.'),
    h('div', { class: 'row', style: 'gap:8px;margin:8px 0' }, 'Product', prodSel, 'Term', termSel),
    h('div', { class: 'mediagrid' }, cards));

  const mine = h('div', { class: 'panel' }, h('h2', null, 'Your contracts (' + v.adContracts.length + ')'),
    v.adContracts.length === 0 ? h('div', { class: 'muted' }, 'No media contracts yet.') :
      h('table', null, h('thead', null, h('tr', null, ['Outlet', 'Product', 'Fee', 'Started', 'Ends', ''].map(x => h('th', null, x)))), h('tbody', null,
        v.adContracts.map(x => { const m = mediaOf(x.media); return h('tr', null, h('td', null, icon(m.kind === 'newspaper' ? 'news' : m.kind), m.name), h('td', null, PRODUCTS[x.product].name), h('td', { class: 'num' }, money(x.fee) + ' / month'),
          h('td', null, 'turn ' + x.start), h('td', null, 'turn ' + x.end + ' (' + (x.end - v.turn) + ' mo)'),
          h('td', null, h('button', { class: 'mini danger', onclick: () => { if (confirm('Cancel this contract? Penalty: ' + money(x.fee * MEDIA_CANCEL_MONTHS) + '.')) act({ type: 'cancelAd', id: x.id }); } }, 'Cancel'))); }))));

  return h('div', null, summary, prodTable, media, mine);
}
