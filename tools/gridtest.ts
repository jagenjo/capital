import { createGame, addCompany, applyAction, DEFAULT_SETTINGS, layoutIssues, gridN } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 5, aiCompanies: 0 }); const w = s.world!;
const me = addCompany(s, { name: 'Me', playerId: 'm' }); me.cash = 1e9;
for (const t of ['u', 's', 'g']) for (const p of ['bread', 'furniture', 'electronics']) {
  const idx = [...w.tiles].findIndex((c, i) => c === t && !Object.values(s.buildings).some(b => b.idx === i));
  const r: any = applyAction(s, me.id, { type: 'build', idx, btype: 'factory', product: p } as any);
  const b = s.buildings[r.info]; if (!b) { console.log(t, p, JSON.stringify(r)); continue; }
  console.log(t, p, 'grid', gridN(b), 'cells', b.layout!.length, 'used', b.layout!.filter(c => c.m).length, 'links', b.links!.length, layoutIssues(b, s.cities).filter(x => !/source/i.test(x)).join('|'));
}
