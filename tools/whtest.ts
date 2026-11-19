import { createGame, addCompany, applyAction, processTurn, DEFAULT_SETTINGS, harbourId, cellNeed, requiredWorkers, whCap } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 11, aiCompanies: 0, startCash: 20_000_000, targetNetWorth: 0, events: false });
const c = addCompany(s, { name: 'Tester', playerId: 't' });
const port = s.cities.find(x => x.port)!;
port.harbour = ['steel', 'plastics', 'electronics', 'grain'].map(p => ({ product: p as any, qty: 100000, mult: 1, since: 0 }));
const g = [...s.world!.tiles].map((ch, i) => ch === 'g' ? i : -1).filter(i => i >= 0)[100];
const b = s.buildings[(applyAction(s, c.id, { type: 'build', idx: g, btype: 'factory', product: 'cars' }) as any).info];
const A = (a: any) => { const x = applyAction(s, c.id, a) as any; if (x.error) console.log('ERR', JSON.stringify(a).slice(0, 90), x.error); return x; };
const H = harbourId(port.id);
// cars: line 4, imports 1 steel, 3 plastics, 5 electronics (default). Warehouse in cell 0 linked to import 1 (steel) via 0-1, plus one at 2 linked to 1 too.
A({ type: 'setCell', id: b.id, cell: 1, source: H }); A({ type: 'setCell', id: b.id, cell: 3, source: H }); A({ type: 'setCell', id: b.id, cell: 5, source: H });
A({ type: 'setModule', id: b.id, cell: 0, module: 'warehouse' }); A({ type: 'setLink', id: b.id, a: 0, b: 1, on: true });
A({ type: 'setCell', id: b.id, cell: 0, product: 'steel' });
A({ type: 'setStaff', id: b.id, workers: requiredWorkers(b), wage: b.wage });
processTurn(s);
const w = b.layout![0];
console.log('warehouse steel stock', w.stock?.qty?.toFixed(1), 'cap', whCap(b, 0).toFixed(1), 'produced', b.report.produced, b.report.note);
A({ type: 'setCell', id: b.id, cell: 0, product: 'plastics' });
console.log('after switch product: stock', JSON.stringify(b.layout![0].stock), 'product', b.layout![0].product);
processTurn(s);
console.log('plastics wh but linked to steel import -> stock', JSON.stringify(b.layout![0].stock));
// overstaff cap
console.log('cap workers test', JSON.stringify(A({ type: 'setCellStaff', id: b.id, cell: 4, workers: 999 })), b.layout![4].workers, 'need', cellNeed(b, 4));
A({ type: 'setCell', id: b.id, cell: 0, product: 'steel' });
for (let i = 0; i < 3; i++) { processTurn(s); console.log('turn', i, 'produced', b.report.produced, 'wh steel', b.layout![0].stock?.qty?.toFixed(0), 'note', b.report.note); }
port.harbour = port.harbour!.filter(x => x.product !== 'steel'); // steel supply dries up
processTurn(s); console.log('steel gone: produced', b.report.produced, 'wh steel', b.layout![0].stock?.qty?.toFixed(0), b.report.note);
