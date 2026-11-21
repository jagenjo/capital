import { createGame, addCompany, applyAction, processTurn, DEFAULT_SETTINGS, mallInfos } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 13, aiCompanies: 0, startCash: 6_000_000, targetNetWorth: 0 });
const me = addCompany(s, { name: 'Landlord', playerId: 'm' }), you = addCompany(s, { name: 'Tenant', playerId: 'y' });
const A = (c: any, a: any) => { const x = applyAction(s, c.id, a) as any; console.log(c.name, a.type, x.error ? 'ERR ' + x.error : 'ok'); return x; };
const taken = new Set(s.vacant!.map(v => v.idx));
const urb = [...s.world!.tiles].map((ch, i) => ch === 'u' && !taken.has(i) && !s.cities[s.cities.findIndex(() => true)].town ? i : -1).filter(i => i >= 0);
const mall = A(me, { type: 'build', idx: urb[5], btype: 'mall' }); const m = s.buildings[mall.info];
console.log('news', s.news.filter(n => n.tag === 'announce').map(n => n.text), 'building', m.building);
you.brand.bread = 20;
const grass = [...s.world!.tiles].map((ch, i) => ch === 'g' ? i : -1).filter(i => i >= 0);
const fac = A(you, { type: 'build', idx: grass[30], btype: 'factory', product: 'bread' }); const F = s.buildings[fac.info];
const unit = A(you, { type: 'rentUnit', id: mall.info, product: 'bread' }); const u = s.buildings[unit.info];
console.log('factory building', F.building, 'unit workers', u.workers, 'mall workers', m.workers);
for (let i = 0; i < 9; i++) { processTurn(s); console.log('turn', s.turn, 'mall left', m.building ?? 0, 'fac left', F.building ?? 0, 'fac workers', F.workers, 'unit workers', u.workers, 'rent paid', Math.round(you.ledger.maint), 'maint of fac', F.report.maint); }
console.log(JSON.stringify(mallInfos(s)[0].opensIn), s.news.filter(n => n.tag === 'opening').map(n => n.text));
