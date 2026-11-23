// Resource clusters per map: at most 5 of each kind (4 for rare ores), of different sizes, away from roads/rails and cities.
import { createGame, DEFAULT_SETTINGS } from '../shared/engine.js';
import { WORLD_SCALE } from '../shared/world.js';
const NAMES: Record<string, string> = { o: 'oil', e: 'iron', c: 'copper', x: 'rare' };
for (const seed of [1, 7, 11, 13, 42, 99]) {
  const s = createGame({ ...DEFAULT_SETTINGS, seed, aiCompanies: 3 }); const w = s.world!; const seen = new Set<number>(); const out: string[] = [];
  for (const ch of Object.keys(NAMES)) {
    const sizes: number[] = [];
    for (let i = 0; i < w.tiles.length; i++) { if (w.tiles[i] !== ch || seen.has(i)) continue; let n = 0; const st = [i]; seen.add(i);
      while (st.length) { const j = st.pop()!; n++; for (const d of [-1, 1, -w.w, w.w, -w.w - 1, -w.w + 1, w.w - 1, w.w + 1]) { const k = j + d; if (k >= 0 && k < w.tiles.length && w.tiles[k] === ch && !seen.has(k) && Math.abs((k % w.w) - (j % w.w)) <= 1) { seen.add(k); st.push(k); } } }
      sizes.push(n); }
    out.push(`${NAMES[ch]} ${sizes.length}: [${sizes.sort((a, b) => b - a).join(',')}]`);
  }
  let min = 1e9; for (let i = 0; i < w.tiles.length; i++) if ('oecx'.includes(w.tiles[i])) for (const c of s.cities) min = Math.min(min, Math.hypot(c.x / WORLD_SCALE - (i % w.w), c.y / WORLD_SCALE - Math.floor(i / w.w)) - c.radius);
  console.log('seed', seed, out.join(' | '), '| gap to cities', min.toFixed(0));
}
