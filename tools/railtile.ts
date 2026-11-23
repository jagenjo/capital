// Railroad tiles: every rail tile is terrain 'i' and nothing can be built on it (tools/railtile.ts).
import { createGame, addCompany, applyAction, DEFAULT_SETTINGS } from '../shared/engine.js';
for (const seed of [11, 5, 42]) {
  const s = createGame({ ...DEFAULT_SETTINGS, seed, aiCompanies: 0, startCash: 9e6, targetNetWorth: 0, events: false }); const c = addCompany(s, { name: 'T', playerId: 't' });
  const rails = s.world!.rails ?? []; const all = rails.flatMap(r => r.tiles); const n = [...s.world!.tiles].filter(ch => ch === 'i').length;
  console.log('seed', seed, 'rail tiles', all.length, '| tiles of type i', n, '| all rail tiles are i:', all.every(t => s.world!.tiles[t] === 'i'));
  console.log('  build a factory on a rail tile:', JSON.stringify(applyAction(s, c.id, { type: 'build', idx: all[5], btype: 'factory', product: 'bread' })));
}
