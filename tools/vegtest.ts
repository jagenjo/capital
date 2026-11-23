// Farms can grow vegetables (tools/vegtest.ts).
import { createGame, addCompany, applyAction, processTurn, DEFAULT_SETTINGS } from '../shared/engine.js';
import { PRODUCTS } from '../shared/data.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 11, aiCompanies: 0, startCash: 5_000_000, targetNetWorth: 0, events: false });
const c = addCompany(s, { name: 'T', playerId: 't' }); const f = [...s.world!.tiles].findIndex(ch => ch === 'f');
console.log('farm vegetables:', JSON.stringify(applyAction(s, c.id, { type: 'build', idx: f, btype: 'farm', product: 'vegetables' })), 'def', PRODUCTS.vegetables.rawPrice, PRODUCTS.vegetables.spoil);
for (let i = 0; i < 6; i++) processTurn(s);
const b = Object.values(s.buildings)[0]; console.log('product', b.product, 'stock', Math.round(b.stock.qty), 'produced', b.report.produced);
