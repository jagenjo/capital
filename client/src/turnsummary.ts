// Small panel shown when a new month starts: what came in, what went out, and where the cash stands.
import { h, money, cls } from './util.js';
import { icon } from './icons.js';
import { S } from './state.js';
import type { View } from '../../shared/types.js';

export function showTurnSummary(v: View) {
  document.getElementById('turnpanel')?.remove();
  const L = v.me.ledger; if (!L) return;
  const ops = L.purchases + L.transport + L.wages + L.maint, other = L.ads + L.interest + L.tax, spent = ops + other;
  const row = (label: string, val: number, cl = '', sub = false) => h('tr', { class: sub ? 'sub' : '' }, h('td', null, label), h('td', { class: 'num ' + cl }, money(val)));
  const hist = v.me.history; const delta = hist.length >= 2 ? hist[hist.length - 1].cash - hist[hist.length - 2].cash : null; // cash change since the previous month closed
  const el = h('div', { id: 'turnpanel', class: 'turnpanel' },
    h('div', { class: 'row' }, h('b', { class: 'grow' }, icon('finance'), v.date + ' — month closed'), h('button', { class: 'mini', onclick: () => el.remove() }, '✕')),
    h('table', null,
      row('Earnings', L.revenue, 'good'),
      row('Operating costs', -ops, cls(-ops)),
      row('Purchases', -L.purchases, '', true), row('Transport', -L.transport, '', true), row('Wages & salaries', -L.wages, '', true), row('Maintenance & rent', -L.maint, '', true),
      row('Other expenditure', -other, cls(-other)),
      row('Advertising', -L.ads, '', true), row('Interest', -L.interest, '', true), row('Tax', -L.tax, '', true),
      h('tr', { class: 'tot' }, h('td', null, 'Profit after tax'), h('td', { class: 'num ' + cls(L.profit) }, money(L.profit))),
      h('tr', { class: 'tot' }, h('td', null, 'Cash balance'), h('td', { class: 'num ' + cls(v.me.cash) }, money(v.me.cash) + (delta == null ? '' : ' (' + (delta >= 0 ? '+' : '') + money(delta) + ')')))),
    h('div', { class: 'row', style: 'justify-content:space-between;margin-top:4px' }, h('span', { class: 'muted small' }, 'Total spent ' + money(spent)),
      h('button', { class: 'mini', onclick: () => { S.tab = 'finance'; el.remove(); S.render(); } }, 'Details')));
  document.body.append(el);
}
