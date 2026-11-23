// Suburb tiles next to downtown hold more people than the ones further out (tools/suburbpop.ts).
import { createGame, DEFAULT_SETTINGS, tilePop, lotPrice } from '../shared/engine.js';
import { nearestCity } from '../shared/world.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: +(process.argv[2] ?? 11), aiCompanies: 0, events: false }); const w = s.world!; const W = w.w;
const city = s.cities.reduce((a, b) => b.pop > a.pop ? b : a); const sub: { d: number; pop: number }[] = []; let total = 0;
for (let i = 0; i < w.tiles.length; i++) { const ch = w.tiles[i]; if (nearestCity(s.cities, i) !== city.id || !'ulshw'.includes(ch)) continue; total += tilePop(s as any, i); if (ch !== 's') continue;
  let d = 99; for (let dy = -12; dy <= 12; dy++) for (let dx = -12; dx <= 12; dx++) { const X = (i % W) + dx, Y = ((i / W) | 0) + dy; if (X < 0 || Y < 0 || X >= W || Y >= w.h) continue; if ('ulh'.includes(w.tiles[Y * W + X])) d = Math.min(d, Math.max(Math.abs(dx), Math.abs(dy))); } sub.push({ d, pop: tilePop(s as any, i) }); }
const avg = (a: number[]) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0;
for (const [lo, hi, label] of [[1, 1, 'touching downtown'], [2, 3, '2-3 tiles away'], [4, 6, '4-6 tiles away'], [7, 99, '7+ tiles away']] as const) { const r = sub.filter(x => x.d >= lo && x.d <= hi); console.log(label.padEnd(18), 'suburb tiles', String(r.length).padStart(4), '| avg people per tile', String(avg(r.map(x => x.pop))).padStart(6)); }
console.log(city.name, 'city population', city.pop, '| sum over its tiles', total);
