import { createGame, addCompany, applyAction, areaInfo, efficiency, DEFAULT_SETTINGS } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 7, aiCompanies: 0 }); const w = s.world!; const me = addCompany(s, { name: 'Me', playerId: 'm' }); me.cash = 1e9;
for (const ch of ['t', 'f', 's']) { const h = new Array(10).fill(0); for (let i = 0; i < w.tiles.length; i++) if (w.tiles[i] === ch) h[+w.qual![i]]++; console.log(ch, 'quality histogram 0-9', h.join(' ')); }
for (const [ch, bt, prod] of [['t', 'forest', 'timber'], ['f', 'farm', 'grain'], ['s', 'store', null]] as const) {
  const idxs = [...w.tiles].map((c, i) => c === ch ? i : -1).filter(i => i >= 0).sort((a, b) => +w.qual![a] - +w.qual![b]);
  for (const i of [idxs[0], idxs[idxs.length - 1]]) { const r = applyAction(s, me.id, { type: 'build', idx: i, btype: bt, product: prod ?? undefined } as any) as any; if (r.error) { console.log(bt, r.error); continue; } const b = s.buildings[r.info]; b.building = 0; const a = areaInfo(s, b); console.log(bt, 'quality', w.qual![i], a.qualityName, a.quality?.toFixed(2), 'factor', a.factor.toFixed(2)); }
}
