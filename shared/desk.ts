// The "desk": sealed orders for contested actions, monthly decision cards, supply contracts and the end-turn forecast.
import { PRODUCTS, BUILDINGS, type ProductId } from './data.js';
import type { GameState, Company, Building, Action, Order, Card, Contract, Ledger } from './types.js';
import { applyAction, rnd, cityWage, capacity, factoryPollution, POLLUTION_R, netWorth, processTurn, haulCost, cityTile, overdraftLimit, fmtMoney, treasury, addStock, idle, salePool, poolQty, takePool } from './engine.js';
import { nearestCity, WORLD_SCALE } from './world.js';

type Res = { ok: true; info?: string } | { error: string };
const err = (e: string): Res => ({ error: e });
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const marketPrice = (s: GameState, p: ProductId) => PRODUCTS[p].basePrice * (s.market[p]?.idx ?? 1);
const company = (s: GameState, id: string) => s.companies.find(c => c.id === id);
const say = (c: Company | undefined, s: GameState, text: string) => { c?.news.push({ turn: s.turn, text }); };

// ================================================================ 1. sealed orders
/** Actions several companies may want at once. Players' orders wait until the month is played; AI companies act during the turn. */
export const SEALED: Action['type'][] = ['build', 'buyVacant', 'buyExpansion', 'buyShares'];
function orderKey(a: Action): string {
  switch (a.type) {
    case 'build': case 'buyExpansion': return 'tile:' + a.idx;
    case 'buyVacant': return 'vac:' + a.id;
    case 'buyShares': return 'shares:' + a.company;
    default: return a.type;
  }
}
function orderLabel(s: GameState, a: Action): string {
  switch (a.type) {
    case 'build': return `Build ${BUILDINGS[a.btype]?.name ?? a.btype}${a.product ? ' (' + PRODUCTS[a.product]?.name + ')' : ''} near ${s.cities[nearestCity(s.cities, a.idx)]?.name}`;
    case 'buyExpansion': return `Expand ${s.buildings[a.id]?.name ?? 'facility'} onto a neighbouring tile`;
    case 'buyVacant': { const v = s.vacant?.find(x => x.id === a.id); return `Buy the ${v ? BUILDINGS[v.type].name.toLowerCase() : 'facility'} for sale${v ? ' in ' + s.cities[v.city].name : ''}`; }
    case 'buyShares': return `Buy ${Math.floor(a.qty).toLocaleString('en-US')} shares of ${company(s, a.company)?.name ?? '?'}`;
    default: return a.type;
  }
}
/** Copy of the state for dry runs (the world never changes during a turn, so it is shared, not copied). */
export function cloneState(s: GameState): GameState {
  const w = s.world; s.world = undefined;
  try { const t = structuredClone(s); t.world = w; return t; } finally { s.world = w; }
}
/** What players' requests go through: contested actions become sealed orders (checked now, carried out when the month is played). */
export function submitAction(s: GameState, cid: string, a: Action): Res {
  const c = company(s, cid); if (!c || c.bankrupt) return err('No such company');
  if (c.isAI || !SEALED.includes(a.type)) return applyAction(s, cid, a);
  const bid = Math.round(clamp(Number((a as { bid?: number }).bid) || 0, 0, 1e10));
  const t = cloneState(s); const tc = company(t, cid)!; const cash0 = tc.cash;
  const r = applyAction(t, cid, { ...a, bid: undefined } as Action); if ('error' in r) return r;
  const cost = Math.round(cash0 - tc.cash) + bid;
  if (c.cash - cost < -overdraftLimit(s, c)) return err(`Not enough cash for this order and its bid (need ${fmtMoney(cost)})`);
  const key = orderKey(a); s.orders ??= [];
  s.orders = s.orders.filter(o => !(o.company === cid && o.key === key && a.type !== 'buyShares'));
  const o: Order & { cost?: number } = { id: 'o' + s.nextId++, company: cid, turn: s.turn, key, bid, action: { ...a, bid: undefined } as Action, label: orderLabel(s, a), cost };
  s.orders.push(o);
  return { ok: true, info: 'order:' + o.id };
}
/** Carry out the month's sealed orders: in each contested group the highest bid goes first (ties: random). */
export function resolveOrders(s: GameState) {
  const all = s.orders ?? []; s.orders = []; if (!all.length) return;
  const groups = new Map<string, Order[]>(); for (const o of all) { const g = groups.get(o.key) ?? []; g.push(o); groups.set(o.key, g); }
  for (const [key, g] of groups) {
    const ord = g.map(o => ({ o, r: rnd(s) })).sort((x, y) => y.o.bid - x.o.bid || x.r - y.r).map(x => x.o);
    const shares = key.startsWith('shares:');
    let winner: Order | null = null;
    for (const o of ord) {
      const c = company(s, o.company); if (!c || c.bankrupt) continue;
      if (!shares && winner) { say(c, s, `Outbid: ${company(s, winner.company)?.name ?? 'a rival'} won "${o.label}".`); continue; }
      let a = o.action;
      if (a.type === 'buyShares') { const t = company(s, a.company); if (!t || t.bankrupt) { say(c, s, `Order failed: "${o.label}" — that company is gone.`); continue; }
        const avail = Math.floor((t.float ?? 0) + (t.isAI ? Math.max(0, treasury(s, t) - 1) : 0)); if (avail < 1) { say(c, s, `Order failed: "${o.label}" — no shares left to buy.`); continue; }
        if (a.qty > avail) a = { ...a, qty: avail }; }
      if (o.bid > 0 && c.cash - o.bid < -overdraftLimit(s, c)) { say(c, s, `Order failed: "${o.label}" — not enough cash for your bid.`); continue; }
      const r = applyAction(s, o.company, a);
      if ('error' in r) { say(c, s, `Order failed: "${o.label}" — ${r.error}.`); continue; }
      if (o.bid > 0) { c.cash -= o.bid; c.ledger.purchases += o.bid; }
      say(c, s, `Order done: ${o.label}${o.bid > 0 ? ` (bid ${fmtMoney(o.bid)})` : ''}${!shares && g.length > 1 ? ` — you beat ${g.length - 1} rival offer${g.length > 2 ? 's' : ''}` : ''}.`);
      winner = o;
    }
  }
}
export function cancelOrder(s: GameState, cid: string, id: string): Res {
  const o = s.orders?.find(x => x.id === id && x.company === cid); if (!o) return err('No such order');
  s.orders = s.orders!.filter(x => x !== o); return { ok: true };
}

// ================================================================ 2. decision cards
type Gen = (s: GameState, c: Company, mine: Building[]) => Omit<Card, 'id' | 'turn'> | null;
const pick = <T>(s: GameState, a: T[]): T | undefined => a.length ? a[Math.floor(rnd(s) * a.length)] : undefined;
const working = (s: GameState, b: Building) => !b.building && !idle(s, b);
const GENS: Gen[] = [
  // workers want a raise
  (s, c, mine) => { const b = pick(s, mine.filter(b => working(s, b) && b.workers >= 5 && b.wage < cityWage(s, b.city) * 1.05)); if (!b) return null;
    return { kind: 'wage', title: 'Workers demand a raise', text: `The ${b.workers} workers of ${b.name} want +8% wages (now $${b.wage}/month, city average $${cityWage(s, b.city)}).`,
      options: [{ id: 'accept', label: 'Accept +8%', hint: 'Happier workers, higher wage bill' }, { id: 'half', label: 'Negotiate +4%', hint: '30% chance of a one-month strike' }, { id: 'refuse', label: 'Refuse', hint: '55% chance of a one-month strike' }], def: 'refuse', ctx: { b: b.id } }; },
  // a wholesale customer wants a supply contract
  (s, c, mine) => { const b = pick(s, mine.filter(b => working(s, b) && b.product && b.type !== 'store' && b.type !== 'rd' && capacity(b) > 0)); if (!b) return null;
    const p = b.product!; const qty = Math.max(5, Math.round(capacity(b) * (0.2 + 0.25 * rnd(s)))); const price = Math.round(marketPrice(s, p) * (1.08 + 0.15 * rnd(s)) * 100) / 100;
    const months = 4 + Math.floor(rnd(s) * 9); const city = Math.floor(rnd(s) * s.cities.length); const penalty = Math.round(price * 0.6 * 100) / 100;
    return { kind: 'order', title: 'A wholesale customer calls', text: `A distributor in ${s.cities[city].name} wants ${qty} ${PRODUCTS[p].name.toLowerCase()} a month from ${b.name} for ${months} months at $${price} each (market $${marketPrice(s, p).toFixed(2)}). Each unit short costs $${penalty}. You pay the transport.`,
      options: [{ id: 'accept', label: 'Sign the contract', hint: 'Steady sales above market price, but you must deliver' }, { id: 'decline', label: 'Decline', hint: 'Nothing happens' }], def: 'decline', ctx: { b: b.id, p, qty, price, months, city, penalty } }; },
  // residents complain about a polluting factory
  (s, c, mine) => { const b = pick(s, mine.filter(b => working(s, b) && factoryPollution(b.type, b.product) >= 0.3 && s.cities.some(k => Math.hypot(k.x / WORLD_SCALE - (b.idx % s.world!.w), k.y / WORLD_SCALE - Math.floor(b.idx / s.world!.w)) < POLLUTION_R))); if (!b) return null;
    const cost = Math.round(30000 + 120000 * factoryPollution(b.type, b.product));
    return { kind: 'pollution', title: 'Residents complain about smog', text: `People near ${b.name} blame its ${PRODUCTS[b.product!].name.toLowerCase()} plant for the smog. The press is asking questions.`,
      options: [{ id: 'fund', label: `Fund a clean-up (${fmtMoney(cost)})`, hint: 'Brand +3 for this product' }, { id: 'ignore', label: 'Ignore it', hint: 'Brand −4; 40% chance of a fine twice the clean-up cost' }], def: 'ignore', ctx: { b: b.id, cost } }; },
  // a safety inspector visits a run-down facility
  (s, c, mine) => { const b = pick(s, mine.filter(b => working(s, b) && b.condition < 65)); if (!b) return null;
    const cost = Math.round(Math.max(15000, b.invested * 0.05));
    return { kind: 'safety', title: 'Safety inspection', text: `An inspector found worn equipment at ${b.name} (condition ${Math.round(b.condition)}%).`,
      options: [{ id: 'repair', label: `Urgent repairs (${fmtMoney(cost)})`, hint: 'Condition +25' }, { id: 'risk', label: 'Take the risk', hint: '35% chance of an accident: closed a month, condition −20, fine' }], def: 'risk', ctx: { b: b.id, cost } }; },
  // a PR opportunity for a product on the shelves
  (s, c, mine) => { const sl = pick(s, mine.filter(b => b.type === 'store' && working(s, b)).flatMap(b => b.slots.filter(x => x.product && x.sold > 0).map(x => x.product!))); if (!sl) return null;
    const cost = Math.round(40000 + 30000 * rnd(s));
    return { kind: 'pr', title: 'A TV show wants your product', text: `A popular TV show offers to feature your ${PRODUCTS[sl].name.toLowerCase()} for ${fmtMoney(cost)}.`,
      options: [{ id: 'buy', label: `Pay ${fmtMoney(cost)}`, hint: 'Brand +5 for this product' }, { id: 'decline', label: 'Decline', hint: 'Nothing happens' }], def: 'decline', ctx: { p: sl, cost } }; },
  // a wholesaler offers a cheap lot of goods for a shelf
  (s, c, mine) => { const st = pick(s, mine.filter(b => b.type === 'store' && working(s, b)).flatMap(b => b.slots.map((x, i) => ({ b, x, i })).filter(o => o.x.product))); if (!st) return null;
    const p = st.x.product!; const qty = Math.max(10, Math.round(Math.max(st.x.sold, st.x.order, 20) * (1 + rnd(s)))); const price = Math.round(marketPrice(s, p) * 0.75 * 100) / 100; const q = Math.round(25 + 30 * rnd(s));
    return { kind: 'deal', title: 'A wholesaler has surplus stock', text: `A wholesaler offers ${qty} ${PRODUCTS[p].name.toLowerCase()} for the shelf at ${st.b.name} at $${price} each (25% below market), quality ${q}. Delivered at once.`,
      options: [{ id: 'buy', label: `Buy for ${fmtMoney(qty * price)}`, hint: 'Cheap stock, lower quality' }, { id: 'decline', label: 'Decline', hint: 'Nothing happens' }], def: 'decline', ctx: { b: st.b.id, slot: st.i, p, qty, price, q } }; },
  // the tax office audits a profitable company
  (s, c) => { const prof = c.history.slice(-12).reduce((n, h) => n + h.profit, 0); if (prof < 500_000) return null;
    const fee = Math.round(prof * 0.02);
    return { kind: 'audit', title: 'Tax audit', text: `The tax office is auditing your last year (profit ${fmtMoney(prof)}).`,
      options: [{ id: 'hire', label: `Hire top accountants (${fmtMoney(fee)})`, hint: 'No surprises' }, { id: 'self', label: 'Handle it yourselves', hint: '35% chance of back taxes: 8% of the profit' }], def: 'self', ctx: { prof, fee } }; },
];
/** New cards for every human company at the start of a month (1–2, drawn from what fits its situation). */
export function dealCards(s: GameState) {
  for (const c of s.companies) {
    if (c.isAI || c.bankrupt) { c.agenda = []; continue; }
    const mine = Object.values(s.buildings).filter(b => b.owner === c.id);
    const cands = GENS.map(g => g(s, c, mine)).filter((x): x is Omit<Card, 'id' | 'turn'> => !!x);
    const n = Math.min(cands.length, 1 + (rnd(s) < 0.5 ? 1 : 0)); const out: Card[] = [];
    while (out.length < n && cands.length) { const k = Math.floor(rnd(s) * cands.length); out.push({ ...cands.splice(k, 1)[0], id: 'k' + s.nextId++, turn: s.turn }); }
    c.agenda = out;
  }
}
export function answerCard(s: GameState, cid: string, id: string, option: string): Res {
  const c = company(s, cid); const k = c?.agenda?.find(x => x.id === id); if (!k) return err('No such decision');
  if (!k.options.some(o => o.id === option)) return err('Unknown option'); k.choice = option; return { ok: true };
}
/** Apply the chosen (or default) option of every card when the month is played. Costs go through the ledger, which is paid at the month's close. */
export function resolveCards(s: GameState) {
  for (const c of s.companies) {
    const cards = c.agenda ?? []; c.agenda = []; if (c.bankrupt) continue;
    for (const k of cards) {
      const opt = k.choice ?? k.def; const L: Ledger = c.ledger; const b = k.ctx.b ? s.buildings[String(k.ctx.b)] : undefined;
      if (k.ctx.b && (!b || b.owner !== c.id)) continue; // the facility is gone
      const strike = (why: string) => { b!.strikeUntil = s.turn; say(c, s, `${b!.name}: ${why} — it does nothing this month.`); };
      switch (k.kind) {
        case 'wage':
          if (opt === 'accept') { b!.wage = Math.round(b!.wage * 1.08); say(c, s, `${b!.name}: wages raised 8%.`); }
          else if (opt === 'half') { b!.wage = Math.round(b!.wage * 1.04); if (rnd(s) < 0.3) strike('the workers strike over the small raise'); else say(c, s, `${b!.name}: the workers accepted +4%.`); }
          else if (rnd(s) < 0.55) strike('the workers are on strike'); else say(c, s, `${b!.name}: the workers grumbled but kept working.`);
          break;
        case 'order':
          if (opt === 'accept') { s.contracts ??= []; s.contracts.push({ id: 'n' + s.nextId++, status: 'active', proposer: 'npc', to: c.id, seller: c.id, buyer: 'npc', product: k.ctx.p as ProductId, qty: +k.ctx.qty, price: +k.ctx.price, months: +k.ctx.months, term: +k.ctx.months, penalty: +k.ctx.penalty, from: b!.id, city: +k.ctx.city, delivered: 0, turn: s.turn });
            say(c, s, `Contract signed: ${k.ctx.qty} ${PRODUCTS[k.ctx.p as ProductId].name.toLowerCase()} a month to ${s.cities[+k.ctx.city].name} for ${k.ctx.months} months.`); }
          break;
        case 'pollution': {
          const p = b!.product!;
          if (opt === 'fund') { L.maint += +k.ctx.cost; c.brand[p] = Math.min(100, c.brand[p] + 3); say(c, s, `You funded a clean-up near ${b!.name}: brand +3.`); }
          else { c.brand[p] = Math.max(0, c.brand[p] - 4); if (rnd(s) < 0.4) { L.maint += 2 * +k.ctx.cost; say(c, s, `The city fined ${b!.name} ${fmtMoney(2 * +k.ctx.cost)} for pollution.`); } else say(c, s, `The smog story hurt your brand (−4).`); }
          break; }
        case 'safety':
          if (opt === 'repair') { L.maint += +k.ctx.cost; b!.condition = Math.min(100, b!.condition + 25); say(c, s, `${b!.name}: urgent repairs done (condition +25).`); }
          else if (rnd(s) < 0.35) { b!.condition = Math.max(0, b!.condition - 20); L.maint += Math.round(+k.ctx.cost * 0.6); strike('an accident closed the facility'); }
          break;
        case 'pr':
          if (opt === 'buy') { const p = k.ctx.p as ProductId; L.ads += +k.ctx.cost; c.brand[p] = Math.min(100, c.brand[p] + 5); say(c, s, `Your ${PRODUCTS[p].name.toLowerCase()} was on TV: brand +5.`); }
          break;
        case 'deal':
          if (opt === 'buy') { const sl = b!.slots[+k.ctx.slot]; if (!sl || sl.product !== k.ctx.p) break; const total = +k.ctx.qty * +k.ctx.price;
            c.cash -= total; L.purchases += total; b!.report.purchases += total; addStock(sl.stock, +k.ctx.qty, +k.ctx.q); say(c, s, `${b!.name}: ${k.ctx.qty} cheap ${PRODUCTS[sl.product].name.toLowerCase()} delivered.`); }
          break;
        case 'audit':
          if (opt === 'hire') L.maint += +k.ctx.fee;
          else if (rnd(s) < 0.35) { const back = Math.round(+k.ctx.prof * 0.08); L.tax += 0; L.maint += back; say(c, s, `The audit found errors: ${fmtMoney(back)} in back taxes.`); } else say(c, s, 'The audit found nothing.');
          break;
      }
    }
  }
}

// ================================================================ 3. supply contracts
const CONTRACT_HISTORY = 24; // months a finished or broken contract stays in the files
const sellerOk = (b: Building | undefined, cid: string, p: ProductId) => !!b && b.owner === cid && b.product === p && b.type !== 'store' && b.type !== 'rd';
const buyerOk = (b: Building | undefined, cid: string, p: ProductId) => !!b && b.owner === cid && (b.type === 'store' ? true : b.type === 'factory' && (b.layout ?? []).some(x => x.m === 'import' && x.product === p));
export function contractAction(s: GameState, cid: string, a: Action): Res {
  const c = company(s, cid)!; s.contracts ??= [];
  if (a.type === 'proposeContract') {
    const o = company(s, a.to); if (!o || o.bankrupt || o.id === cid) return err('Choose another company');
    const p = a.product; if (!PRODUCTS[p]) return err('Unknown product');
    const qty = Math.round(clamp(+a.qty || 0, 1, 1e6)), price = Math.round(clamp(+a.price || 0, 0.01, 1e7) * 100) / 100, months = Math.round(clamp(+a.months || 0, 1, 60)), penalty = Math.round(clamp(+a.penalty || 0, 0, 1e7) * 100) / 100;
    const b = s.buildings[a.building];
    if (a.role === 'sell' && !sellerOk(b, cid, p)) return err('Choose one of your facilities that makes ' + PRODUCTS[p].name);
    if (a.role === 'buy' && !buyerOk(b, cid, p)) return err('Choose a store, or a factory with an import cell for ' + PRODUCTS[p].name);
    if (s.contracts.filter(x => x.status === 'offer' && x.proposer === cid).length >= 10) return err('You already have 10 open offers');
    const k: Contract = { id: 'n' + s.nextId++, status: 'offer', proposer: cid, to: o.id, seller: a.role === 'sell' ? cid : o.id, buyer: a.role === 'sell' ? o.id : cid, product: p, qty, price, months, term: months, penalty, delivered: 0, turn: s.turn,
      ...(a.role === 'sell' ? { from: b!.id } : { dest: b!.id }) };
    s.contracts.push(k); say(o, s, `${c.name} offers you a supply contract: ${a.role === 'sell' ? 'to sell you' : 'to buy from you'} ${qty} ${PRODUCTS[p].name.toLowerCase()} a month at $${price} for ${months} months (see Desk).`);
    return { ok: true, info: k.id };
  }
  const k = s.contracts.find(x => x.id === (a as { id: string }).id); if (!k) return err('No such contract');
  if (a.type === 'answerContract') {
    if (k.status !== 'offer' || k.to !== cid) return err('This offer is not for you');
    const p = company(s, k.proposer);
    if (!a.accept) { s.contracts = s.contracts.filter(x => x !== k); say(p, s, `${c.name} turned down your supply contract for ${PRODUCTS[k.product].name.toLowerCase()}.`); return { ok: true }; }
    const b = s.buildings[a.building ?? ''];
    if (k.seller === cid) { if (!sellerOk(b, cid, k.product)) return err('Choose one of your facilities that makes ' + PRODUCTS[k.product].name); k.from = b!.id; }
    else { if (!buyerOk(b, cid, k.product)) return err('Choose a store, or a factory with an import cell for ' + PRODUCTS[k.product].name); k.dest = b!.id; }
    k.status = 'active'; k.turn = s.turn; say(p, s, `${c.name} accepted your supply contract for ${PRODUCTS[k.product].name.toLowerCase()}.`);
    return { ok: true, info: k.id };
  }
  if (a.type === 'cancelContract') {
    if (k.status === 'done' || k.status === 'broken') return err('This contract has already ended');
    if (k.status === 'offer') { if (k.proposer !== cid) return err('Not your offer'); s.contracts = s.contracts.filter(x => x !== k); return { ok: true }; }
    if (k.seller !== cid && k.buyer !== cid) return err('Not your contract');
    const fee = Math.round(k.penalty * k.qty * Math.min(3, k.months)); const other = company(s, k.seller === cid ? k.buyer : k.seller);
    if (c.cash - fee < -overdraftLimit(s, c)) return err(`Breaking the contract costs ${fmtMoney(fee)}`);
    c.cash -= fee; if (other) { other.cash += fee; say(other, s, `${c.name} broke the ${PRODUCTS[k.product].name.toLowerCase()} contract and paid you ${fmtMoney(fee)} compensation.`); }
    k.status = 'broken'; k.ended = s.turn; k.brokenBy = cid; return { ok: true };
  }
  return err('Bad action');
}
/** Is `source` (`contract:<id>`) a contract this building can pull `product` from? */
export function contractSource(s: GameState, cid: string, product: ProductId, source: string): Contract | null {
  const k = s.contracts?.find(x => 'contract:' + x.id === source); return k && k.status === 'active' && k.buyer === cid && k.product === product ? k : null;
}
/** AI companies answer offers made to them: they sign when the price is good for them and they have a facility for it. */
export function aiAnswerContracts(s: GameState) {
  for (const k of [...(s.contracts ?? [])]) {
    if (k.status !== 'offer') continue; const ai = company(s, k.to); if (!ai?.isAI) { if (s.turn - k.turn > 3) { s.contracts = s.contracts!.filter(x => x !== k); say(company(s, k.proposer), s, `Your supply contract offer for ${PRODUCTS[k.product].name.toLowerCase()} expired.`); } continue; }
    const mp = marketPrice(s, k.product); const mine = Object.values(s.buildings).filter(b => b.owner === ai.id);
    let ok = false;
    if (k.seller === ai.id) { const b = mine.find(b => sellerOk(b, ai.id, k.product) && capacity(b) * 0.7 >= k.qty); if (b && k.price >= mp * 1.02) { k.from = b.id; ok = true; } }
    else { const b = mine.find(b => buyerOk(b, ai.id, k.product) && (b.type === 'factory' || b.slots.some(x => x.product === k.product))); if (b && k.price <= mp * 0.97) { k.dest = b.id; ok = true;
      const src = 'contract:' + k.id; if (b.type === 'store') b.slots.filter(x => x.product === k.product).forEach(x => { x.source = src; }); else b.layout?.forEach(x => { if (x.m === 'import' && x.product === k.product) x.source = src; }); } }
    const p = company(s, k.proposer);
    if (ok) { k.status = 'active'; k.turn = s.turn; say(p, s, `${ai.name} signed your supply contract for ${PRODUCTS[k.product].name.toLowerCase()}.`); }
    else { s.contracts = s.contracts!.filter(x => x !== k); say(p, s, `${ai.name} turned down your supply contract for ${PRODUCTS[k.product].name.toLowerCase()} (price or volume does not suit them).`); }
  }
}
/** End of the month: wholesale (npc) customers collect their goods; every contract settles its shortfall and counts down. */
export function settleContracts(s: GameState) {
  s.contracts = (s.contracts ?? []).filter(k => k.ended == null || s.turn - k.ended <= CONTRACT_HISTORY); // forget old finished contracts
  for (const k of [...(s.contracts ?? [])]) {
    if (k.status !== 'active') continue;
    const seller = company(s, k.seller), buyer = k.buyer === 'npc' ? undefined : company(s, k.buyer); const from = k.from ? s.buildings[k.from] : undefined;
    const pn = PRODUCTS[k.product].name.toLowerCase();
    if (!seller || seller.bankrupt || (k.buyer !== 'npc' && (!buyer || buyer.bankrupt))) { s.contracts = s.contracts!.filter(x => x !== k); continue; }
    const fromOk = !!from && from.owner === seller.id;
    if (k.buyer === 'npc' && fromOk) { // the distributor collects
      const pool = salePool(from!, k.product); const n = Math.min(k.qty - k.delivered, poolQty(pool)); if (n > 0) {
        const tr = n * haulCost(s, k.product, from!.idx, cityTile(s, s.cities[k.city ?? from!.city])); const rev = n * k.price;
        takePool(pool, n); seller.cash += rev - tr; seller.ledger.revenue += rev; seller.ledger.transport += tr; from!.report.revenue += rev; from!.report.sold += n; from!.report.soldCo = (from!.report.soldCo ?? 0) + n; k.delivered += n; }
    }
    const left = Math.max(0, k.qty - k.delivered);
    if (left > 0.5 && k.penalty > 0) {
      const spare = fromOk ? Math.max(0, poolQty(salePool(from!, k.product))) : 0; const sellerShort = Math.max(0, left - spare), buyerShort = left - sellerShort;
      if (sellerShort > 0.5) { const f = Math.round(sellerShort * k.penalty); seller.cash -= f; seller.ledger.purchases += f; if (buyer) { buyer.cash += f; buyer.ledger.revenue += f; } say(seller, s, `Contract shortfall: ${Math.round(sellerShort)} ${pn} not delivered — penalty ${fmtMoney(f)}.`); if (buyer) say(buyer, s, `${seller.name} delivered ${Math.round(sellerShort)} ${pn} short: you received ${fmtMoney(f)} in penalties.`); }
      if (buyer && buyerShort > 0.5) { const f = Math.round(buyerShort * k.penalty); buyer.cash -= f; buyer.ledger.purchases += f; seller.cash += f; seller.ledger.revenue += f; say(buyer, s, `You did not collect ${Math.round(buyerShort)} ${pn} under your contract with ${seller.name} — penalty ${fmtMoney(f)}. Set the contract as the source of a shelf or import cell.`); say(seller, s, `${buyer.name} did not collect ${Math.round(buyerShort)} ${pn}: you received ${fmtMoney(f)}.`); }
    }
    k.lastDelivered = Math.round(k.delivered); k.delivered = 0; k.months--;
    if (k.months <= 0) { k.status = 'done'; k.ended = s.turn; say(seller, s, `Your ${pn} supply contract has ended.`); say(buyer, s, `Your ${pn} supply contract has ended.`); }
  }
}

// ================================================================ 4. forecast
export interface Forecast {
  turn: number; cash0: number; cash: number; netWorth0: number; netWorth: number; ledger: Ledger;
  buildings: { id: string; name: string; produced: number; sold: number; revenue: number; result: number; note: string; idle: boolean }[];
  events: string[]; warnings: string[];
  advisor: { name: string; spec: string; skill: number; error: number }; // who prepared it; error = typical deviation of the figures (0.04 = ±4%)
}
// ---- forecasts are prepared by the company's advisor: the better the advisor, the closer the figures
/** Effective forecasting skill 1-10: a financial advisor is the specialist (+2). */
export const forecastSkill = (a: { skill: number; spec: string }) => Math.min(10, a.skill + (a.spec === 'finance' ? 2 : 0));
/** How far off the figures can be: ±4% for the best, ±40% for the worst. */
export const forecastError = (skill: number) => 0.04 * (11 - skill);
const hash01 = (key: string) => { let x = 2166136261; for (let i = 0; i < key.length; i++) x = Math.imul(x ^ key.charCodeAt(i), 16777619); x ^= x >>> 15; x = Math.imul(x, 2246822507); x ^= x >>> 13; return (x >>> 0) / 4294967296; };
/** Round to the precision a forecaster of this skill would give (2 or 3 significant digits). */
const roughly = (v: number, skill: number) => { if (!v) return 0; const d = Math.floor(Math.log10(Math.abs(v))) - (skill >= 7 ? 2 : 1); const m = 10 ** Math.max(0, d); return Math.round(v / m) * m; };
/** Play the coming month on a copy of the game (only this company's sealed orders, other players' plans unknown, fresh dice). */
export function forecast(s: GameState, cid: string): Forecast | { error: string } | null {
  const c0 = company(s, cid); if (!c0 || c0.bankrupt || s.finished) return null;
  const adv = c0.staff?.find(x => x.kind === 'advisor'); if (!adv) return { error: 'Forecasts are prepared by an advisor: hire one in the Personnel tab.' };
  const t = cloneState(s); t.orders = (t.orders ?? []).filter(o => o.company === cid); t.rng = (Math.floor(Math.random() * 2 ** 31) ^ s.rng) | 0;
  const nw0 = netWorth(s, c0); processTurn(t);
  const c = company(t, cid)!;
  const bs = Object.values(t.buildings).filter(b => b.owner === cid);
  const warnings: string[] = [];
  if (c.cash < 0) warnings.push(`Cash goes negative (${fmtMoney(c.cash)}): you pay 2% a month on it.`);
  if (c.cash < -overdraftLimit(t, c) * 0.95) warnings.push('You will be at your overdraft limit: purchases get refused.');
  for (const b of bs) {
    if (b.building) continue;
    if (b.type === 'store') for (const sl of b.slots) { if (sl.product && sl.stock.qty < 1 && sl.lost > 0) warnings.push(`${b.name}: ${PRODUCTS[sl.product].name} sells out (about ${Math.round(sl.lost)} customers lost).`); if (sl.product && !sl.source) warnings.push(`${b.name}: no supplier for ${PRODUCTS[sl.product].name}.`); }
    else if (b.product && b.type !== 'rd' && capacity(b) > 0 && b.report.produced < capacity(b) * 0.25) warnings.push(`${b.name}: produces only ${Math.round(b.report.produced)} of ${Math.round(capacity(b))} — ${b.report.note || 'check its inputs and staff'}`);
  }
  // the advisor's estimate: every figure carries its own bias, fixed for this month (recalculating does not average it away),
  // figures are rounded, and a weaker advisor overlooks some of the warnings and events
  const skill = forecastSkill(adv), err = forecastError(skill);
  const off = (key: string) => 1 + err * (hash01(`${cid}:${s.turn}:${adv.id}:${key}`) * 2 - 1);
  const est = (key: string, v: number) => roughly(v * off(key), skill);
  const notices = (text: string) => hash01(`${adv.id}:${s.turn}:${text}`) < 0.35 + skill * 0.065;
  const L = c.ledger; const led = { ...L };
  for (const k of ['revenue', 'purchases', 'transport', 'wages', 'maint', 'ads', 'interest', 'tax'] as const) led[k] = est(k, L[k]);
  led.profit = roughly(L.profit + (led.revenue - L.revenue) - (['purchases', 'transport', 'wages', 'maint', 'ads', 'interest', 'tax'] as const).reduce((n, k) => n + led[k] - L[k], 0), skill);
  const nw1 = netWorth(t, c);
  return {
    turn: s.turn, cash0: c0.cash, cash: Math.round(c0.cash + est('cash', c.cash - c0.cash)), netWorth0: nw0, netWorth: Math.round(nw0 + est('nw', nw1 - nw0)), ledger: led,
    buildings: bs.map(b => ({ id: b.id, name: b.name, produced: est(b.id + 'p', b.report.produced), sold: est(b.id + 's', b.report.sold), revenue: est(b.id + 'r', b.report.revenue), result: est(b.id + 'x', b.report.revenue - b.report.purchases - b.report.wages - b.report.maint), note: b.report.note ?? '', idle: !!b.building || (b.strikeUntil ?? -1) >= s.turn })),
    events: c.news.filter(n => n.turn === s.turn).map(n => n.text).filter(notices), warnings: warnings.filter(notices).slice(0, 30),
    advisor: { name: adv.name, spec: adv.spec, skill: adv.skill, error: err },
  };
}
