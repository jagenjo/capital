// Shares: selling your own company, controlling stake (>50%) merges the target into the holder.
import { createGame, addCompany, DEFAULT_SETTINGS, applyAction, treasury, netWorth } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 5, aiCompanies: 0 });
const A = addCompany(s, { name: 'A', playerId: 'a' }), B = addCompany(s, { name: 'B', playerId: 'b' }), C = addCompany(s, { name: 'C', playerId: 'c' }); A.cash = B.cash = C.cash = 1e9;
const g = [...s.world!.tiles].findIndex(t => t === 'g');
console.log('B builds', JSON.stringify(applyAction(s, B.id, { type: 'build', idx: g, btype: 'factory', product: 'bread' } as any)));
console.log('B sells 60%', JSON.stringify(applyAction(s, B.id, { type: 'issueShares', qty: 600000 } as any)), 'treasury', treasury(s, B));
console.log('C buys 100k', JSON.stringify(applyAction(s, C.id, { type: 'buyShares', company: B.id, qty: 100000 } as any)));
console.log('A buys 450k', JSON.stringify(applyAction(s, A.id, { type: 'buyShares', company: B.id, qty: 450000 } as any)), 'B bankrupt', B.bankrupt);
console.log('B sells 100k more', JSON.stringify(applyAction(s, B.id, { type: 'issueShares', qty: 100000 } as any)));
console.log('A buys 60k more -> >50%', JSON.stringify(applyAction(s, A.id, { type: 'buyShares', company: B.id, qty: 60000 } as any)));
console.log('B bankrupt', B.bankrupt, 'mergedInto', B.mergedInto === A.id, 'A buildings', Object.values(s.buildings).filter(b => b.owner === A.id).length, 'C portfolio', JSON.stringify(C.portfolio), 'C cash gain>0', C.cash > 1e9 - 1e6 * 0, 'A net worth', netWorth(s, A));
console.log('A news', A.news.at(-1)?.text); console.log('B news', B.news.at(-1)?.text);
// AI target: buy beyond the 30% float at a premium
const t = createGame({ ...DEFAULT_SETTINGS, seed: 5, aiCompanies: 2 }); const P = addCompany(t, { name: 'P', playerId: 'p' }); P.cash = 1e10; const ai = t.companies.find(c => c.isAI)!;
console.log('AI float', ai.float, 'treasury', treasury(t, ai)); console.log('buy 600k of AI', JSON.stringify(applyAction(t, P.id, { type: 'buyShares', company: ai.id, qty: 600000 } as any)), 'AI merged', ai.mergedInto === P.id, 'cash', Math.round(P.cash));
