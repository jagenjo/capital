// Headless economy sanity check: npm run sim
import { createGame, processTurn, netWorth, DEFAULT_SETTINGS, dateOf, companyBuildings, fmtMoney } from '../shared/engine.js';
import { PRODUCT_LIST } from '../shared/data.js';
const turns = +(process.argv[2] ?? 48);
const s = createGame({ ...DEFAULT_SETTINGS, seed: 13, aiCompanies: 5, targetNetWorth: 0, maxMonths: 9999 });
if (process.argv[3] === 'prices') for (const p of PRODUCT_LIST) console.log(p.id.padEnd(12), p.kind.padEnd(12), 'base', p.basePrice, 'depth', p.depth);
for (let t = 0; t < turns; t++) {
  processTurn(s);
  if (t % 6 === 5 || t === turns - 1) {
    console.log(`\n== ${dateOf(s)} (turn ${s.turn})`);
    for (const c of s.companies) console.log(c.name.padEnd(18), c.aiFocus?.padEnd(10), 'cash', fmtMoney(c.cash).padStart(12), 'debt', c.debt, 'NW', fmtMoney(netWorth(s, c)).padStart(12), 'bld', companyBuildings(s, c.id).length, 'rev', Math.round(c.ledger.revenue), 'profit', Math.round(c.ledger.profit), c.bankrupt ? 'BANKRUPT' : '');
  }
}
