// Layout links are arrows: cells deduce their good from incoming arrows; warehouses store what flows in, chain, and an export cell can flow into a warehouse (tools/arrows.ts).
import { createGame, addCompany, applyAction, processTurn, DEFAULT_SETTINGS, harbourId, requiredWorkers, whCap, cellCandidates } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 11, aiCompanies: 0, startCash: 40e6, targetNetWorth: 0, events: false, starter: false }); const c = addCompany(s, { name: 'T', playerId: 't' });
const port = s.cities.find(x => x.port)!; port.harbour = ['grain'].map(p => ({ product: p as never, qty: 1e7, mult: 1, since: 9999 }));
const g = [...s.world!.tiles].findIndex(ch => ch === 'g'); const b = s.buildings[(applyAction(s, c.id, { type: 'build', idx: g, btype: 'factory', product: 'bread', grid: 3 }) as any).info];
const A = (a: any) => { const x = applyAction(s, c.id, a) as any; if (x.error) console.log('  ERR', JSON.stringify(a), x.error); return x; };
console.log('default links', JSON.stringify(b.links), '| line 4 candidates n/a; import 3 product', b.layout![3].product);
A({ type: 'setCell', id: b.id, cell: 3, source: harbourId(port.id) });
for (const cell of [0, 1, 5]) A({ type: 'setModule', id: b.id, cell, module: 'warehouse' }); A({ type: 'setModule', id: b.id, cell: 2, module: 'export' });
console.log('arrow import 3 -> wh 0:', JSON.stringify(A({ type: 'setLink', id: b.id, a: 3, b: 0, dir: 'ab' })), '| wh 0 holds', b.layout![0].product);
A({ type: 'setLink', id: b.id, a: 0, b: 1, dir: 'ab' }); console.log('wh 0 -> wh 1 (chain): wh 1 holds', b.layout![1].product);
A({ type: 'setLink', id: b.id, a: 1, b: 2, dir: 'ab' }); console.log('wh 1 -> export 2: export holds', b.layout![2].product);
A({ type: 'setLink', id: b.id, a: 2, b: 5, dir: 'ab' }); console.log('export 2 -> wh 5: wh 5 holds', b.layout![5].product);
console.log('wrong way export -> import', JSON.stringify(A({ type: 'setLink', id: b.id, a: 2, b: 3, dir: 'ab' })).slice(0, 80));
console.log('cycle on pair 0-1: ab ->', b.links!.filter(k => /^(0>1|1>0|0-1)$/.test(k)), '| ba ->', (A({ type: 'setLink', id: b.id, a: 0, b: 1, dir: 'ba' }), b.links!.filter(k => /^(0>1|1>0|0-1)$/.test(k))), '| none ->', (A({ type: 'setLink', id: b.id, a: 0, b: 1, dir: 'none' }), b.links!.filter(k => /^(0>1|1>0|0-1)$/.test(k))));
A({ type: 'setLink', id: b.id, a: 0, b: 1, dir: 'ab' });
A({ type: 'setStaff', id: b.id, workers: requiredWorkers(b) + 12, wage: b.wage }); for (const i of [0, 1, 2, 3, 5]) A({ type: 'setCellStaff', id: b.id, cell: i, workers: 2 });
for (let t = 1; t <= 9; t++) processTurn(s);
const L = b.layout!; console.log('after 9 turns: ' + [0, 1, 2, 5].map(i => `${L[i].m}#${i} ${Math.round(L[i].stock?.qty ?? 0)}/${Math.round(L[i].m === 'export' ? 600 : whCap(b, i))}`).join(' | '), '| produced', b.report.produced);
