import { createGame, addCompany, applyAction, DEFAULT_SETTINGS, gridN } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 5, aiCompanies: 0 }); const w = s.world!;
const me = addCompany(s, { name: 'Me', playerId: 'm' }); me.cash = 1e9; const used = new Set<number>();
for (const [t, grid] of [['g', 2], ['g', 3], ['g', 4], ['g', undefined], ['u', 4], ['s', 2]] as const) {
  let idx = -1; for (let i = 0; i < w.tiles.length; i++) if (w.tiles[i] === t && !used.has(i)) { idx = i; break; } used.add(idx);
  const c0 = me.cash; const r: any = applyAction(s, me.id, { type: 'build', idx, btype: 'factory', product: 'bread', grid } as any);
  const b = s.buildings[r.info]; console.log(t, 'asked', grid, '→ grid', gridN(b), 'paid', Math.round(c0 - me.cash), 'invested', b.invested);
}
