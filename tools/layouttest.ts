import { createGame, addCompany, applyAction, processTurn, DEFAULT_SETTINGS, layoutIssues, harbourId, cellNeed, requiredWorkers } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 11, aiCompanies: 0, startCash: 20_000_000, targetNetWorth: 0, events: false });
const c = addCompany(s, { name: 'Tester', playerId: 't' });
const port = s.cities.find(x => x.port)!;
port.harbour = ['steel', 'plastics', 'oil', 'grain'].map(p => ({ product: p as any, qty: 100000, mult: 1, since: 0 }));
const g = [...s.world!.tiles].map((ch, i) => ch === 'g' ? i : -1).filter(i => i >= 0)[100];
(c.research ??= {}).cars = 999; // cars are hi-tech now: unlock them for this test
const b = s.buildings[(applyAction(s, c.id, { type: 'build', idx: g, btype: 'factory', product: 'cars' }) as any).info];
const A = (a: any) => { const x = applyAction(s, c.id, a) as any; if (x.error) console.log('ERR', JSON.stringify(a).slice(0, 90), x.error); return x; };
const H = harbourId(port.id);
// default: cars line (4) + imports steel(1) plastics(3) electronics(5). Make electronics in-house: line in corner 0, linked DIAGONALLY to the car line.
A({ type: 'setModule', id: b.id, cell: 5, module: null });
A({ type: 'setModule', id: b.id, cell: 0, module: 'line' }); A({ type: 'setCell', id: b.id, cell: 0, product: 'electronics' });
A({ type: 'setLink', id: b.id, a: 0, b: 1, on: true }); A({ type: 'setLink', id: b.id, a: 0, b: 3, on: true });
console.log('diagonal link 0-4:', JSON.stringify(A({ type: 'setLink', id: b.id, a: 0, b: 4, on: true })));
console.log('bad link 0-8 (too far):', A({ type: 'setLink', id: b.id, a: 0, b: 8, on: true }).error);
A({ type: 'setCell', id: b.id, cell: 1, source: H }); A({ type: 'setCell', id: b.id, cell: 3, source: H });
console.log('links', b.links, 'issues:', layoutIssues(b, s.cities));
console.log('needs per cell:', b.layout!.map((x, i) => x.m ? i + ':' + x.m + '=' + cellNeed(b, i) : null).filter(Boolean).join(' '), '| total', requiredWorkers(b));
// staff only some cells
A({ type: 'setCellStaff', id: b.id, cell: 4, workers: cellNeed(b, 4) });      // cars line fully staffed
A({ type: 'setCellStaff', id: b.id, cell: 0, workers: 6 });                    // electronics line half staffed (needs 12)
A({ type: 'setCellStaff', id: b.id, cell: 1, workers: 1 }); A({ type: 'setCellStaff', id: b.id, cell: 3, workers: 1 });
console.log('total workers', b.workers, 'ratio check -> cell0 needs', cellNeed(b, 0));
processTurn(s);
console.log('half-staffed electronics: produced', b.report.produced, 'note:', b.report.note);
A({ type: 'setCellStaff', id: b.id, cell: 0, workers: 12 });
processTurn(s);
console.log('fully staffed: produced', b.report.produced, 'note:', b.report.note || '(none)');
console.log('Fill via setStaff:', JSON.stringify(A({ type: 'setStaff', id: b.id, workers: requiredWorkers(b), wage: b.wage })), 'workers', b.workers, '/', requiredWorkers(b));
