import { createGame, addCompany, applyAction, processTurn, DEFAULT_SETTINGS } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 13, aiCompanies: 0, startCash: 2_000_000, targetNetWorth: 0 });
const A = addCompany(s, { name: 'A', playerId: 'a' }), B = addCompany(s, { name: 'B', playerId: 'b' });
const r = (c: any, x: any) => console.log(c.name, x.type, JSON.stringify(applyAction(s, c.id, x)));
const m = s.candidates!.filter(p => p.kind === 'manager');
r(A, { type: 'bid', id: m[0].id, salary: m[0].salary }); r(A, { type: 'bid', id: m[1].id, salary: m[1].salary });
processTurn(s); console.log(A.news.map(n => n.text)); const p0 = A.staff![0], p1 = A.staff![1];
console.log('A staff', A.staff!.map(p => [p.name, p.salary, p.term, p.contractEnd]), 'turn', s.turn);
r(B, { type: 'bid', id: p0.id, salary: p0.salary + 500 });   // too early
p0.contractEnd = s.turn + 2; p1.contractEnd = s.turn + 2;
r(B, { type: 'bid', id: p0.id, salary: p0.salary }); r(B, { type: 'bid', id: p0.id, salary: p0.salary + 500 }); r(B, { type: 'bid', id: p1.id, salary: p1.salary + 400 });
r(A, { type: 'bid', id: p1.id, salary: p1.salary + 900 });  // counter-offer wins for p1
processTurn(s); console.log('before expiry: A', A.staff!.length, 'B', B.staff?.length ?? 0);
processTurn(s); processTurn(s);
console.log('A staff', A.staff!.map(p => [p.name, p.salary, p.contractEnd]), 'B staff', B.staff?.map(p => [p.name, p.salary, p.contractEnd]));
console.log(A.news.slice(-3).map(n => n.text), B.news.slice(-2).map(n => n.text));
