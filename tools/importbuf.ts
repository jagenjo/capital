// Import cells keep a small buffer, warehouses a big one (tools/importbuf.ts).
import { createGame, addCompany, applyAction, processTurn, DEFAULT_SETTINGS, harbourId, impCap, whCap, requiredWorkers } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 11, aiCompanies: 0, startCash: 40e6, targetNetWorth: 0, events: false, starter: false }); const c = addCompany(s, { name: 'T', playerId: 't' });
const port = s.cities.find(x => x.port)!; port.harbour = ['grain'].map(p => ({ product: p as never, qty: 1e7, mult: 1, since: 9999 }));
const g = [...s.world!.tiles].findIndex(ch => ch === 'g'); const b = s.buildings[(applyAction(s, c.id, { type: 'build', idx: g, btype: 'factory', product: 'bread', grid: 3 }) as any).info];
const A = (a: any) => { const x = applyAction(s, c.id, a) as any; if (x.error) console.log('ERR', JSON.stringify(a), x.error); return x; };
A({ type: 'setCell', id: b.id, cell: 3, source: harbourId(port.id) }); A({ type: 'setModule', id: b.id, cell: 0, module: 'warehouse' }); A({ type: 'setLink', id: b.id, a: 0, b: 3, on: true });
A({ type: 'setStaff', id: b.id, workers: requiredWorkers(b), wage: b.wage }); for (const i of [0, 3]) A({ type: 'setCellStaff', id: b.id, cell: i, workers: 6 });
for (let t = 1; t <= 8; t++) { processTurn(s); if (t >= 3) console.log('turn', t, 'import buffer', Math.round(b.layout![3].stock?.qty ?? 0), '/', Math.round(impCap(b, 3)), '| warehouse', Math.round(b.layout![0].stock?.qty ?? 0), '/', Math.round(whCap(b, 0)), '| produced', b.report.produced); }
