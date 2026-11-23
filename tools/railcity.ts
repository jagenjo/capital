import { createGame, DEFAULT_SETTINGS, railMap, railLink, cityTile, haulCost } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 5, aiCompanies: 0 }); const w = s.world!;
const on = railMap(s)!.on; let bad = 0, n = 0; for (let i = 0; i < on.length; i++) if (on[i]) { n++; if ('ush'.includes(w.tiles[i])) bad++; }
console.log('rail tiles', n, 'in cities', bad, 'rails', w.rails!.length);
for (const r of w.rails!) console.log(r.a, r.b, 'linked centres', railLink(s, cityTile(s, s.cities[r.a]), cityTile(s, s.cities[r.b])), 'haul', haulCost(s, 'steel' as any, cityTile(s, s.cities[r.a]), cityTile(s, s.cities[r.b])));
