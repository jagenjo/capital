// City growth reacts to players: a company that floods the metropolis with stocked shops should make it grow faster (tools/growthplayer.ts).
import { PRODUCTS } from '../shared/data.js';
import { createGame, addCompany, processTurn, applyAction, DEFAULT_SETTINGS, harbourId, requiredWorkers, urbanTiles, tileServed, GROW_BASIC } from '../shared/engine.js';
const run = (shops: boolean) => {
  const s = createGame({ ...DEFAULT_SETTINGS, seed: 11, aiCompanies: 3, startCash: 60_000_000, targetNetWorth: 0, events: false });
  const c = addCompany(s, { name: 'T', playerId: 't' }); let w = s.world!;
  const big = s.cities.reduce((a, b) => b.pop > a.pop ? b : a); const port = s.cities.find(x => x.port)!;
  port.harbour = ['bread', 'clothing', 'furniture', 'fuel'].map(p => ({ product: p as any, qty: 1e7, mult: 1, since: 9999 }));
  if (shops) { // shops every 6 tiles across the big city's suburbs, each stocking 4 basic goods from the harbour
    const T = urbanTiles(s as any)[big.id].filter(t => w.tiles[t.idx] === 's' || w.tiles[t.idx] === 'u');
    let n = 0; for (const t of T) { const x = t.idx % w.w, y = (t.idx / w.w) | 0; if (x % 4 || y % 4) continue;
      const r = applyAction(s, c.id, { type: 'build', idx: t.idx, btype: 'store' }) as any; if (!r.info) { if (n === 0) console.log('build failed', JSON.stringify(r)); continue; } const b = s.buildings[r.info]; n++;
      ['bread', 'clothing', 'furniture', 'fuel'].forEach((p, i) => { const rr = applyAction(s, c.id, { type: 'setSlot', id: b.id, slot: i, product: p as any, price: PRODUCTS[p as 'bread'].basePrice * 1.3, order: 2000, source: harbourId(port.id) } as any) as any; if (n === 1 && i === 0) console.log('setSlot', JSON.stringify(rr).slice(0, 120)); });
      applyAction(s, c.id, { type: 'setStaff', id: b.id, workers: requiredWorkers(b), wage: b.wage }); }
    console.log('shops built', n);
  }
  const count = () => { w = s.world!; const o: Record<string, number> = {}; for (const i of urbanTiles(s as any)[big.id]) o[w.tiles[i.idx]] = (o[w.tiles[i.idx]] ?? 0) + 1; return JSON.stringify(o); };
  const start = count();
  const t0 = Date.now(); for (let t = 0; t < 36; t++) processTurn(s); console.log('ms/turn', Math.round((Date.now() - t0) / 36));
  const sample = urbanTiles(s as any)[big.id].map(t => tileServed(s, t.idx).slice(0, GROW_BASIC.length)).flat(); const fill = sample.reduce((a, x) => a + (x.need ? Math.min(1, x.got / x.need) : 0), 0) / sample.length;
  if (shops) for (const b of Object.values(s.buildings).filter(b => b.owner === c.id).slice(0, 2)) console.log('  shop', b.idx, b.building ?? 0, b.report.note, b.workers, c.cash, b.slots.filter(x => x.product).map(x => x.product + ' sold ' + x.sold + ' stock ' + Math.round(x.stock.qty) + ' lost ' + x.lost).join(' | '));
  console.log(shops ? 'with shops   ' : 'AI only      ', big.name, 'start', start, '→ after 36 turns', JSON.stringify(JSON.parse(count())), 'avg basic fill', fill.toFixed(2), 'local sales', Math.round(Object.values(s.sales!.local).reduce((a, x) => a + Object.entries(x).filter(([k]) => k !== 'npc').reduce((b, [, v]) => b + v, 0), 0)));
};
run(false); run(true);
