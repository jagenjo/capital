import { createGame, DEFAULT_SETTINGS } from '../shared/engine.js';
const t0 = Date.now();
const s = createGame({ ...DEFAULT_SETTINGS, seed: +(process.argv[2] ?? 5), aiCompanies: 0, cityCount: +(process.argv[3] ?? 8) });
console.log('generated in', Date.now() - t0, 'ms');
const w = s.world!; const cnt: Record<string, number> = {};
for (const ch of w.tiles) cnt[ch] = (cnt[ch] ?? 0) + 1;
console.log(w.w + 'x' + w.h, JSON.stringify(cnt));
console.log(s.cities.map(c => `${c.name}${c.port ? '(port)' : ''} r${c.radius} @${Math.round(c.x / 2.5)},${Math.round(c.y / 2.5)}`).join(' | '));
