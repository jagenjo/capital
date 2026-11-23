// Decorating a store raises the brand of what it sells (tools/decortest.ts).
import { createGame, addCompany, applyAction, processTurn, seedStarter, DEFAULT_SETTINGS } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 11, aiCompanies: 2, startCash: 3e6, targetNetWorth: 0, events: false }); const c = addCompany(s, { name: 'T', playerId: 't' }); seedStarter(s, c);
const st = Object.values(s.buildings).find(b => b.owner === c.id && b.type === 'store')!; const p = st.slots.find(x => x.product)!.product!;
console.log('store size', st.size, 'brand of', p, c.brand[p], 'cash', c.cash);
for (const amt of [10000, 50000, 250000, 5000000]) { const r = applyAction(s, c.id, { type: 'decorate', id: st.id, amount: amt }) as any; console.log(' decorate', amt, JSON.stringify(r).slice(0, 60), '→ decor', st.decor?.toFixed(1), 'cash', Math.round(c.cash)); }
for (let t = 1; t <= 8; t++) { processTurn(s); if (t % 2 === 0) console.log('turn', t, 'decor', st.decor?.toFixed(1), 'brand', p, c.brand[p].toFixed(1)); }
