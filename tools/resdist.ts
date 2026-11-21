import { createGame, DEFAULT_SETTINGS } from '../shared/engine.js';
import { WORLD_SCALE } from '../shared/world.js';
for (const seed of [1, 7, 11, 13, 42]) {
  const s = createGame({ ...DEFAULT_SETTINGS, seed, aiCompanies: 3 }); const w = s.world!; let min = 1e9, o = 0, e = 0;
  for (let i = 0; i < w.tiles.length; i++) { const ch = w.tiles[i]; if (ch !== 'o' && ch !== 'e') continue; ch === 'o' ? o++ : e++;
    for (const c of s.cities) min = Math.min(min, Math.hypot(c.x / WORLD_SCALE - (i % w.w), c.y / WORLD_SCALE - Math.floor(i / w.w)) - c.radius); }
  console.log('seed', seed, 'oil tiles', o, 'ore tiles', e, 'min gap to city edge', min.toFixed(1));
}
