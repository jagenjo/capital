// AI companies open shops where city tiles lack everyday goods, and cities grow from it (tools/aishops.ts).
import { createGame, addCompany, processTurn, DEFAULT_SETTINGS, urbanTiles, tileServed, GROW_BASIC } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: +(process.argv[2] ?? 11), aiCompanies: 3, startCash: 1_000_000, targetNetWorth: 0, events: true });
addCompany(s, { name: 'T', playerId: 't' });
const count = () => { const o: Record<string, number> = {}; for (const ch of s.world!.tiles) if ('ulsh'.includes(ch)) o[ch] = (o[ch] ?? 0) + 1; return JSON.stringify(o); };
const fill = () => { const all = urbanTiles(s as any).flat().map(t => tileServed(s, t.idx).slice(0, GROW_BASIC.length)).flat(); return (all.reduce((a, x) => a + (x.need ? Math.min(1, x.got / x.need) : 0), 0) / all.length).toFixed(2); };
console.log('start', count());
for (let t = 1; t <= 60; t++) { processTurn(s); if (t % 12 === 0) {
  const shops = Object.values(s.buildings).filter(b => b.type === 'store' && s.companies.find(c => c.id === b.owner)?.isAI);
  const soldU = shops.reduce((a, b) => a + b.slots.reduce((n, x) => n + x.sold, 0), 0);
  console.log('turn', t, count(), 'AI shops', shops.length, 'units sold', Math.round(soldU), 'basic fill', fill(), 'AI cash', s.companies.filter(c => c.isAI).map(c => Math.round(c.cash / 1000) + 'k').join(' '));
} }
for (const c of s.companies.filter(c => c.isAI)) console.log(c.name, Math.round(c.cash / 1000) + 'k', 'debt', Math.round(c.debt / 1000) + 'k', JSON.stringify(c.ledger, (_, v) => typeof v === 'number' ? Math.round(v) : v), Object.values(s.buildings).filter(b => b.owner === c.id).map(b => b.type + (b.product ? ':' + b.product : '')).join(' '));
