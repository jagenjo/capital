import { createGame, addCompany, applyAction, processTurn, DEFAULT_SETTINGS, harbourId, requiredWorkers, worldPrice } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 11, aiCompanies: 0, startCash: 30_000_000, targetNetWorth: 0, events: false });
const c = addCompany(s, { name: 'T', playerId: 't' });
const tiles = [...s.world!.tiles].map((ch, i) => ch === 'f' ? i : -1).filter(i => i >= 0);
const b = s.buildings[(applyAction(s, c.id, { type: 'build', idx: tiles[50], btype: 'farm', product: 'grain' }) as any).info];
console.log('workers', b.workers, '/', requiredWorkers(b));
console.log(JSON.stringify(applyAction(s, c.id, { type: 'setWorldSell', id: b.id, on: true })));
const c0 = c.cash; processTurn(s);
console.log('stock', b.stock.qty.toFixed(0), 'sold', b.report.sold.toFixed(0), 'cash', (c.cash - c0).toFixed(0), 'price', worldPrice(s, 'grain'), b.report.note);
