// Analytics: where last month's money came from and where it went, as pie charts.
import { PRODUCTS } from '../../shared/data.js';
import { h, money, cls, crisp } from './util.js';
import { S } from './state.js';

type Slice = { label: string; value: number };
const COLORS = ['#4a7fc0', '#c0504d', '#9cba4a', '#d98c00', '#8a5fb5', '#3f8f4f', '#2c8f9c', '#b0508c', '#8d7b6a', '#e0c040', '#5b6770'];
const mode = { exp: 'category', inc: 'product' };

function pie(slices: Slice[]): HTMLElement {
  const data = slices.filter(s => s.value > 0.5).sort((a, b) => b.value - a.value);
  const total = data.reduce((n, s) => n + s.value, 0);
  const top = data.slice(0, 10), rest = data.slice(10).reduce((n, s) => n + s.value, 0); if (rest > 0) top.push({ label: 'Other', value: rest });
  const wrap = h('div', { class: 'pie' });
  if (!total) { wrap.append(h('div', { class: 'muted' }, 'Nothing to show yet: play a turn.')); return wrap; }
  const cv = crisp(h('canvas'), 240, 240); const g = cv.getContext('2d')!;
  let a = -Math.PI / 2;
  top.forEach((s, i) => { const da = s.value / total * Math.PI * 2; g.beginPath(); g.moveTo(120, 120); g.arc(120, 120, 112, a, a + da); g.closePath(); g.fillStyle = COLORS[i % COLORS.length]; g.fill(); g.strokeStyle = '#f4f1e6'; g.lineWidth = 2; g.stroke(); a += da; });
  const legend = h('table', { class: 'pielegend' }, top.map((s, i) => h('tr', null, h('td', null, h('span', { class: 'tag', style: 'background:' + COLORS[i % COLORS.length] })), h('td', null, s.label), h('td', { class: 'num' }, money(s.value)), h('td', { class: 'num muted' }, (s.value / total * 100).toFixed(1) + '%'))),
    h('tr', null, h('td'), h('td', null, h('b', null, 'Total')), h('td', { class: 'num' }, h('b', null, money(total))), h('td')));
  wrap.append(cv, legend); return wrap;
}
const picker = (key: 'exp' | 'inc', opts: [string, string][]) => h('div', { class: 'row', style: 'gap:4px;margin-bottom:6px' }, opts.map(([k, label]) => h('button', { class: 'mini' + (mode[key] === k ? ' primary' : ''), onclick: () => { mode[key] = k; S.render(); } }, label)));

export function analyticsScreen(): HTMLElement {
  const v = S.view!; const L = v.me.ledger; const bs = v.buildings;
  const spend = (b: typeof bs[number]) => b.report.purchases + b.report.wages + b.report.maint;
  // ---- expenses
  let exp: Slice[];
  if (mode.exp === 'building') {
    exp = bs.map(b => ({ label: b.name, value: spend(b) }));
    exp.push({ label: 'Company-wide (staff, ads, interest, tax)', value: Math.max(0, L.ads + L.interest + L.tax + L.wages + L.maint + L.purchases + L.transport - bs.reduce((n, b) => n + spend(b), 0)) });
  } else exp = [{ label: 'Purchases', value: L.purchases }, { label: 'Transport', value: L.transport }, { label: 'Wages & salaries', value: L.wages }, { label: 'Maintenance & rent', value: L.maint }, { label: 'Advertising', value: L.ads }, { label: 'Interest', value: L.interest }, { label: 'Tax', value: L.tax }];
  // ---- incomes
  const byProduct = new Map<string, number>(); const add = (k: string, x: number) => byProduct.set(k, (byProduct.get(k) ?? 0) + x);
  const bRev = (b: typeof bs[number]) => b.type === 'store' ? b.slots.reduce((n, s) => n + s.revenue, 0) : b.report.revenue;
  for (const b of bs) {
    if (b.type === 'store') for (const sl of b.slots) { if (sl.product) add(PRODUCTS[sl.product].name, sl.revenue); }
    else if (b.type === 'mall') add('Mall rents', b.report.revenue);
    else if (b.product) add(PRODUCTS[b.product].name, b.report.revenue);
  }
  let inc: Slice[];
  if (mode.inc === 'building') inc = bs.map(b => ({ label: b.name, value: bRev(b) }));
  else if (mode.inc === 'city') { const m = new Map<string, number>(); for (const b of bs) m.set(v.cities[b.city].name, (m.get(v.cities[b.city].name) ?? 0) + bRev(b)); inc = [...m].map(([label, value]) => ({ label, value })); }
  else inc = [...byProduct].map(([label, value]) => ({ label, value }));
  const attributed = bs.reduce((n, b) => n + bRev(b), 0);
  if (L.revenue - attributed > 1) inc.push({ label: 'Other', value: L.revenue - attributed });
  const out = L.purchases + L.transport + L.wages + L.maint + L.ads + L.interest + L.tax;
  return h('div', null,
    h('div', { class: 'panel' }, h('h2', null, 'Analytics — last month'),
      h('div', { class: 'row', style: 'gap:24px' }, h('span', null, 'Income ', h('b', null, money(L.revenue))), h('span', null, 'Expenses ', h('b', null, money(out))), h('span', null, 'Profit after tax ', h('b', { class: cls(L.profit) }, money(L.profit)))),
      h('div', { class: 'note' }, 'Figures are for the month that just closed. Buildings you demolished or that changed hands are not included.')),
    h('div', { class: 'grid2' },
      h('div', { class: 'panel' }, h('h2', null, 'Expenses'), picker('exp', [['category', 'By category'], ['building', 'By building']]), pie(exp)),
      h('div', { class: 'panel' }, h('h2', null, 'Incomes'), picker('inc', [['product', 'By product'], ['building', 'By building'], ['city', 'By city']]), pie(inc))));
}
