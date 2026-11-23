import { createGame, addCompany, applyAction, DEFAULT_SETTINGS } from '../shared/engine.js';
import { PRODUCTS } from '../shared/data.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 7, aiCompanies: 0 }); const me = addCompany(s, { name: 'Me', playerId: 'm' }); me.cash = 1e9;
const f = [...s.world!.tiles].findIndex(c => c === 'f'), g = [...s.world!.tiles].findIndex(c => c === 'g');
console.log('cotton farm', JSON.stringify(applyAction(s, me.id, { type: 'build', idx: f, btype: 'farm', product: 'cotton' } as any)), 'product', s.buildings['b' + (s.nextId - 1)]?.product);
for (const [k, p] of ['fabric', 'clothing', 'shoes'].entries()) console.log(p, JSON.stringify(applyAction(s, me.id, { type: 'build', idx: g + 1 + k, btype: 'factory', product: p } as any)), PRODUCTS[p as 'shoes'].recipe);
