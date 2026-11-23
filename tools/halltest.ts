import { createGame, DEFAULT_SETTINGS, areaInfo, cityTile, addCompany, applyAction } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 5, aiCompanies: 0 }); const w = s.world!;
console.log('halls', [...w.tiles].filter(c => c === 'h').length, 'cities', s.cities.length);
const c = s.cities[0], h = cityTile(s, c); console.log('centre tile', w.tiles[h]);
const me = addCompany(s, { name: 'Me', playerId: 'm' }); me.cash = 1e9;
console.log('build on hall', JSON.stringify(applyAction(s, me.id, { type: 'build', idx: h, btype: 'store' } as any)));
for (const d of [1, 2, 3]) { const i = h + d; console.log('dist', d, w.tiles[i], areaInfo(s, { type: 'store', idx: i }).hall, areaInfo(s, { type: 'factory', idx: i }).hall); }
