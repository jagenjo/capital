import { createGame, DEFAULT_SETTINGS, tilePop, tileTransport } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 21, aiCompanies: 0 }); const t = s.world!.tiles; const c: Record<string, number> = {};
for (const ch of t) c[ch] = (c[ch] || 0) + 1; console.log(JSON.stringify(c));
let tot = 0; for (let i = 0; i < t.length; i++) if ('us'.includes(t[i])) tot += tilePop(s, i);
console.log('urban pop sum', tot, 'cities', s.cities.reduce((a, x) => a + x.pop, 0));
const ci = s.cities[0]; const i = Math.floor(ci.y / 2.5) * 400 + Math.floor(ci.x / 2.5); console.log('city0 centre pop', tilePop(s, i), 'transport', tileTransport(s, i));
