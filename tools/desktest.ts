// Desk: sealed orders, decision cards, supply contracts, forecast; downtown vs suburb demand.
import { createGame, addCompany, DEFAULT_SETTINGS, applyAction, processTurn, cityPopSplit, areaPopSplit } from '../shared/engine.js';
import { submitAction, forecast } from '../shared/desk.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 4, aiCompanies: 2 }); const w = s.world!;
const A = addCompany(s, { name: 'A', playerId: 'a' }), B = addCompany(s, { name: 'B', playerId: 'b' }); A.cash = B.cash = 2e7; s.settings.targetNetWorth = 0;
const g = [...w.tiles].findIndex((t, i) => t === 'g' && i > w.w * 50 && !s.lots[String(i)]);
// 1. sealed orders: both want the same lot
console.log('A order', JSON.stringify(submitAction(s, A.id, { type: 'build', idx: g, btype: 'factory', product: 'bread', bid: 1000 } as any)));
console.log('B order', JSON.stringify(submitAction(s, B.id, { type: 'build', idx: g, btype: 'factory', product: 'meat', bid: 5000 } as any)));
console.log('bad order', JSON.stringify(submitAction(s, A.id, { type: 'build', idx: 0, btype: 'factory', product: 'bread' } as any)));
console.log('built before turn?', Object.values(s.buildings).some(b => b.idx === g), 'orders', s.orders!.length);
console.log('no advisor', JSON.stringify(forecast(s, B.id)));
const advisor = (skill: number, spec = 'market') => ({ id: 'adv' + skill + spec, name: 'Ann Lyst', portrait: 1, age: 40, kind: 'advisor' as const, spec, eff: 0, prod: 0, exp: 0, skill, salary: 1000 });
B.staff = [advisor(5)];
let t0 = Date.now(); const f = forecast(s, B.id) as any; console.log('forecast ms', Date.now() - t0, 'cash', f.cash0, '->', f.cash, 'events', JSON.stringify(f.events.slice(0, 3)), 'warnings', f.warnings.length);
console.log('state untouched by forecast', Object.values(s.buildings).some(b => b.idx === g), s.turn);
processTurn(s);
const won = Object.values(s.buildings).find(b => b.idx === g); console.log('winner', won && s.companies.find(c => c.id === won.owner)!.name, won?.product, '| A news:', A.news.at(-1)?.text, '| B news:', B.news.filter(n => /Order/.test(n.text)).at(-1)?.text);
// 2. cards
console.log('cards A', JSON.stringify((A.agenda ?? []).map(k => k.kind)), 'B', JSON.stringify((B.agenda ?? []).map(k => k.kind + ':' + k.title)));
const k = B.agenda?.[0]; if (k) console.log('answer', JSON.stringify(applyAction(s, B.id, { type: 'answerCard', id: k.id, option: k.options[0].id } as any)), k.options[0].label);
// 3. contracts: B sells meat to A's store
won!.building = 0; won!.stock.qty = 500; won!.stock.q = 60;
const u = [...w.tiles].findIndex((t, i) => t === 's' && !s.lots[String(i)] && !Object.values(s.buildings).some(b => b.idx === i));
const st: any = applyAction(s, A.id, { type: 'build', idx: u, btype: 'store' } as any); if (!st.ok) console.log('store build', JSON.stringify(st), u, w.tiles[u]); const store = s.buildings[st.info]; store.building = 0; store.workers = 10;
applyAction(s, A.id, { type: 'setSlot', id: store.id, slot: 0, product: 'meat', price: 12, order: 100, source: '' } as any);
const pr: any = applyAction(s, B.id, { type: 'proposeContract', to: A.id, role: 'sell', product: 'meat', qty: 80, price: 3, months: 3, penalty: 2, building: won!.id } as any); console.log('propose', JSON.stringify(pr));
console.log('accept', JSON.stringify(applyAction(s, A.id, { type: 'answerContract', id: pr.info, accept: true, building: store.id } as any)));
console.log('set source', JSON.stringify(applyAction(s, A.id, { type: 'setSlot', id: store.id, slot: 0, product: 'meat', price: 12, order: 100, source: 'contract:' + pr.info } as any)));
const ac0 = A.cash, bc0 = B.cash; processTurn(s);
const kk = s.contracts!.find(x => x.id === pr.info); console.log('delivered', kk?.lastDelivered, 'months left', kk?.months, 'store stock', store.slots[0].stock.qty.toFixed(0), 'sold', store.slots[0].sold, 'B news', B.news.filter(n => n.turn === s.turn - 1).map(n => n.text).join(' | ').slice(0, 300));
// npc contract via a card
s.contracts!.push({ id: 'nx', status: 'active', proposer: 'npc', to: B.id, seller: B.id, buyer: 'npc', product: 'meat', qty: 50, price: 4, months: 2, penalty: 1, from: won!.id, city: 0, delivered: 0, turn: s.turn });
won!.stock.qty = 20; const b1 = B.cash; processTurn(s); console.log('npc contract: delivered', s.contracts!.find(x => x.id === 'nx')?.lastDelivered, 'B news', B.news.filter(n => /shortfall/.test(n.text)).at(-1)?.text);
// 4. downtown vs suburb
const c0 = s.cities.reduce((a, c) => (c.pop > a.pop ? c : a)); console.log('biggest city downtown share', cityPopSplit(s, c0.id).toFixed(2), 'town share', cityPopSplit(s, s.cities.find(c => c.town)!.id).toFixed(2));
const hi = [...w.tiles].findIndex(t => t === 'h'); console.log('area split next to town hall', areaPopSplit(s, { idx: hi }).toFixed(2), 'suburb store', areaPopSplit(s, store).toFixed(2));
for (let i = 0; i < 4; i++) { processTurn(s); console.log('turn', s.turn, 'A cards', JSON.stringify((A.agenda ?? []).map(k => k.kind + ' [' + k.options.map(o => o.label).join(' / ') + ']')), 'B', JSON.stringify((B.agenda ?? []).map(k => k.kind))); }
// contract history: the 3-month player contract has run out by now, and a broken one stays on file too
const fin = s.contracts!.find(x => x.id === pr.info); console.log('finished contract status', fin?.status, 'term', fin?.term, 'ended', fin?.ended);
const pr2: any = applyAction(s, B.id, { type: 'proposeContract', to: A.id, role: 'sell', product: 'meat', qty: 10, price: 3, months: 6, penalty: 0, building: won!.id } as any);
applyAction(s, A.id, { type: 'answerContract', id: pr2.info, accept: true, building: store.id } as any);
console.log('break', JSON.stringify(applyAction(s, A.id, { type: 'cancelContract', id: pr2.info } as any)), 'status', s.contracts!.find(x => x.id === pr2.info)?.status, 'break again', JSON.stringify(applyAction(s, A.id, { type: 'cancelContract', id: pr2.info } as any)));
// forecast accuracy by advisor: compare against what really happens next turn
{ const s2 = createGame({ ...DEFAULT_SETTINGS, seed: 7, aiCompanies: 4, targetNetWorth: 0 } as any); const AI = s2.companies.find(c => c.isAI)!; for (let i = 0; i < 6; i++) processTurn(s2);
  const fc = (skill: number, spec: string) => { AI.staff = [...(AI.staff ?? []).filter(x => x.kind !== 'advisor'), advisor(skill, spec)]; return forecast(s2, AI.id) as any; };
  const lo = fc(1, 'market'), mid = fc(6, 'market'), hi = fc(10, 'finance'), again = fc(10, 'finance');
  console.log('revenue forecast — skill 1:', lo.ledger.revenue, '| skill 6:', mid.ledger.revenue, '| finance 10:', hi.ledger.revenue, '(again:', again.ledger.revenue + ')', '| errors', lo.advisor.error, mid.advisor.error, hi.advisor.error, '| warnings seen', lo.warnings.length, mid.warnings.length, hi.warnings.length);
  const before = AI.ledger.revenue; processTurn(s2); console.log('actual revenue next turn', Math.round(AI.ledger.revenue), '(last turn', Math.round(before) + ')'); }
