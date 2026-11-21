import { createGame, DEFAULT_SETTINGS, costField, haulPath, haulCost, cityTile } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 7, aiCompanies: 0 }); const w = s.world!;
let t = Date.now(); const o = cityTile(s, s.cities[0]); const f = costField(s, o); console.log('field ms', Date.now() - t, 'tiles', w.w * w.h);
const reach = f.filter(x => x !== 65535).length; console.log('reachable', reach);
for (const c of s.cities.slice(1, 6)) { const to = cityTile(s, c); console.log(c.name, 'path cost', haulPath(s, o, to), 'bread/unit', haulCost(s, 'bread', o, to).toFixed(2), 'old-ish dist', s.dist![0][c.id]); }
t = Date.now(); for (let i = 0; i < 40; i++) costField(s, cityTile(s, s.cities[i % s.cities.length]) + i); console.log('40 fields ms', Date.now() - t);
import { railMap } from '../shared/engine.js';
const a = cityTile(s, s.cities[0]), b2 = cityTile(s, s.cities[2]); const route = (await import('../shared/engine.js')).haulRoute(s, a, b2);
console.log('route tiles', route.length, 'starts', route[0] === a, 'ends', route[route.length - 1] === b2, 'cost', haulPath(s, a, b2), 'rail tiles on route', route.filter(i => railMap(s)?.on[i]).length);
