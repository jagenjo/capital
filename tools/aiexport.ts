// AI factories sell only through export cells (tools/aiexport.ts).
import { createGame, addCompany, processTurn, DEFAULT_SETTINGS, listings, cellWarnings, exportCap } from '../shared/engine.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: +(process.argv[2] ?? 11), aiCompanies: 4, startCash: 1e6, targetNetWorth: 0, events: true }); addCompany(s, { name: 'T', playerId: 't' });
for (let t = 1; t <= 24; t++) processTurn(s);
const fs = Object.values(s.buildings).filter(b => b.type === 'factory' && s.companies.find(c => c.id === b.owner)?.isAI);
let withExport = 0, priced = 0, selling = 0, warned = 0, sold = 0;
for (const b of fs) { const ex = (b.layout ?? []).filter(c => c.m === 'export' && c.product === b.product); if (ex.length) withExport++; if (ex.some(c => c.listPrice != null)) priced++; sold += b.report.sold; if (Object.keys(cellWarnings(b)).length) warned++; }
const ls = listings(s).filter(l => l.building.includes('#')); selling = ls.length;
console.log(`AI factories ${fs.length}: with an export cell ${withExport}, with a selling price ${priced}, listings from export cells now ${selling}, factories with cell warnings ${warned}, units sold last month ${Math.round(sold)}`);
console.log('direct factory listings (should be 0):', listings(s).filter(l => !l.building.includes('#') && s.buildings[l.building].type === 'factory').length);
for (const b of fs.slice(0, 3)) { const w = cellWarnings(b); console.log(' ', b.name, b.product, 'export stock', Math.round((b.layout ?? []).find(c => c.m === 'export')?.stock?.qty ?? 0), 'warnings', JSON.stringify(w)); }
