import { createGame, DEFAULT_SETTINGS } from '../shared/engine.js';
for (const seed of [1, 2, 3, 13, 77, 123]) { for (const n of [3, 8, 16]) {
  const s = createGame({ ...DEFAULT_SETTINGS, seed, aiCompanies: 0, cityCount: n }); const c = s.cities[0]; const big = Math.max(...s.cities.filter(x => x.id > 0 && !x.town).map(x => x.pop), 0);
  const mall = s.vacant!.find(v => v.type === 'mall' && v.perm);
  console.log(`seed ${seed} cities ${n}: city0 pop ${c.pop} radius ${c.radius} port ${c.port} (next biggest ${big}) mall vacancy ${mall ? 'yes idx ' + mall.idx + ' in city ' + mall.city : 'NO'}`); } }
