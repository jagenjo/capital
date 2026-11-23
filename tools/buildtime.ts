// Construction times: 1 turn for most, 2 for mines/quarries/wells, 3 for malls (tools/buildtime.ts).
import { createGame, addCompany, applyAction, processTurn, DEFAULT_SETTINGS } from '../shared/engine.js';
import { BUILD_TURNS } from '../shared/data.js';
console.log(JSON.stringify(BUILD_TURNS));
const s = createGame({ ...DEFAULT_SETTINGS, seed: 11, aiCompanies: 0, startCash: 60e6, targetNetWorth: 0, events: false, starter: false }); const c = addCompany(s, { name: 'T', playerId: 't' });
const near = (ch: string) => [...s.world!.tiles].findIndex(x => x === ch);
const orders: [string, number, string?][] = [['factory', near('g'), 'bread'], ['mine', near('e'), 'ore'], ['quarry', near('m'), 'stone']];
for (const [bt, idx, p] of orders) applyAction(s, c.id, { type: 'build', idx, btype: bt as never, product: p as never });
for (let t = 1; t <= 4; t++) { processTurn(s); console.log('after turn', t, Object.values(s.buildings).map(b => b.type + ':' + (b.building ?? 0)).join(' ')); }
