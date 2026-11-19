import { createGame, addCompany, applyAction, DEFAULT_SETTINGS, requiredWorkers } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 11, aiCompanies: 0, startCash: 30_000_000, targetNetWorth: 0, events: false });
const c = addCompany(s, { name: 'T', playerId: 't' });
const tiles = [...s.world!.tiles].map((ch, i) => ch === 'g' ? i : -1).filter(i => i >= 0);
const b = s.buildings[(applyAction(s, c.id, { type: 'build', idx: tiles[100], btype: 'factory', product: 'cars' }) as any).info];
console.log('new factory workers', b.workers, 'required', requiredWorkers(b));
applyAction(s, c.id, { type: 'setModule', id: b.id, cell: 2, module: 'export' });
console.log('after export cell', b.workers, b.layout!.map(x => x.workers ?? 0).join(','));
