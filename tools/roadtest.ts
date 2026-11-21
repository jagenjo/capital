import { createGame, DEFAULT_SETTINGS } from '../shared/engine.js';
for (const seed of [13, 5, 77]) {
  const t0 = Date.now(); const s = createGame({ ...DEFAULT_SETTINGS, seed, aiCompanies: 0 }); const w = s.world!;
  const W = w.w, tl = w.tiles; const onRail = new Set<number>(); let railTiles = 0;
  for (const r of w.rails!) for (const t of r.tiles) onRail.add(t);
  const roads = [...tl].filter(c => c === 'r').length;
  // overlap runs: consecutive tiles of a rail path that are road tiles
  let cross = 0, bad = 0, turnsR = 0, turnsRoad = 0;
  for (const r of w.rails!) { let run = 0; r.tiles.forEach((t, i) => { if (tl[t] === 'r') { run++; if (run === 1) cross++; if (run > 1) bad++; } else run = 0;
    if (i > 1) { const a = r.tiles[i - 2], b = r.tiles[i - 1]; if (b - a !== t - b) turnsR++; } }); railTiles += r.tiles.length; }
  const cities = s.cities.filter(c => !c.town), towns = s.cities.filter(c => c.town);
  const urb = (c: any) => 0;
  const cnt = (ch: string) => [...tl].filter(x => x === ch).length;
  console.log(`seed ${seed}: ${Date.now() - t0}ms | cities ${cities.length} (r ${cities.map(c => c.radius).join(',')}) towns ${towns.length} (pop ${towns.map(c => c.pop).join(',')}) | u ${cnt('u')} s ${cnt('s')} roads ${roads} | rails ${w.rails!.length} tiles ${railTiles} crossings ${cross} overlapRunTiles ${bad} turns/tile ${(turnsR / railTiles).toFixed(2)} | ports ${s.cities.filter(c => c.port).length} towns w/ port ${towns.filter(c => c.port).length}`);
}
