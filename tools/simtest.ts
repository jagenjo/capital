import { createGame, processTurn, DEFAULT_SETTINGS, netWorth } from '../shared/engine.js';
import { PRODUCTS } from '../shared/data.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 13, aiCompanies: 4, targetNetWorth: 0 });
for (let i = 0; i < 36; i++) processTurn(s);
console.log('electronics recipe', PRODUCTS.electronics.recipe, 'components', PRODUCTS.components.recipe, 'copper price', PRODUCTS.copper.basePrice.toFixed(0), 'components', PRODUCTS.components.basePrice.toFixed(0), 'electronics', PRODUCTS.electronics.basePrice.toFixed(0));
const mk = Object.values(s.buildings).filter(b => b.product && ['copper', 'components', 'electronics'].includes(b.product)).map(b => b.product);
console.log('buildings', Object.keys(s.buildings).length, 'copper-chain', mk.join(','), s.companies.map(c => Math.round(netWorth(s, c) / 1000) + 'k').join(' '));
