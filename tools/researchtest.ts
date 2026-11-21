import { createGame, addCompany, applyAction, processTurn, DEFAULT_SETTINGS, isUnlocked, researchOf } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 11, aiCompanies: 0, startCash: 30_000_000, targetNetWorth: 0, events: false });
const c = addCompany(s, { name: 'T', playerId: 't' });
const tiles = [...s.world!.tiles].map((ch, i) => ch === 'g' ? i : -1).filter(i => i >= 0);
const A = (a: any) => { const x = applyAction(s, c.id, a) as any; console.log(a.type, a.product ?? '', x.error ? 'ERR ' + x.error : 'ok'); return x; };
A({ type: 'build', idx: tiles[10], btype: 'factory', product: 'phones' });
const rd = s.buildings[A({ type: 'build', idx: tiles[20], btype: 'rd', product: 'robotics' }).info];
A({ type: 'setStaff', id: rd.id, workers: 40, wage: rd.wage });
for (let i = 0; i < 12 && !isUnlocked(c, 'robotics'); i++) { processTurn(s); console.log(i, rd.report.note); }
console.log('robotics unlocked', isUnlocked(c, 'robotics'), 'news', s.news.filter(n => n.text.includes('developed')).length);
A({ type: 'build', idx: tiles[30], btype: 'factory', product: 'robotics' });
console.log('phones progress', researchOf(c, 'phones'));
