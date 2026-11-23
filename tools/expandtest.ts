// Expansions of extractive facilities: buy 5x5 tiles next to the mine, +20% each, others cannot use them.
import { createGame, addCompany, DEFAULT_SETTINGS, applyAction, areaInfo, efficiency, expansionIssue } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 7, aiCompanies: 0 }); const w = s.world!;
const me = addCompany(s, { name: 'Me', playerId: 'm' }), other = addCompany(s, { name: 'Other', playerId: 'o' }); me.cash = 1e9; other.cash = 1e9;
let best = -1, bc = -1;
for (let i = 0; i < w.tiles.length; i++) if (w.tiles[i] === 'e') { let c = 0; const x = i % w.w, y = Math.floor(i / w.w); for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (w.tiles[(y + dy) * w.w + x + dx] === 'e') c++; if (c > bc) { bc = c; best = i; } }
const r = applyAction(s, me.id, { type: 'build', idx: best, btype: 'mine', product: 'ore' } as any) as any; console.log('build', r.ok, r.error);
const b = s.buildings[r.info]; b.building = 0;
console.log('base factor', areaInfo(s, b).factor, 'avail', areaInfo(s, b).max);
const x0 = best % w.w, y0 = Math.floor(best / w.w);
const far = (x0 + 2) + (y0 + 2) * w.w;
console.log('far tile not touching:', expansionIssue(s as any, b, far));
let bought = 0;
for (let k = 0; k < 4; k++) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const r2 = applyAction(s, me.id, { type: 'buyExpansion', id: b.id, idx: (y0 + dy) * w.w + x0 + dx } as any) as any; if (r2.ok) bought++; }
console.log('bought', bought, 'expand', b.expand?.length, 'factor', areaInfo(s, b).factor.toFixed(2), 'eff', efficiency(s, b).toFixed(2));
const t = b.expand![0]; console.log('other builds on it:', (applyAction(s, other.id, { type: 'build', idx: t, btype: 'mine', product: 'ore' } as any) as any).error);
console.log('self builds on it:', (applyAction(s, me.id, { type: 'build', idx: t, btype: 'mine', product: 'ore' } as any) as any).error);
console.log('other buys it:', (applyAction(s, other.id, { type: 'buyExpansion', id: b.id, idx: t } as any) as any).error);
console.log('release', (applyAction(s, me.id, { type: 'releaseLot', idx: t } as any) as any).ok, 'expand now', b.expand!.length);
