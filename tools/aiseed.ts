import { createGame, processTurn, netWorth, DEFAULT_SETTINGS } from '../shared/engine.js';
for (const seed of [7, 8]) {
  const s = createGame({ ...DEFAULT_SETTINGS, seed });
  for (const c of s.companies) { const bs = Object.values(s.buildings).filter(b => b.owner === c.id); console.log(seed, c.name, 'cash', Math.round(c.cash / 1000) + 'k', bs.map(b => b.type + ':' + (b.product ?? b.slots.filter(x => x.product).map(x => x.product).join('+'))).join(' ')); }
  for (let t = 0; t < 24; t++) processTurn(s);
  for (const c of s.companies) console.log('  after 24', c.name, c.bankrupt ? 'BANKRUPT' : 'cash ' + Math.round(c.cash / 1000) + 'k', 'worth', Math.round(netWorth(s, c) / 1000) + 'k', 'buildings', Object.values(s.buildings).filter(b => b.owner === c.id).length);
}
{ const s = createGame({ ...DEFAULT_SETTINGS, seed: 7 }); const c = s.companies[1];
  for (let t = 0; t < 12; t++) { processTurn(s); const L = c.ledger; console.log(t, 'cash', Math.round(c.cash / 1000), 'rev', Math.round(L.revenue / 1000), 'purch', Math.round(L.purchases / 1000), 'tr', Math.round(L.transport / 1000), 'wages', Math.round(L.wages / 1000), 'maint', Math.round(L.maint / 1000), 'int', Math.round(L.interest / 1000), 'tax', Math.round(L.tax / 1000)); }
  for (const b of Object.values(s.buildings).filter(b => b.owner === c.id)) console.log(b.name, 'workers', b.workers, '/', 'rev', Math.round(b.report.revenue / 1000), 'wages', Math.round(b.report.wages / 1000), 'maint', Math.round(b.report.maint / 1000), 'purch', Math.round(b.report.purchases / 1000), 'prod', Math.round(b.report.produced)); }
{ const s = createGame({ ...DEFAULT_SETTINGS, seed: 7 }); const c = s.companies[1]; processTurn(s); processTurn(s);
  for (const b of Object.values(s.buildings).filter(b => b.owner === c.id && b.type === 'factory')) console.log(b.name, b.product, 'layout', JSON.stringify(b.layout?.map(x => x.m + ':' + (x.product ?? '') + ':' + (x.source ?? ''))), 'sources', JSON.stringify(b.sources), 'inputs', JSON.stringify(b.inputs), 'workers', b.workers, 'stock', b.stock.qty); }
{ const s = createGame({ ...DEFAULT_SETTINGS, seed: 7 }); const c = s.companies[2];
  for (let t = 0; t < 24; t++) { const c0 = c.cash; processTurn(s); const L = c.ledger; console.log('U', t, 'cash', Math.round(c.cash / 1000), 'delta', Math.round((c.cash - c0) / 1000), 'rev', Math.round(L.revenue / 1000), 'wages', Math.round(L.wages / 1000), 'int', Math.round(L.interest / 1000), 'debt', Math.round(c.debt / 1000), 'b', Object.values(s.buildings).filter(b => b.owner === c.id).length); } }
{ const s = createGame({ ...DEFAULT_SETTINGS, seed: 7 }); const c = s.companies[2]; for (let t = 0; t < 12; t++) processTurn(s);
  for (const b of Object.values(s.buildings).filter(b => b.owner === c.id)) console.log('V', b.name, b.product, 'workers', b.workers, 'need', b.workers, 'stock', Math.round(b.stock.qty), 'list', b.listPrice, 'cond', Math.round(b.condition), 'slots', JSON.stringify(b.slots.filter(x => x.product).map(x => [x.product, x.source, Math.round(x.stock.qty), x.price])), 'lay', JSON.stringify(b.layout?.filter(x => x.m === 'import').map(x => [x.product, x.source]))); }
