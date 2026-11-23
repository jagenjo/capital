// Fruits come from farms; beverages need sugar + fruit (tools/fruittest.ts).
import { PRODUCTS, BUILDINGS } from '../shared/data.js';
import { createGame, addCompany, processTurn, applyAction, DEFAULT_SETTINGS } from '../shared/engine.js';
console.log('beverages recipe', JSON.stringify(PRODUCTS.beverages.recipe), 'base price', Math.round(PRODUCTS.beverages.basePrice), '| fruits', PRODUCTS.fruits.rawPrice, 'farm products', BUILDINGS.farm.products!.join(','));
const s = createGame({ ...DEFAULT_SETTINGS, seed: 11, aiCompanies: 0, startCash: 5_000_000, targetNetWorth: 0, events: false });
const c = addCompany(s, { name: 'T', playerId: 't' }); const f = [...s.world!.tiles].findIndex(ch => ch === 'f');
console.log('farm fruits:', JSON.stringify(applyAction(s, c.id, { type: 'build', idx: f, btype: 'farm', product: 'fruits' })));
for (let i = 0; i < 6; i++) processTurn(s); const b = Object.values(s.buildings)[0]; console.log('fruit farm stock', Math.round(b.stock.qty), 'produced', b.report.produced);
const t = createGame({ ...DEFAULT_SETTINGS, seed: 11, aiCompanies: 4, startCash: 1e6, targetNetWorth: 0, events: true }); addCompany(t, { name: 'T', playerId: 't' }); for (let i = 0; i < 36; i++) processTurn(t);
console.log('AI makers of beverages:', Object.values(t.buildings).filter(x => x.product === 'beverages').length, 'fruit farms:', Object.values(t.buildings).filter(x => x.product === 'fruits').length);
