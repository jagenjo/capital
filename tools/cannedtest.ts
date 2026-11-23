// Canned food: vegetables + livestock -> cans, sold in shops (tools/cannedtest.ts).
import { PRODUCTS } from '../shared/data.js';
import { createGame, addCompany, processTurn, seedStarter, DEFAULT_SETTINGS } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 11, aiCompanies: 3, startCash: 1_000_000, targetNetWorth: 0, events: false });
const p = PRODUCTS.canned; console.log('canned recipe', JSON.stringify(p.recipe), 'base price', Math.round(p.basePrice), 'depth', p.depth, 'demandPerK', p.demandPerK);
addCompany(s, { name: 'T', playerId: 't' }); for (let t = 0; t < 24; t++) processTurn(s);
const made = Object.values(s.buildings).filter(b => b.product === 'canned'); console.log('AI facilities making canned food after 24 turns:', made.length, '| local sales of canned:', JSON.stringify(s.sales!.local.canned ?? {}));
