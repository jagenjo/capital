// A warehouse can only store what its links bring (tools/whlinks.ts).
import { createGame, addCompany, applyAction, DEFAULT_SETTINGS, cellCandidates } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 11, aiCompanies: 0, startCash: 40e6, targetNetWorth: 0, events: false, starter: false }); const c = addCompany(s, { name: 'T', playerId: 't' });
const g = [...s.world!.tiles].findIndex(ch => ch === 'g'); const b = s.buildings[(applyAction(s, c.id, { type: 'build', idx: g, btype: 'factory', product: 'bread', grid: 3 }) as any).info];
const A = (a: any) => JSON.stringify(applyAction(s, c.id, a)).slice(0, 140);
console.log('add warehouse at 0:', A({ type: 'setModule', id: b.id, cell: 0, module: 'warehouse' }), '| candidates', cellCandidates(b, 0));
console.log('store steel (not linked):', A({ type: 'setCell', id: b.id, cell: 0, product: 'steel' }));
console.log('link to grain import #4:', A({ type: 'setLink', id: b.id, a: 0, b: 3, on: true }), '| now holds', b.layout![0].product, '| candidates', cellCandidates(b, 0));
console.log('store steel again:', A({ type: 'setCell', id: b.id, cell: 0, product: 'steel' }));
console.log('unlink:', A({ type: 'setLink', id: b.id, a: 0, b: 3, on: false }), '| now holds', b.layout![0].product ?? 'nothing');
applyAction(s, c.id, { type: 'setLink', id: b.id, a: 0, b: 3, on: true }); b.layout![0].stock = { qty: 500, q: 50 };
console.log('throw away 500 grain:', A({ type: 'setCell', id: b.id, cell: 0, discard: true }), '| left', b.layout![0].stock?.qty);
