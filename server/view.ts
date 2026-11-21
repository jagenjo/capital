import { PRODUCT_LIST } from '../shared/data.js';
import { heldTotal, OFFER_WINDOW, mallInfos, advice, netWorth, maxDebt, overdraftLimit, listings, importPrice, retailRef, cityWage, laborPool, laborUsed, dateOf, rankings } from '../shared/engine.js';
import type { GameState, View } from '../shared/types.js';

export interface PlayerRec { id: string; name: string; salt: string; hash: string; token: string; companyId: string; lastSeen: number }
export interface GameRec {
  id: string; state: GameState; players: PlayerRec[];
  gameSalt: string; gameHash: string | null; // join password
  nextTurnAt: number; paused: boolean; createdAt: number;
}

export function buildView(g: GameRec, companyId: string): View {
  const s = g.state; const me = s.companies.find(c => c.id === companyId)!;
  const market: View['market'] = {};
  for (const p of PRODUCT_LIST) market[p.id] = { idx: s.market[p.id].idx, demand: s.market[p.id].demand, importPrice: importPrice(s, p.id), retail: retailRef(s, 0, p.id) / s.cities[0].priceIdx, worldSold: s.worldSold?.[p.id] ?? 0, prev: s.market[p.id].prev ?? s.market[p.id].idx };
  const now = Date.now();
  return {
    gameId: g.id, gameName: s.settings.name, status: s.finished ? 'finished' : g.paused ? 'paused' : 'running',
    turn: s.turn, date: dateOf(s), settings: s.settings, nextTurnAt: s.finished || g.paused ? null : g.nextTurnAt, serverNow: now, paused: g.paused,
    cities: s.cities, worldId: g.id, dist: s.dist ?? [],
    me: { ...me, staff: me.staff?.map(({ bids, ...p }) => ({ ...p, myBid: bids?.find(b => b.company === companyId)?.salary })), netWorth: netWorth(s, me), maxDebt: maxDebt(s, me), overdraftLimit: overdraftLimit(s, me) },
    buildings: Object.values(s.buildings).filter(b => b.owner === companyId),
    others: Object.values(s.buildings).filter(b => b.owner !== companyId && !b.mall).map(b => ({ building: b.building, id: b.id, owner: b.owner, type: b.type, city: b.city, idx: b.idx, name: b.name, product: b.product })),
    companies: s.companies.map(c => ({
      id: c.id, name: c.name, color: c.color, portrait: c.portrait, isAI: c.isAI, netWorth: netWorth(s, c),
      price: c.price ?? 1, prevPrice: c.priceHist && c.priceHist.length > 1 ? c.priceHist[c.priceHist.length - 2] : c.price ?? 1, priceHist: (c.priceHist ?? []).slice(-60), shares: c.shares ?? 1_000_000, float: c.float ?? 0, held: heldTotal(s, c), lastDps: c.lastDps ?? 0,
      holders: s.companies.filter(o => (o.portfolio?.[c.id] ?? 0) > 0).map(o => ({ id: o.id, qty: o.portfolio![c.id] })),
      buildings: Object.values(s.buildings).filter(b => b.owner === c.id).length, ready: c.ready, bankrupt: c.bankrupt,
      online: !c.isAI && g.players.some(p => p.companyId === c.id && now - p.lastSeen < 120_000),
    })),
    lots: s.lots, market, listings: listings(s),
    cityWages: s.cities.map(c => cityWage(s, c.id)),
    cityLabor: s.cities.map(c => ({ used: laborUsed(s, c.id), pool: laborPool(c) })),
    news: s.news.slice(-100).reverse(), finished: s.finished, winner: s.winner, endReason: s.endReason,
    competitors: s.companies.filter(c => c.id !== companyId && !c.bankrupt).flatMap(c => (c.staff ?? []).map(({ bids, assigned, ...p }) => ({ ...p, myBid: bids?.find(b => b.company === companyId)?.salary, company: c.id, monthsLeft: Math.max(0, (p.contractEnd ?? 0) - s.turn), offerable: (p.contractEnd ?? 0) - s.turn <= OFFER_WINDOW }))),
    adContracts: (s.adContracts ?? []).filter(x => x.owner === companyId), mediaUsed: (s.adContracts ?? []).reduce((m, x) => (m[x.media] = (m[x.media] ?? 0) + 1, m), {} as Record<string, number>), messages: (s.messages ?? []).filter(m => m.from === companyId || m.to === companyId).slice(-300), subsidies: s.subsidies ?? [], malls: mallInfos(s), vacant: s.vacant ?? [], candidates: (s.candidates ?? []).map(({ bids, ...p }) => ({ ...p, myBid: bids?.find(b => b.company === companyId)?.salary, bidders: bids?.length ?? 0 })), advice: advice(s, me),
    rankings: rankings(s),
  };
}
