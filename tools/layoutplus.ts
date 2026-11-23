// Fine-tuning a factory layout: line output limit and quality effort; warehouses on the final line store finished goods (tools/layoutplus.ts).
import { createGame, addCompany, applyAction, processTurn, DEFAULT_SETTINGS, harbourId, requiredWorkers, whCap, baseStorage, lineCap } from '../shared/engine.js';
const run = (effort: number, rate: number, wh: boolean) => {
  const s = createGame({ ...DEFAULT_SETTINGS, seed: 11, aiCompanies: 0, startCash: 40e6, targetNetWorth: 0, events: false, starter: false }); const c = addCompany(s, { name: 'T', playerId: 't' });
  const port = s.cities.find(x => x.port)!; port.harbour = ['grain'].map(p => ({ product: p as never, qty: 1e7, mult: 1, since: 9999 }));
  const g = [...s.world!.tiles].findIndex(ch => ch === 'g'); const b = s.buildings[(applyAction(s, c.id, { type: 'build', idx: g, btype: 'factory', product: 'bread', grid: 3 }) as any).info];
  const A = (a: any) => { const x = applyAction(s, c.id, a) as any; if (x.error) console.log('ERR', JSON.stringify(a), x.error); return x; };
  A({ type: 'setCell', id: b.id, cell: 3, source: harbourId(port.id) }); A({ type: 'setCell', id: b.id, cell: 4, effort, rate });
  if (wh) { A({ type: 'setModule', id: b.id, cell: 5, module: 'warehouse' }); A({ type: 'setLink', id: b.id, a: 4, b: 5, on: true }); }
  A({ type: 'setStaff', id: b.id, workers: requiredWorkers(b) + 4, wage: b.wage }); for (const i of [3, 5]) if (b.layout![i].m) A({ type: 'setCellStaff', id: b.id, cell: i, workers: 2 });
  const cash0 = c.cash; for (let t = 1; t <= 6; t++) processTurn(s);
  const L = b.layout!;
  console.log(`effort ${effort}% rate ${rate}%${wh ? ' + warehouse' : ''}: line cap ${Math.round(lineCap(b, 4))}/mo, made last month ${Math.round(L[4].made ?? 0)} at quality ${Math.round(L[4].madeQ ?? 0)}, grain bought ${Math.round(L[3].moved ?? 0)} | stock ${Math.round(b.stock.qty)} (room ${Math.round(baseStorage(b))})` + (wh ? ` | warehouse holds ${L[5].product} ${Math.round(L[5].stock?.qty ?? 0)}/${Math.round(whCap(b, 5))}` : '') + ` | spent ${Math.round((cash0 - c.cash) / 1000)}k`);
};
run(100, 100, false); run(150, 100, false); run(50, 100, false); run(100, 50, false); run(100, 100, true);
