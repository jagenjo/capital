import { createGame, addCompany, applyAction, DEFAULT_SETTINGS } from '../shared/engine.js';
import { PRODUCTS } from '../shared/data.js';
for (const seed of [1, 7, 9]) { const s = createGame({ ...DEFAULT_SETTINGS, seed, aiCompanies: 0 }); console.log(seed, 'rare tiles', [...s.world!.tiles].filter(c => c === 'x').length); }
const s = createGame({ ...DEFAULT_SETTINGS, seed: 7, aiCompanies: 0 }); const me = addCompany(s, { name: 'Me', playerId: 'm' }); me.cash = 1e9;
const x = [...s.world!.tiles].findIndex(c => c === 'x'), g = [...s.world!.tiles].findIndex(c => c === 'g');
console.log('rare mine', JSON.stringify(applyAction(s, me.id, { type: 'build', idx: x, btype: 'rare', product: 'rare' } as any)));
for (const [i, p] of [['chemicals'], ['hygiene'], ['cleaning']].map(([p], k) => [g + 1 + k, p] as const)) console.log(p, JSON.stringify(applyAction(s, me.id, { type: 'build', idx: i, btype: 'factory', product: p } as any)), PRODUCTS[p as 'hygiene'].basePrice);
