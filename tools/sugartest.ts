// Corn → sugar → pastry: the new chain exists, can be built, and the market prices it.
import { createGame, addCompany, applyAction, processTurn, DEFAULT_SETTINGS } from '../shared/engine.js';
import { PRODUCTS } from '../shared/data.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 7, aiCompanies: 3, targetNetWorth: 0 } as any); const me = addCompany(s, { name: 'Me', playerId: 'm' }); me.cash = 1e9;
const grass = [...s.world!.tiles].map((c, i) => c === 'g' ? i : -1).filter(i => i >= 0);
const f = [...s.world!.tiles].findIndex(c => c === 'f'), g = [...s.world!.tiles].findIndex(c => c === 'g');
console.log('corn farm', JSON.stringify(applyAction(s, me.id, { type: 'build', idx: f, btype: 'farm', product: 'corn' } as any)), 'product', s.buildings['b' + (s.nextId - 1)]?.product);
for (const [k, p] of ['sugar', 'pastry'].entries()) console.log(p, JSON.stringify(applyAction(s, me.id, { type: 'build', idx: g + 1 + k, btype: 'factory', product: p } as any)), JSON.stringify(PRODUCTS[p as 'sugar'].recipe));
for (const p of ['corn', 'sugar', 'pastry', 'bread'] as const) console.log(p, 'base price', PRODUCTS[p].basePrice.toFixed(2), 'depth', PRODUCTS[p].depth, 'market idx', s.market[p]?.idx);
for (let i = 0; i < 6; i++) processTurn(s);
for (const p of ['corn', 'sugar', 'pastry'] as const) console.log(p, 'after 6 turns: idx', s.market[p].idx.toFixed(2));
// beverages and alcoholic drinks
for (const [k, p] of ['beverages', 'alcohol'].entries()) console.log(p, JSON.stringify(applyAction(s, me.id, { type: 'build', idx: grass[3 + k], btype: 'factory', product: p } as any)), JSON.stringify(PRODUCTS[p as 'beverages'].recipe), 'base price', PRODUCTS[p as 'beverages'].basePrice.toFixed(2), 'depth', PRODUCTS[p as 'beverages'].depth);

// computers and cars are hi-tech: locked until researched
for (const p of ['computers', 'cars']) console.log(p, 'locked:', JSON.stringify(applyAction(s, me.id, { type: 'build', idx: grass[6], btype: 'factory', product: p } as any)), 'research needed', PRODUCTS[p as 'cars'].research);

// industrial machinery
{ const m = PRODUCTS.machinery; console.log('machinery', JSON.stringify(m.recipe), 'depth', m.depth, 'base price', m.basePrice.toFixed(0), JSON.stringify(applyAction(s, me.id, { type: 'build', idx: grass[8], btype: 'factory', product: 'machinery' } as any))); }

// ultra-processed food
{ const m = PRODUCTS.ultrafood; console.log('ultrafood', JSON.stringify(m.recipe), 'depth', m.depth, 'base price', m.basePrice.toFixed(0), JSON.stringify(applyAction(s, me.id, { type: 'build', idx: grass[10], btype: 'factory', product: 'ultrafood' } as any))); }
