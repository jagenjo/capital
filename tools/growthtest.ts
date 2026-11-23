// Cities grow: tile counts over 120 turns (tools/growthtest.ts).
import { createGame, addCompany, processTurn, DEFAULT_SETTINGS } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: +(process.argv[2] ?? 11), aiCompanies: 3, startCash: 1_000_000, targetNetWorth: 0, events: true });
addCompany(s, { name: 'T', playerId: 't' });
const count = () => { const o: Record<string, number> = {}; for (const ch of s.world!.tiles) if ('ulsh'.includes(ch)) o[ch] = (o[ch] ?? 0) + 1; return o; };
console.log('start', JSON.stringify(count()), 'pop0', s.cities[0].pop);
const t0 = Date.now(); let rev = 0;
for (let t = 1; t <= 120; t++) { processTurn(s); if (t % 24 === 0) console.log('turn', t, JSON.stringify(count()), 'pop0', s.cities[0].pop, 'rev', s.world!.rev ?? 0, 'wealth0', s.cities[0].wealth); }
console.log('ms/turn', ((Date.now() - t0) / 120).toFixed(0), 'news', s.news.filter(n => n.text.includes(' grows:')).length, s.news.filter(n => n.text.includes(' grows:')).slice(-2).map(n => n.text));
const tot = { sold: 0, local: 0, co: 0, world: 0 }; for (const b of Object.values(s.buildings)) { tot.sold += b.report.sold; tot.local += b.report.soldLocal ?? 0; tot.co += b.report.soldCo ?? 0; tot.world += b.report.soldWorld ?? 0; }
console.log('last month units sold by all buildings:', JSON.stringify(tot, (_, v) => typeof v === 'number' ? Math.round(v) : v));
console.log('growth news tagged:', s.news.filter(n => n.tag === 'growth').length);
