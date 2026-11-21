import { createGame, addCompany, applyAction, DEFAULT_SETTINGS } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 13, aiCompanies: 1 });
const a = addCompany(s, { name: 'A', playerId: 'a' }), b = addCompany(s, { name: 'B', playerId: 'b' });
const r = (c: any, x: any) => console.log(c.name, x.type, JSON.stringify(applyAction(s, c.id, x)));
r(a, { type: 'sendMessage', to: b.id, text: 'Hello B, want to trade?' }); r(a, { type: 'sendMessage', to: a.id, text: 'x' }); r(a, { type: 'sendMessage', to: b.id, text: '  ' });
r(b, { type: 'readMessages', from: a.id }); console.log(s.messages);
