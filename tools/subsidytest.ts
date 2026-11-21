import { createGame, addCompany, applyAction, processTurn, DEFAULT_SETTINGS, subsidyText, lotPrice } from '../shared/engine.js';
import { nearestCity } from '../shared/world.js';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 13, aiCompanies: 0, startCash: 3_000_000, targetNetWorth: 0 });
const me = addCompany(s, { name: 'Me', playerId: 'm' });
console.log(s.subsidies!.map(x => s.cities[x.city].name + ': ' + subsidyText(x)));
for (let i = 0; i < 6; i++) processTurn(s);
console.log('after 6 turns', s.subsidies!.length, s.news.filter(n => n.tag === 'subsidy').map(n => n.text).slice(0, 3));
const urb = [...s.world!.tiles].map((ch, i) => ch === 'u' || ch === 's' ? i : -1).filter(i => i >= 0);
for (const x of [...s.subsidies!]) {
  const idx = urb.find(i => nearestCity(s.cities, i) === x.city && !s.vacant!.some(v => v.idx === i) && !Object.values(s.buildings).some(b => b.idx === i)); if (idx === undefined) continue;
  const c0 = me.cash; const r = applyAction(s, me.id, { type: 'build', idx, btype: x.kind, product: x.product } as any) as any;
  console.log(x.reward, x.amount, 'build', r.error ?? 'ok', 'paid', c0 - me.cash, 'land', lotPrice(s, idx), 'taxBreak', me.taxBreak, 'open left', s.subsidies!.length);
  break;
}
console.log(s.news.filter(n => n.tag === 'subsidy').slice(-2).map(n => n.text));
for (let i = 0; i < 3; i++) processTurn(s); console.log('tax', me.ledger.tax, 'break', me.taxBreak);
