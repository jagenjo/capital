// Personnel: hire managers (one facility each, max 2) and an advisor (insights).
import { MAX_STAFF, ADVISOR_SPECS, OFFER_WINDOW } from '../../shared/engine.js';
import { BUILDINGS } from '../../shared/data.js';
import type { Person } from '../../shared/types.js';
import { h, money, asset } from './util.js';
import { S, act, companyOf } from './state.js';

const bar = (v: number) => h('span', { class: 'statbar', title: v + '/10' }, h('i', { style: `width:${v * 10}%` }));
const specName = (p: Person) => p.kind === 'advisor' ? ADVISOR_SPECS[p.spec] : BUILDINGS[p.spec as keyof typeof BUILDINGS]?.name ?? p.spec;

type Cand = Omit<Person, 'bids'> & { myBid?: number; bidders?: number };
function card(p: Cand, hired: boolean, rival = false): HTMLElement {
  const v = S.view!;
  const stats = p.kind === 'manager'
    ? h('div', { class: 'pstats' }, h('span', null, 'Efficiency'), bar(p.eff), h('span', null, 'Productivity'), bar(p.prod), h('span', null, 'Expenses'), bar(p.exp))
    : h('div', { class: 'pstats' }, h('span', null, 'Insight'), bar(p.skill));
  const assign = hired && p.kind === 'manager' ? h('select', { onchange: (e: Event) => act({ type: 'assign', id: p.id, building: (e.target as HTMLSelectElement).value || null }) },
    h('option', { value: '' }, '— unassigned —'), v.buildings.map(b => h('option', { value: b.id, selected: p.assigned === b.id }, b.name + ' (' + b.type + ')'))) : null;
  return h('div', { class: 'pcard' },
    h('img', { src: asset(`person/${String(p.portrait).padStart(2, '0')}.png`) }),
    h('div', { class: 'grow' }, h('b', null, p.name), h('span', { class: 'muted' }, ` · ${p.age} · ${p.kind === 'manager' ? 'Manager' : 'Advisor'}: ${specName(p)}`), stats,
      assign, h('div', { class: 'note' }, (hired ? 'Salary ' : 'Asking ') + money(p.salary) + ' / month' + (!hired && !rival ? ` · ${p.bidders ?? 0} bid${p.bidders === 1 ? '' : 's'} · ${p.term ?? 12}-month contract` : '')), hired || rival ? contractLine(p) : null),
    hired ? h('div', { class: 'col', style: 'gap:4px;align-items:flex-end' }, h('button', { onclick: () => { if (confirm(`Fire ${p.name}? One month of salary is paid as severance.`)) act({ type: 'fire', id: p.id }); } }, 'Fire'), left(p) <= OFFER_WINDOW ? bidBox(p, 'Renew') : null)
      : rival ? (left(p) <= OFFER_WINDOW ? bidBox(p, 'Offer') : null) : bidBox(p));
}

const left = (p: { contractEnd?: number }) => Math.max(0, (p.contractEnd ?? 0) - S.view!.turn);
function contractLine(p: Cand): HTMLElement {
  const l = left(p); const soon = l <= OFFER_WINDOW;
  return h('div', { class: 'small ' + (soon ? 'bad' : 'muted') }, `Contract ends in ${l} month${l === 1 ? '' : 's'} (turn ${p.contractEnd})` + (soon ? ' — it renews at the same salary unless a rival outbids you; make a renewal offer to keep them from being poached.' : ''));
}
function bidBox(p: Cand, label = 'Bid'): HTMLElement {
  const inp = h('input', { type: 'number', step: 50, value: p.myBid ?? (label === 'Offer' ? p.salary + 250 : p.salary), style: 'width:84px' });
  return h('div', { class: 'col', style: 'gap:3px;align-items:flex-end' },
    h('div', { class: 'row', style: 'gap:3px;flex-wrap:nowrap' }, inp, h('button', { class: 'primary', onclick: () => act({ type: 'bid', id: p.id, salary: +inp.value }) }, p.myBid ? 'Update ' + label.toLowerCase() : label)),
    p.myBid ? h('div', { class: 'row', style: 'gap:6px' }, h('span', { class: 'good small' }, 'Your bid ' + money(p.myBid)), h('button', { class: 'mini', onclick: () => act({ type: 'withdrawBid', id: p.id }) }, 'Withdraw')) : null);
}
export function personnelScreen(): HTMLElement {
  const v = S.view!; const staff = v.me.staff ?? [];
  const mgrs = staff.filter(p => p.kind === 'manager'), adv = staff.filter(p => p.kind === 'advisor');
  const pool = v.candidates;
  const payroll = staff.reduce((n, p) => n + p.salary, 0);
  const tone = (t: string) => t === 'good' ? 'good' : t === 'bad' ? 'bad' : '';
  return h('div', { class: 'grid2' },
    h('div', { class: 'col' },
      h('div', { class: 'panel col' }, h('h2', null, `Managers (${mgrs.length}/${MAX_STAFF.manager})`),
        mgrs.length ? mgrs.map(p => card(p, true)) : h('div', { class: 'muted' }, 'No managers hired. A manager assigned to a facility raises its efficiency and productivity and cuts its wage and maintenance costs. Bonuses are doubled in the building type the manager specialises in.')),
      h('div', { class: 'panel col' }, h('h2', null, `Advisor (${adv.length}/${MAX_STAFF.advisor})`),
        adv.length ? adv.map(p => card(p, true)) : h('div', { class: 'muted' }, 'No advisor hired. Advisors study one field and report insights every month; better advisors report more.'),
        adv.length > 0 && h('h3', null, 'Insights this month'),
        adv.length > 0 && (v.advice.length ? v.advice.map(a => h('div', { class: tone(a.tone) + (a.building ? ' clickable' : ''), style: 'padding:2px 0', onclick: a.building ? () => { S.tab = 'buildings'; S.buildingId = a.building!; S.render(); } : undefined }, '• ' + a.text)) : h('div', { class: 'muted' }, 'Nothing to report.'))),
      h('div', { class: 'note' }, 'Monthly payroll: ' + money(payroll) + '. Firing costs one month of salary. ')),
    h('div', { class: 'col' },
      h('div', { class: 'panel col' }, h('h2', null, 'Competitors\' personnel (' + v.competitors.length + ')'),
        h('div', { class: 'note' }, `Managers and advisors employed by other companies. ${OFFER_WINDOW} months before a contract ends you can make a sealed offer: if it beats the employer's salary (and their own counter-offer) when the contract runs out, the person joins you.`),
        v.competitors.length ? v.competitors.map(p => h('div', null, h('div', { class: 'small', style: 'margin:4px 0 1px' }, h('span', { class: 'tag', style: 'background:' + (companyOf(p.company)?.color ?? '#888') }), ' ' + (companyOf(p.company)?.name ?? '?')), card(p, false, true))) : h('div', { class: 'muted' }, 'Other companies have no staff yet.')),
      h('div', { class: 'panel col' }, h('h2', null, 'Candidates'), h('div', { class: 'note' }, 'A new short list appears every round and unhired people leave. Bids are sealed: when the turn ends the highest monthly salary offer wins each candidate (the winner pays the salary they bid). You can bid on several; you keep at least 2 months of the salary in cash.'),
        h('h3', null, 'Managers'), pool.filter(p => p.kind === 'manager').map(p => card(p, false)),
        h('h3', null, 'Advisors'), pool.filter(p => p.kind === 'advisor').map(p => card(p, false)))));
}
