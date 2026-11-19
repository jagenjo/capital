import { createGame, addCompany, applyAction, processTurn, DEFAULT_SETTINGS, harbourId, harbourGoodPrice } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 11, aiCompanies: 0, startCash: 20_000_000, targetNetWorth: 0, events: false });
const show = (label: string) => { console.log(label); for (const c of s.cities.filter(x => x.port)) console.log('  ' + c.name.padEnd(12), c.harbour!.map(g => g.product + ' ' + Math.round(g.qty) + '@' + harbourGoodPrice(s, g).toFixed(0) + ' (age ' + (s.turn - g.since) + ')').join(' | ')); };
show('turn 0');
const c = addCompany(s, { name: 'T', playerId: 't' });
const port = s.cities.find(x => x.port)!; const good = port.harbour![0];
const tile = [...s.world!.tiles].map((ch, i) => ch === 'u' ? i : -1).filter(i => i >= 0).find(i => true)!;
// a store selling a consumer good the harbour stocks (find one), else just test errors
const cons = port.harbour!.find(g => ['bread','meat','furniture','fuel','clothing','appliances','computers','cars'].includes(g.product));
console.log('port', port.name, 'consumer good in stock:', cons?.product);
const st = applyAction(s, c.id, { type: 'build', idx: tile, btype: 'store' }) as any;
if (cons) {
  console.log('shelf with stocked harbour good:', JSON.stringify(applyAction(s, c.id, { type: 'setSlot', id: st.info, slot: 0, product: cons.product, price: 999, order: 100000, source: harbourId(port.id) })));
  applyAction(s, c.id, { type: 'setStaff', id: st.info, workers: 4, wage: 2500 });
  const before = cons.qty; processTurn(s); console.log('bought', Math.round(before - port.harbour!.find(g => g.product === cons.product)?.qty!), 'units; harbour qty left', port.harbour!.map(g => g.product + ':' + Math.round(g.qty)).join(' '));
}
const other = ['grain','livestock','timber','ore','oil','steel','plastics','electronics','bread','meat','furniture','fuel','clothing','appliances','computers','cars'].find(p => !port.harbour!.some(g => g.product === p))!;
console.log('slot with a good the harbour lacks (' + other + '):', JSON.stringify(applyAction(s, c.id, { type: 'setCell', id: st.info, cell: 0, product: other as any })));
for (let i = 0; i < 13; i++) processTurn(s);
show('turn 14 (rotated after depletion / 12 months)');
