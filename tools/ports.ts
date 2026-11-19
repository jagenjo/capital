import { createGame, DEFAULT_SETTINGS } from '../shared/engine.js';
for (const seed of [3, 5, 9, 21]) {
  const s = createGame({ ...DEFAULT_SETTINGS, seed, aiCompanies: 0 }); const w = s.world!;
  const res = s.cities.map(c => {
    const cx = Math.floor(c.x / 2.5), cy = Math.floor(c.y / 2.5); let touch = false, docks = 0;
    for (let y = cy - 16; y <= cy + 16; y++) for (let x = cx - 16; x <= cx + 16; x++) {
      const ch = w.tiles[y * w.w + x]; if (ch === 'p') { docks++; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if ('us'.includes(w.tiles[(y + dy) * w.w + x + dx])) touch = true; }
    }
    return c.port ? (touch ? 'harbour(' + docks + ')' : 'PORT-NOT-TOUCHING') : 'inland';
  });
  console.log(seed, res.join(' '));
}
