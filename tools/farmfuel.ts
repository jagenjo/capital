// Farms burn fuel: from the local market by default, or a chosen source; without fuel they work by hand at 40% (tools/farmfuel.ts).
import { createGame, addCompany, applyAction, processTurn, DEFAULT_SETTINGS, requiredWorkers } from '../shared/engine.js';
const run = (src?: string) => {
  const s = createGame({ ...DEFAULT_SETTINGS, seed: 11, aiCompanies: 0, startCash: 5e6, targetNetWorth: 0, events: false, starter: false }); const c = addCompany(s, { name: 'T', playerId: 't' });
  const f = [...s.world!.tiles].findIndex(ch => ch === 'f'); const b = s.buildings[(applyAction(s, c.id, { type: 'build', idx: f, btype: 'farm', product: 'grain' }) as any).info];
  if (src !== undefined) console.log('  set source', JSON.stringify(applyAction(s, c.id, { type: 'setSource', id: b.id, product: 'fuel', source: src })));
  for (let t = 0; t < 7; t++) processTurn(s);
  console.log((src === undefined ? 'default (market)' : 'source "' + src + '"') + ': produced', b.report.produced, '| fuel in stock', Math.round(b.inputs.fuel?.qty ?? 0), '| purchases', Math.round(b.report.purchases), '| note', b.report.note);
};
run(); run('');
