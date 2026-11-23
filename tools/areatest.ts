import { createGame, addCompany, applyAction, processTurn, DEFAULT_SETTINGS, areaInfo, efficiency } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 7, aiCompanies: 0, startCash: 50_000_000, targetNetWorth: 0 });
const c = addCompany(s, { name: 'Me', playerId: 'm' }); const w = s.world!;
const A = (a: any) => applyAction(s, c.id, a) as any;
const find = (ch: string, cnt: (i: number) => number, want: 'min' | 'max') => { let best = -1, bv = want === 'min' ? 1e9 : -1; for (let i = 0; i < w.tiles.length; i++) if (w.tiles[i] === ch) { const v = cnt(i); if (want === 'min' ? v < bv : v > bv) { bv = v; best = i; } } return best; };
for (const [t, ch, prod] of [['mine', 'e', 'ore'], ['copper', 'c', 'copper'], ['oil', 'o', 'oil'], ['forest', 't', 'timber']] as const) {
  for (const want of ['min', 'max'] as const) { const i = find(ch, i => areaInfo(s, { type: t, idx: i }).count, want); const r = A({ type: 'build', idx: i, btype: t, product: prod }); if (r.error) { console.log(t, want, r.error); continue; } const b = s.buildings[r.info]; console.log(t, want, 'count', areaInfo(s, b).count, 'factor', areaInfo(s, b).factor.toFixed(2), r.error ?? ''); }
}
for (const [t, extra] of [['factory', { product: 'bread' }], ['store', {}], ['rd', { product: 'phones' }]] as const) {
  for (const want of ['min', 'max'] as const) { const i = find('g', i => areaInfo(s, { type: t, idx: i }).pop, want); const r = A({ type: 'build', idx: i, btype: t, ...extra }); if (r.error) { console.log(t, want, r.error); continue; } const b = s.buildings[r.info]; const a = areaInfo(s, b); console.log(t, want, 'pop', a.pop, 'factor', a.factor.toFixed(2), 'eff', efficiency(s, b).toFixed(2)); }
}
