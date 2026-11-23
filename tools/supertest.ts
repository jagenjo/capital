import { createGame, addCompany, applyAction, processTurn, areaInfo, DEFAULT_SETTINGS } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 7, aiCompanies: 0 }); const me = addCompany(s, { name: 'Me', playerId: 'm' }); me.cash = 1e9;
const city = s.cities[0]; const w = s.world!;
// two suburb tiles: one in the dense core, one at the edge
const sub = [...w.tiles].map((c, i) => c === 's' ? i : -1).filter(i => i >= 0);
const pop = (i: number) => areaInfo(s, { type: 'store', idx: i }).pop;
sub.sort((a, b) => pop(a) - pop(b));
for (const [label, idx] of [['edge', sub[Math.floor(sub.length * 0.1)]], ['core', sub[sub.length - 1]]] as const) {
  const r = applyAction(s, me.id, { type: 'build', idx, btype: 'supermarket' } as any) as any; if (r.error) { console.log(label, r.error); continue; }
  const b = s.buildings[r.info]; b.building = 0; b.workers = 40; console.log(label, 'pop5x5', pop(idx), b.type, b.super, b.slots.map(x => x.product).join(','), 'bad shelf:', JSON.stringify(applyAction(s, me.id, { type: 'setSlot', id: b.id, slot: 0, product: 'cars', price: 10, order: 10, source: '' } as any)));
  for (const sl of b.slots) { sl.stock.qty = 500; sl.price = Math.round(sl.price * 0.9 * 100) / 100; }
}
for (let t = 0; t < 3; t++) processTurn(s);
for (const b of Object.values(s.buildings)) console.log(b.name, 'revenue last month', Math.round(b.report.revenue), b.report.note);
