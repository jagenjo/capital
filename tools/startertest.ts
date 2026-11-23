// A new player company starts with a working business that earns money (tools/startertest.ts).
import { createGame, addCompany, processTurn, seedStarter, DEFAULT_SETTINGS } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: +(process.argv[2] ?? 11), aiCompanies: 3, startCash: 1_000_000, targetNetWorth: 0, events: false });
const c = addCompany(s, { name: 'Player', playerId: 'p' }); console.log('seeded', seedStarter(s, c), 'cash', c.cash, 'buildings', Object.values(s.buildings).filter(b => b.owner === c.id).map(b => b.type + (b.product ? ':' + b.product : '')).join(' '));
const idle = addCompany(s, { name: 'Idle', playerId: 'q' });
for (let t = 1; t <= 12; t++) { processTurn(s); if (t === 1 || t === 3 || t === 6 || t === 12) console.log('turn', t, 'cash', Math.round(c.cash), 'profit', Math.round(c.ledger.profit), 'revenue', Math.round(c.ledger.revenue), '| idle company cash', Math.round(idle.cash)); }
for (const b of Object.values(s.buildings).filter(b => b.owner === c.id)) console.log(b.type, 'workers', b.workers, '/', 'stock', Math.round(b.stock.qty), 'produced', b.report.produced, 'sold', b.report.sold, 'rev', Math.round(b.report.revenue), 'note', b.report.note.slice(0, 120), b.type === 'store' ? JSON.stringify(b.slots.filter(x => x.product).map(x => [x.sold, x.lost, Math.round(x.stock.qty), x.order, x.source])) : '');
