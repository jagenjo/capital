// Decoration raises a shop's customer attraction as well as the brand (tools/decorattract.ts).
import { createGame, addCompany, applyAction, processTurn, DEFAULT_SETTINGS, harbourId, requiredWorkers } from '../shared/engine.js';
const run = (decorate: boolean) => {
  const s = createGame({ ...DEFAULT_SETTINGS, seed: 11, aiCompanies: 3, startCash: 50e6, targetNetWorth: 0, events: false, starter: false }); const c = addCompany(s, { name: 'T', playerId: 't' });
  const port = s.cities.find(x => x.port)!; port.harbour = [{ product: 'bread' as never, qty: 1e9, mult: 1, since: 9999 }];
  const tile = [...s.world!.tiles].findIndex((ch, i) => ch === 'u' && s.cities[0] && true); const st = s.buildings[(applyAction(s, c.id, { type: 'build', idx: tile, btype: 'store' }) as any).info];
  for (let k = 0; k < 4; k++) applyAction(s, c.id, { type: 'upgradeSize', id: st.id });
  applyAction(s, c.id, { type: 'setSlot', id: st.id, slot: 0, product: 'bread', price: 300, order: 20000, source: harbourId(port.id) });
  applyAction(s, c.id, { type: 'setStaff', id: st.id, workers: requiredWorkers(st) + 10, wage: st.wage }); if (decorate) applyAction(s, c.id, { type: 'decorate', id: st.id, amount: 5e6 });
  let sold = 0; for (let t = 1; t <= 10; t++) { processTurn(s); if (t > 3) sold += st.slots[0].sold; } return Math.round(sold);
};
const plain = run(false), deco = run(true); console.log('units sold in 7 turns: plain shop', plain, '| decorated shop', deco, '| +' + Math.round((deco / plain - 1) * 100) + '%');
