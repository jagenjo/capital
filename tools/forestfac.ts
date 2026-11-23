// Factories on forest, forests reduce pollution, suburb factories choose 2x2 or 3x3 (tools/forestfac.ts).
import { createGame, addCompany, applyAction, DEFAULT_SETTINGS, tilePollution, gridN } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 11, aiCompanies: 0, startCash: 80e6, targetNetWorth: 0, events: false, starter: false }); const c = addCompany(s, { name: 'T', playerId: 't' });
const w = s.world!; const forest = [...w.tiles].findIndex(ch => ch === 't');
console.log('factory on forest:', JSON.stringify(applyAction(s, c.id, { type: 'build', idx: forest, btype: 'factory', product: 'bread', grid: 3 })), '| layout', gridN(Object.values(s.buildings)[0]), 'x', gridN(Object.values(s.buildings)[0]));
// pollution beside a city: forest-rich tiles vs forest-free tiles at similar distance from the centre
const city = s.cities[0], cx = Math.floor(city.x / 2.5), cy = Math.floor(city.y / 2.5); const rows: { d: number; dens: number; poll: number }[] = [];
for (let y = cy - 24; y <= cy + 24; y++) for (let x = cx - 24; x <= cx + 24; x++) { if (x < 0 || y < 0 || x >= w.w || y >= w.h) continue; const i = y * w.w + x; if (w.tiles[i] === 'd' || w.tiles[i] === 'a') continue; let n = 0, tot = 0; for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w.w || Y >= w.h) continue; tot++; if (w.tiles[Y * w.w + X] === 't') n++; } rows.push({ d: Math.hypot(x - cx, y - cy), dens: n / tot, poll: tilePollution(s as any, i) }); }
const band = (lo: number, hi: number, forestRich: boolean) => { const r = rows.filter(x => x.d >= lo && x.d < hi && (forestRich ? x.dens > 0.5 : x.dens < 0.05)); return r.length ? (r.reduce((a, x) => a + x.poll, 0) / r.length * 100).toFixed(0) + '% (' + r.length + ' tiles)' : 'n/a'; };
for (const [lo, hi] of [[8, 14], [14, 20]]) console.log(`pollution ${lo}-${hi} tiles from ${city.name}: forest-rich ${band(lo, hi, true)} vs no forest ${band(lo, hi, false)}`);
// suburb factory sizes and prices
const sub = [...w.tiles].findIndex((ch, i) => ch === 's' && !s.lots[String(i)]);
for (const g of [2, 3, 4]) { const s2 = JSON.parse(JSON.stringify(s)); const cash0 = s2.companies[0].cash; const r = applyAction(s2, s2.companies[0].id, { type: 'build', idx: sub, btype: 'factory', product: 'bread', grid: g }) as any; const b = Object.values(s2.buildings as Record<string, any>).find(x => x.idx === sub); console.log('suburb factory, asked', g + 'x' + g, '→ layout', b ? gridN(b) : r.error, '| paid', Math.round(cash0 - s2.companies[0].cash)); }
