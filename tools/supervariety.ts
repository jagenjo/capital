import { createGame, addCompany, applyAction, processTurn, superBonus, DEFAULT_SETTINGS } from '../shared/engine.js';
for (const goods of [4, 5, 6]) {
  const s = createGame({ ...DEFAULT_SETTINGS, seed: 7, aiCompanies: 0 }); const me = addCompany(s, { name: 'Me', playerId: 'm' }); me.cash = 1e9;
  const idx = [...s.world!.tiles].findIndex(c => c === 's');
  const b = s.buildings[(applyAction(s, me.id, { type: 'build', idx, btype: 'supermarket' } as any) as any).info]; b.building = 0; b.workers = 40;
  b.slots.forEach((sl, i) => { sl.stock.qty = i < goods ? 500 : 0; sl.price = Math.round(sl.price * 0.9 * 100) / 100; });
  console.log(goods, 'goods: bonus', superBonus(b)); processTurn(s);
  console.log('  bread sold', b.slots[0].sold);
}
