import { createGame, DEFAULT_SETTINGS, railMap } from '../shared/engine.js';
for (const seed of [3, 5, 9, 21]) {
  const s = createGame({ ...DEFAULT_SETTINGS, seed, aiCompanies: 0 }); const w = s.world!; const WW = w.w;
  // flood exterior water to verify every port dock touches exterior sea
  const ext = new Set<number>(); const q: number[] = [];
  const seedw = (i: number) => { if (!ext.has(i) && 'ad'.includes(w.tiles[i])) { ext.add(i); q.push(i); } };
  for (let x = 0; x < WW; x++) { seedw(x); seedw((w.h - 1) * WW + x); } for (let y = 0; y < w.h; y++) { seedw(y * WW); seedw(y * WW + WW - 1); }
  while (q.length) { const i = q.pop()!; const x = i % WW, y = (i / WW) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < WW && yy < w.h) seedw(yy * WW + xx); } }
  let lakeDocks = 0, docks = 0; for (let i = 0; i < w.tiles.length; i++) if (w.tiles[i] === 'p') { docks++; const nb = [i + 1, i - 1, i + WW, i - WW].some(j => ext.has(j)); if (!nb) lakeDocks++; }
  const m = railMap(s);
  console.log(seed, 'ports', s.cities.filter(c => c.port).length, 'docks', docks, 'lakeDocks', lakeDocks, 'rails', (w.rails ?? []).map(r => r.a + '-' + r.b + ':' + r.tiles.length).join(' '), 'comps', m ? new Set(m.comp).size : 0);
}
