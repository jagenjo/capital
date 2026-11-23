// A warehouse linked to an export cell hands its stock over to it (tools/whexporttest.ts).
import { createGame, addCompany, applyAction, processTurn, DEFAULT_SETTINGS, harbourId, requiredWorkers, layoutIssues, exportCap, whCap } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 11, aiCompanies: 0, startCash: 30_000_000, targetNetWorth: 0, events: false });
const c = addCompany(s, { name: 'Tester', playerId: 't' }); (c.research ??= {}).cars = 999;
const port = s.cities.find(x => x.port)!; port.harbour = ['steel', 'plastics', 'electronics', 'grain'].map(p => ({ product: p as any, qty: 1e6, mult: 1, since: 0 }));
const tiles = [...s.world!.tiles].map((ch, i) => ch === 'g' ? i : -1).filter(i => i >= 0);
const A = (a: any) => { const x = applyAction(s, c.id, a) as any; if (x.error) console.log('ERR', JSON.stringify(a).slice(0, 100), x.error); return x; };
const b = s.buildings[A({ type: 'build', idx: tiles[100], btype: 'factory', product: 'cars', grid: 3 }).info];
A({ type: 'setModule', id: b.id, cell: 3, module: 'import' }); A({ type: 'setCell', id: b.id, cell: 3, product: 'steel', source: harbourId(port.id) });
A({ type: 'setModule', id: b.id, cell: 0, module: 'warehouse' }); A({ type: 'setLink', id: b.id, a: 0, b: 3, on: true });
A({ type: 'setModule', id: b.id, cell: 1, module: 'export' });
console.log('link warehouse-export:', JSON.stringify(A({ type: 'setLink', id: b.id, a: 0, b: 1, on: true })));
console.log('export product (inferred from the warehouse):', b.layout![1].product, '| issues:', layoutIssues(b, s.cities));
console.log(b.layout!.map((c, i) => i + ':' + c.m).join(' '));
A({ type: 'setStaff', id: b.id, workers: requiredWorkers(b), wage: b.wage });
A({ type: 'setLink', id: b.id, a: 3, b: 4, on: true }); for (const i of [0, 1, 3]) A({ type: 'setCellStaff', id: b.id, cell: i, workers: 5 });
for (let t = 0; t < 7; t++) { processTurn(s); console.log(b.report.note, '|', 'turn', t + 1, 'warehouse', b.layout![0].stock?.qty.toFixed(1), '/', whCap(b, 0).toFixed(0), '| export', b.layout![1].stock?.qty.toFixed(1), '/', exportCap(b, 1).toFixed(0)); }
console.log(JSON.stringify(b.report), b.workers, requiredWorkers(b), JSON.stringify(b.layout!.map(c => [c.m, c.product, c.workers, c.source])));
console.log('building', (b as any).building, 'turn', s.turn, 'cash', c.cash, 'condition', b.condition, 'strike', b.strikeUntil);
