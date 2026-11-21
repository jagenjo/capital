import { createGame, addCompany, applyAction, processTurn, DEFAULT_SETTINGS } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 5, aiCompanies: 0, startCash: 2_000_000, targetNetWorth: 0 });
const a = addCompany(s, { name: 'A', playerId: 'a' }), b = addCompany(s, { name: 'B', playerId: 'b' });
const T = (c: any, x: any) => { const r = applyAction(s, c.id, x) as any; console.log(c.name, x.type, x.media ?? '', r.error ? 'ERR ' + r.error : r.info ?? 'ok'); return r; };
T(a, { type: 'adContract', media: 'tv5', product: 'bread', months: 6 }); T(a, { type: 'adContract', media: 'tv5', product: 'bread', months: 6 });
T(a, { type: 'adContract', media: 'tv5', product: 'cars', months: 3 }); T(b, { type: 'adContract', media: 'tv5', product: 'cars', months: 3 });
T(a, { type: 'adContract', media: 'ledger', product: 'steel', months: 3 }); T(a, { type: 'adContract', media: 'ledger', product: 'bread', months: 5 });
for (let i = 0; i < 4; i++) { processTurn(s); console.log('t', s.turn, 'brand bread', a.brand.bread.toFixed(1), 'ads', a.ledger.ads, 'contracts', s.adContracts!.length); }
const id = s.adContracts!.find(x => x.owner === 'c' + 0 || true)!.id; T(a, { type: 'cancelAd', id });
for (let i = 0; i < 4; i++) processTurn(s); console.log('left', s.adContracts!.length, a.news.slice(-2).map(n => n.text));
