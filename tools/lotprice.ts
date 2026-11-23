// City land costs by population; building pays land + installation + tax (tools/lotprice.ts).
import { createGame, addCompany, applyAction, DEFAULT_SETTINGS, lotPrice, tilePop } from '../shared/engine.js';
import { BUILD_TAX, BUILDINGS } from '../shared/data.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 11, aiCompanies: 0, startCash: 50e6, targetNetWorth: 0, events: false, starter: false }); const c = addCompany(s, { name: 'T', playerId: 't' });
const w = s.world!; const urb = [...w.tiles].map((ch, i) => ch === 'u' || ch === 's' ? i : -1).filter(i => i >= 0);
const rows = urb.filter((_, k) => k % 97 === 0).slice(0, 8).map(i => ({ t: w.tiles[i], pop: tilePop(s as any, i), price: lotPrice(s, i) }));
for (const r of rows) console.log(r.t, 'pop', r.pop, 'price', r.price, 'price/pop', (r.price / r.pop).toFixed(2));
const i = urb.find(k => w.tiles[k] === 's' && !s.lots[String(k)])!; const land = lotPrice(s, i); const cash0 = c.cash;
const r = applyAction(s, c.id, { type: 'build', idx: i, btype: 'store' }) as any; console.log('order', JSON.stringify(r).slice(0, 50));
const spent = cash0 - c.cash; const construction = spent / (1 + BUILD_TAX) - land; console.log('spent', Math.round(spent), '= land', land, '+ construction', Math.round(construction), '+ tax', Math.round((land + construction) * BUILD_TAX), '| store cost in data', BUILDINGS.store.cost, '| tax ledger', Math.round(c.ledger.tax));
