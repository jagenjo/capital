// Personnel: hire managers (one facility each, max 2) and an advisor (insights).
import { MAX_STAFF, ADVISOR_SPECS } from '../../shared/engine.js';
import { BUILDINGS } from '../../shared/data.js';
import type { Person } from '../../shared/types.js';
import { h, money, asset } from './util.js';
import { S, act } from './state.js';

const bar = (v: number) => h('span', { class: 'statbar', title: v + '/10' }, h('i', { style: `width:${v * 10}%` }));
const specName = (p: Person) => p.kind === 'advisor' ? ADVISOR_SPECS[p.spec] : BUILDINGS[p.spec as keyof typeof BUILDINGS]?.name ?? p.spec;

function card(p: Person, hired: boolean): HTMLElement {
  const v = S.view!;
  const stats = p.kind === 'manager'
    ? h('div', { class: 'pstats' }, h('span', null, 'Efficiency'), bar(p.eff), h('span', null, 'Productivity'), bar(p.prod), h('span', null, 'Expenses'), bar(p.exp))
    : h('div', { class: 'pstats' }, h('span', null, 'Insight'), bar(p.skill));
  const assign = hired && p.kind === 'manager' ? h('select', { onchange: (e: Event) => act({ type: 'assign', id: p.id, building: (e.target as HTMLSelectElement).value || null }) },
    h('option', { value: '' }, '— unassigned —'), v.buildings.map(b => h('option', { value: b.id, selected: p.assigned === b.id }, b.name + ' (' + b.type + ')'))) : null;
  return h('div', { class: 'pcard' },
    h('img', { src: asset(`person/${String(p.portrait).padStart(2, '0')}.png`) }),
    h('div', { class: 'grow' }, h('b', null, p.name), h('span', { class: 'muted' }, ` · ${p.age} · ${p.kind === 'manager' ? 'Manager' : 'Advisor'}: ${specName(p)}`), stats,
      assign, h('div', { class: 'note' }, 'Salary ' + money(p.salary) + ' / month')),
    hired ? h('button', { onclick: () => { if (confirm(`Fire ${p.name}? One month of salary is paid as severance.`)) act({ type: 'fire', id: p.id }); } }, 'Fire')
      : h('button', { class: 'primary', onclick: () => act({ type: 'hire', id: p.id }) }, 'Hire'));
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
      h('div', { class: 'note' }, 'Monthly payroll: ' + money(payroll) + '. Firing costs one month of salary. Keep two months of salary in cash to hire.')),
    h('div', { class: 'col' },
      h('div', { class: 'panel col' }, h('h2', null, 'Candidates'), h('div', { class: 'note' }, 'The job market is shared by every company; people leave and new ones appear each month.'),
        h('h3', null, 'Managers'), pool.filter(p => p.kind === 'manager').map(p => card(p, false)),
        h('h3', null, 'Advisors'), pool.filter(p => p.kind === 'advisor').map(p => card(p, false)))));
}
