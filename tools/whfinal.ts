// A warehouse that the final line points at fills with finished goods, shared with the export cell (tools/whfinal.ts).
import { createGame, addCompany, applyAction, processTurn, DEFAULT_SETTINGS, harbourId, requiredWorkers, whCap, exportCap } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 11, aiCompanies: 0, startCash: 40e6, targetNetWorth: 0, events: false, starter: false }); const c = addCompany(s, { name: 'T', playerId: 't' });
const port = s.cities.find(x => x.port)!; port.harbour = [{ product: 'grain' as never, qty: 1e8, mult: 1, since: 9999 }];
const g = [...s.world!.tiles].findIndex(ch => ch === 'g'); const b = s.buildings[(applyAction(s, c.id, { type: 'build', idx: g, btype: 'factory', product: 'bread', grid: 3 }) as any).info];
const A = (a: any) => { const x = applyAction(s, c.id, a) as any; if (x.error) console.log('ERR', JSON.stringify(a), x.error); return x; };
console.log('default layout', b.layout!.map((x, i) => i + ':' + (x.m ?? '-')).join(' '), JSON.stringify(b.links));
A({ type: 'setCell', id: b.id, cell: 3, source: harbourId(port.id) });
const ex = b.layout!.findIndex(x => x.m === 'export'); const free = b.layout!.findIndex((x, i) => !x.m && i !== 4 && i !== 3);
A({ type: 'setModule', id: b.id, cell: free, module: 'warehouse' }); A({ type: 'setLink', id: b.id, a: 4, b: free, dir: 'ab' });
A({ type: 'setStaff', id: b.id, workers: requiredWorkers(b) + 6, wage: b.wage }); for (const i of [3, ex, free]) A({ type: 'setCellStaff', id: b.id, cell: i, workers: 2 });
console.log('export cell', ex, '| warehouse', free, '| warehouse holds', b.layout![free].product, '| links', JSON.stringify(b.links));
for (let t = 1; t <= 6; t++) { processTurn(s); const L = b.layout!; console.log('turn', t, 'line made', Math.round(L[4].made ?? 0), '| export', Math.round(L[ex].stock?.qty ?? 0) + '/' + Math.round(exportCap(b, ex)), '| warehouse', Math.round(L[free].stock?.qty ?? 0) + '/' + Math.round(whCap(b, free)), '| factory stock', Math.round(b.stock.qty)); }
