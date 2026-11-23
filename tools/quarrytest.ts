// Quarries can be built on any mountain tile (tools/quarrytest.ts).
import { createGame, addCompany, applyAction, processTurn, DEFAULT_SETTINGS, areaInfo, expansionIssue } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 11, aiCompanies: 0, startCash: 30_000_000, targetNetWorth: 0, events: false });
const c = addCompany(s, { name: 'Tester', playerId: 't' });
const tiles = s.world!.tiles; const m = [...tiles].map((ch, i) => ch === 'm' ? i : -1).filter(i => i >= 0);
const r = applyAction(s, c.id, { type: 'build', idx: m[500], btype: 'quarry', product: 'stone' }) as any; console.log('quarry on a mountain:', JSON.stringify(r).slice(0, 80));
const f = applyAction(s, c.id, { type: 'build', idx: m[800], btype: 'farm', product: 'grain' }) as any; console.log('farm on a mountain:', JSON.stringify(f).slice(0, 80));
for (let i = 0; i < 6; i++) processTurn(s);
const q = Object.values(s.buildings).find(b => b.type === 'quarry')!; console.log('quarry stock', q?.stock.qty.toFixed(1), 'area', JSON.stringify(areaInfo(s as any, q)));
const next = [q.idx + 1, q.idx - 1, q.idx + s.world!.w].find(i => tiles[i] === 'm');
console.log('expand onto mountain (quarry):', next != null ? expansionIssue(s as any, q, next) : 'n/a');
