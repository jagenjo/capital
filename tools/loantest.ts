import { createGame, addCompany, applyAction, processTurn, DEFAULT_SETTINGS, loanOffer, loanDue } from '../shared/engine.js';
import { LENDERS } from '../shared/data.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 11, aiCompanies: 0, startCash: 1_000_000, targetNetWorth: 0, events: false });
const c = addCompany(s, { name: 'T', playerId: 't' });
const tiles = [...s.world!.tiles].map((ch, i) => ch === 'g' ? i : -1).filter(i => i >= 0);
const A = (a: any) => { const x = applyAction(s, c.id, a) as any; console.log(a.type, a.lender ?? a.id ?? '', a.amount ?? '', x.error ? 'ERR ' + x.error : 'ok'); return x; };
const b = s.buildings[A({ type: 'build', idx: tiles[10], btype: 'factory', product: 'bread' }).info];
for (const l of LENDERS) { const o = loanOffer(s, c, l), o2 = loanOffer(s, c, l, [b.id]); console.log(l.id.padEnd(6), 'max', o.max, 'rate', (o.rate * 100).toFixed(2) + '%', '| with collateral max', o2.max, (o2.rate * 100).toFixed(2) + '%'); }
A({ type: 'takeLoan', lender: 'dev', amount: 100000, term: 36, collateral: [] });
A({ type: 'takeLoan', lender: 'shark', amount: 50000, term: 3, collateral: [b.id] });
A({ type: 'takeLoan', lender: 'dev', amount: 300000, term: 36, collateral: [b.id] });
A({ type: 'takeLoan', lender: 'fnb', amount: 200000, term: 12, collateral: [] });
A({ type: 'takeLoan', lender: 'shark', amount: 60000, term: 1, collateral: [] });
A({ type: 'sellBuilding', id: b.id });
console.log('debt', c.debt, 'cash', c.cash, c.loans!.map(l => l.lender + ':' + l.principal + ' due ' + JSON.stringify(loanDue(l))).join(' | '));
for (let i = 0; i < 4; i++) { processTurn(s); console.log('t', s.turn, 'cash', c.cash, 'debt', c.debt, 'loans', c.loans!.map(l => l.lender + ':' + l.principal + (l.late ? ' late' + l.late : '')).join(' '), c.news.slice(-1)[0]?.text ?? ''); }
c.cash = -2_000_000; for (let i = 0; i < 4; i++) { processTurn(s); console.log('broke t', s.turn, 'cash', c.cash, 'debt', c.debt, 'bld', Object.keys(s.buildings).length, c.loans!.map(l => l.lender + ':' + l.principal + (l.late ? ' late' + l.late : '') + (l.defaulted ? ' DEF' : '')).join(' ')); }
