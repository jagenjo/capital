import { createGame, DEFAULT_SETTINGS, processTurn } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 5, aiCompanies: 3, events: false });
for (let i = 0; i < 6; i++) processTurn(s);
for (const n of s.news.filter(n => n.tag).slice(0, 8)) console.log(n.turn, n.tag, n.text);
console.log('opening', s.news.filter(n => n.tag === 'opening').length, 'product', s.news.filter(n => n.tag === 'product').length);
