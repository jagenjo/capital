import { createGame, addCompany, applyAction, processTurn, DEFAULT_SETTINGS, harbourId, requiredWorkers, listings, layoutIssues, exportCap } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 11, aiCompanies: 0, startCash: 30_000_000, targetNetWorth: 0, events: false });
const c = addCompany(s, { name: 'Tester', playerId: 't' }); const c2 = addCompany(s, { name: 'Other', playerId: 'u' });
const port = s.cities.find(x => x.port)!;
port.harbour = ['steel', 'plastics', 'electronics', 'grain'].map(p => ({ product: p as any, qty: 1e6, mult: 1, since: 0 }));
const tiles = [...s.world!.tiles].map((ch, i) => ch === 'g' ? i : -1).filter(i => i >= 0);
const A = (cid: string, a: any) => { const x = applyAction(s, cid, a) as any; if (x.error) console.log('ERR', JSON.stringify(a).slice(0, 100), x.error); return x; };
const H = harbourId(port.id);
const unlock = (cid: string) => { const co = s.companies.find(x => x.id === cid)!; (co.research ??= {}).cars = 999; }; // cars are hi-tech now
const mk = (cid: string, idx: number) => (unlock(cid), s.buildings[A(cid, { type: 'build', idx, btype: 'factory', product: 'cars' }).info]);
const b = mk(c.id, tiles[100]);
for (const i of [1, 3, 5]) A(c.id, { type: 'setCell', id: b.id, cell: i, source: H });
A(c.id, { type: 'setModule', id: b.id, cell: 2, module: 'export' }); A(c.id, { type: 'setLink', id: b.id, a: 1, b: 2, on: true });
A(c.id, { type: 'setCell', id: b.id, cell: 2, price: 5 });
A(c.id, { type: 'setStaff', id: b.id, workers: requiredWorkers(b), wage: b.wage });
processTurn(s);
const ex = b.layout![2];
console.log('export stock', ex.stock?.qty.toFixed(1), 'cap', exportCap(b, 2).toFixed(1), 'issues', layoutIssues(b, s.cities));
console.log('listings', JSON.stringify(listings(s).filter(l => l.building.includes('#'))));
// a rival factory buys steel from the export cell
const b2 = mk(c2.id, tiles[120]);
console.log('source check', JSON.stringify(A(c2.id, { type: 'setCell', id: b2.id, cell: 1, source: b.id + '#2' })));
A(c2.id, { type: 'setStaff', id: b2.id, workers: requiredWorkers(b2), wage: b2.wage });
const before = ex.stock!.qty; const cash0 = c.cash;
processTurn(s);
console.log('after turn: exported steel taken', (before - ex.stock!.qty).toFixed(1), '(refills monthly) seller cash +', (c.cash - cash0).toFixed(0), 'buyer note', b2.report.note, '| shipped', b.shipped, 'b2 purchases', b2.report.purchases.toFixed(0));
// auto import: empty import cell linked to the car line picks the only missing input
A(c.id, { type: 'setModule', id: b.id, cell: 5, module: null }); A(c.id, { type: 'setModule', id: b.id, cell: 5, module: 'import' }); A(c.id, { type: 'setLink', id: b.id, a: 4, b: 5, on: true });
console.log('auto import product:', b.layout![5].product, 'auto', b.layout![5].auto);
A(c.id, { type: 'setModule', id: b.id, cell: 0, module: 'warehouse' }); A(c.id, { type: 'setLink', id: b.id, a: 0, b: 1, on: true });
console.log('auto warehouse (linked to steel import):', b.layout![0].product);
A(c.id, { type: 'setLink', id: b.id, a: 0, b: 3, on: true }); console.log('after also linking plastics import -> ambiguous:', b.layout![0].product);
