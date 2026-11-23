// Game engine: pure functions over GameState. One call to processTurn() = one month.
import {
  PRODUCTS, PRODUCT_LIST, BUILDINGS, LENDERS, type Lender, TERRAIN_INFO, SUPPLIES, SUPPLY_HAND, DECOR_COST, DECOR_FADE, DECOR_BRAND, DECOR_ATTRACT, LOT_PER_PERSON, LOT_MIN, BUILD_TAX, MAX_LINES, MAX_AUTO, MAX_STORE_SIZE, STORE_SLOTS, SUPER_PRODUCTS, BASE_WAGE,
  BUILD_TURNS, MEDIA, MEDIA_TERMS, MEDIA_DISCOUNT, MEDIA_CANCEL_MONTHS, ARTICLE_FEE, ARTICLE_MAX, MALL_UNITS, MALL_MIN_BRAND, MALL_FITOUT, MALL_TRAFFIC, MALL_BRAND_BOOST, MALL_LEASE, MALL_PER_CITY, IMPORT_MARKUP, IMPORT_QUALITY, NPC_SHARE_MARKUP, MONTH_NAMES, COMPANY_COLORS, MODULES, FAC_GRID, WORLD_SCALE, WORLD_W, OVERSTAFF_CAP, OVERSTAFF_BONUS,
  type ModuleType,
  type ProductId, type BuildingType, type Terrain,
} from './data.js';
import { buildWorld, nearestCity } from './world.js';
import { resolveOrders, resolveCards, dealCards, aiAnswerContracts, settleContracts, contractAction, contractSource, cancelOrder, answerCard } from './desk.js';
import type { GameState, Settings, City, Company, Building, StoreSlot, Stock, Action, Listing, Ledger, LayoutCell, HarbourGood, Loan, Person, Vacancy, MallInfo, Subsidy, Lot } from './types.js';

// ---------------------------------------------------------------- random
export function rnd(s: GameState): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = Math.imul(s.rng ^ (s.rng >>> 15), 1 | s.rng);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rr = (s: GameState, a: number, b: number) => a + rnd(s) * (b - a);
function shuffle<T>(s: GameState, a: T[]): T[] { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd(s) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const round2 = (v: number) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- setup
export const DEFAULT_SETTINGS: Settings = {
  name: 'New game', startCash: 1_000_000, startYear: 1995, maxMonths: 120, targetNetWorth: 10_000_000,
  aiCompanies: 3, aiSkill: 1, cityCount: 8, maxPlayers: 6, turnIntervalHours: 24, advanceWhenReady: true,
  seed: Math.floor(Math.random() * 1e9), events: true, starter: true,
};

const CITY_NAMES = ['Newbridge', 'Port Harlow', 'Dunmere', 'Alderton', 'Westhaven', 'Kingsford', 'Ravenna', 'Stoneport', 'Marlowe', 'Fairview', 'Oakdale', 'Ironvale', 'Brightwater', 'Coldharbor', 'Eastmoor', 'Silverton', 'Hartwell', 'Glenrock', 'Lakeshire', 'Redcliff'];
const TOWN_NAMES = ['Ashby', 'Barrow', 'Cobham', 'Dalby', 'Elmstead', 'Foxley', 'Garston', 'Hadley', 'Ingleby', 'Jarrow', 'Kelby', 'Lowick', 'Marden', 'Netherby', 'Oxley', 'Pennick', 'Quarry Hill', 'Ridley', 'Selby', 'Thornby', 'Upton', 'Wexley', 'Yarrow', 'Aldwick', 'Bramley', 'Crofton', 'Denby', 'Eastwick', 'Fernley', 'Gorsey'];
const AI_NAMES = ['Globex', 'Initech', 'Umbrella Trading', 'Hooli Goods', 'Acme Industries', 'Vandelay Ltd', 'Cyberdyne Supply', 'Stark Works'];

export function createGame(settings: Settings): GameState {
  const s: GameState = {
    settings, turn: 0, rng: settings.seed | 0, nextId: 1, cities: [], companies: [], buildings: {}, lots: {},
    market: {}, effects: [], news: [], interest: 0.006, finished: false,
  };
  const names = shuffle(s, [...CITY_NAMES]);
  for (let i = 0; i < settings.cityCount; i++) {
    const pop = Math.round(rr(s, 150_000, 900_000) / 1000) * 1000;
    s.cities.push({
      id: i, name: names[i % names.length], x: 0, y: 0, pop,
      wealth: round2(rr(s, 0.75, 1.35)), wageIdx: round2(rr(s, 0.85, 1.2)), priceIdx: round2(rr(s, 0.85, 1.25)), radius: 5,
    });
  }
  const tnames = shuffle(s, [...TOWN_NAMES]);
  for (let i = 0; i < settings.cityCount; i++) {
    const pop = Math.round(rr(s, 6000, 55000) / 500) * 500;
    s.cities.push({ id: settings.cityCount + i, name: tnames[i % tnames.length], x: 0, y: 0, pop, wealth: round2(rr(s, 0.7, 1.25)), wageIdx: round2(rr(s, 0.8, 1.15)), priceIdx: round2(rr(s, 0.85, 1.2)), radius: 2, town: true });
  }
  { const m = s.cities[0]; m.pop = Math.round(rr(s, 1_400_000, 2_100_000) / 1000) * 1000; m.wealth = round2(rr(s, 1.2, 1.4)); } // the metropolis: sized before the map is drawn
  buildWorld(s);
  refreshHarbours(s);
  refreshCandidates(s, true);
  { // every map has one big city (city 0) with a harbour and a ready-built shopping mall for sale
    const m = s.cities[0];
    const near = [...(s.world?.tiles ?? '')].map((ch, i) => ch === 'u' && nearestCity(s.cities, i) === 0 ? i : -1).filter(i => i >= 0);
    if (near.length) { const idx = near[Math.floor(rnd(s) * near.length)]; const def = BUILDINGS.mall;
      (s.vacant ??= []).push({ id: 'v' + s.nextId++, type: 'mall', city: 0, idx, product: null, cond: 100, land: lotPrice(s, idx), build: Math.round(def.cost * 0.85 / 100) * 100, listedTurn: 0, origin: 'estate', perm: true });
      s.news.push({ turn: 0, kind: 'info', tag: 'vacant', text: `${m.name}, the largest city in the land, has a ready-built shopping mall on the market.` }); }
  }
  for (let i = 0; i < 6; i++) spawnVacancy(s, true);
  for (let i = 0; i < 4; i++) spawnSubsidy(s, true);
  for (const p of PRODUCT_LIST) s.market[p.id] = { idx: 1, demand: 1 };
  s.news.push({ turn: 0, text: `Welcome to ${settings.name}. The economy is open for business.`, kind: 'info' });
  for (let i = 0; i < settings.aiCompanies; i++) aiSeed(s, addCompany(s, { name: AI_NAMES[i % AI_NAMES.length], isAI: true }));
  return s;
}

export function addCompany(s: GameState, o: { name: string; isAI?: boolean; playerId?: string; color?: string; portrait?: number }): Company {
  const tech = {} as Record<ProductId, number>, brand = {} as Record<ProductId, number>;
  for (const p of PRODUCT_LIST) { tech[p.id] = 15; brand[p.id] = 0; }
  const used = new Set(s.companies.map(c => c.color));
  const c: Company = {
    id: 'c' + s.nextId++, name: o.name, color: o.color ?? COMPANY_COLORS.find(x => !used.has(x)) ?? '#888',
    portrait: o.portrait ?? Math.floor(rnd(s) * 72), isAI: !!o.isAI, playerId: o.playerId,
    cash: s.settings.startCash, debt: 0, tech, brand, ledger: emptyLedger(), history: [], ready: !!o.isAI,
    bankrupt: false, negMonths: 0, lossCarry: 0, news: [], loans: [],
  };
  if (c.isAI) { const cons = PRODUCT_LIST.filter(p => p.kind === 'consumer' && p.depth <= 1 && !p.research); c.aiFocus = cons[Math.floor(rnd(s) * cons.length)].id; c.cash = Math.round(c.cash * 1.5); }
  ensureEquity(c); c.price = c.priceHist![0] = Math.max(0.01, round2(c.cash / c.shares!)); if (c.isAI) { c.float = Math.round(c.shares! * 0.3); c.policy = { dividend: 25, invest: 0, target: 'facilities' }; } // AI companies are listed with 30% of the shares on the market
  s.companies.push(c);
  return c;
}

const emptyLedger = (): Ledger => ({ revenue: 0, purchases: 0, transport: 0, wages: 0, maint: 0, ads: 0, interest: 0, tax: 0, profit: 0 });
const emptyReport = () => ({ produced: 0, sold: 0, revenue: 0, purchases: 0, wages: 0, maint: 0, note: '' });
const emptyStock = (): Stock => ({ qty: 0, q: 50 });

// ---------------------------------------------------------------- queries
export function dateOf(s: GameState, turn = s.turn): string {
  return `${MONTH_NAMES[turn % 12]} ${s.settings.startYear + Math.floor(turn / 12)}`;
}
export const lotKey = (idx: number) => String(idx);
export function terrainAt(s: { world?: { tiles: string } }, idx: number): Terrain { return (s.world?.tiles[idx] ?? 'd') as Terrain; }
export function lotPrice(s: { cities: City[]; world?: { tiles: string } }, idx: number): number {
  const t = terrainAt(s, idx); const base = TERRAIN_INFO[t].price; if (!base) return 0;
  if (t === 'u' || t === 'l' || t === 's' || t === 'w') return Math.max(LOT_MIN, Math.round(tilePop(s as TileCtx, idx) * LOT_PER_PERSON / 100) * 100); // city land: priced by the people living on the tile
  const c = s.cities[nearestCity(s.cities, idx)];
  const f = 0.85 * (0.9 + c.priceIdx * 0.1);
  const jitter = 0.9 + ((idx * 7919) % 21) / 100;
  return Math.round((base * f * jitter) / 100) * 100;
}
export function laborPool(c: City) { return Math.round(c.pop * 0.004); }
export function laborUsed(s: GameState, city: number) { let n = 0; for (const b of Object.values(s.buildings)) if (b.city === city) n += b.workers; return n; }
export function cityWage(s: GameState, city: number): number {
  const c = s.cities[city]; const util = laborUsed(s, city) / laborPool(c);
  return Math.round(BASE_WAGE * c.wageIdx * (1 + Math.max(0, util - 0.5) * 0.8));
}
export const retailRef = (s: GameState, city: number, p: ProductId) => round2(PRODUCTS[p].basePrice * 1.42 * s.market[p].idx * s.cities[city].priceIdx);
/** Hi-tech products need research before a company can manufacture them. */
export const UNLOCK_RATE = 3; // an R&D building turns scientist-points into hi-tech unlock progress at this rate
export const researchOf = (c: Company, p: ProductId): number => c.research?.[p] ?? 0;
export const isUnlocked = (c: Company, p: ProductId): boolean => { const d = PRODUCTS[p]; return !d.research || researchOf(c, p) >= d.research; };
export const canResearch = (c: Company, p: ProductId): boolean => { const d = PRODUCTS[p]; return !!d.research && !isUnlocked(c, p) && (!d.after || isUnlocked(c, d.after)); };
/** Global market: takes leftovers at a discount, and its price sags as more of a good is dumped on it in one month. */
export const WORLD_DISCOUNT = 0.8, WORLD_DROP = 0.4, WORLD_VOL = 15;
export const worldPrice = (s: GameState, p: ProductId) => round2(PRODUCTS[p].basePrice * s.market[p].idx * WORLD_DISCOUNT);
export const worldVolume = (p: ProductId) => PRODUCTS[p].cap * WORLD_VOL;
export const importPrice = (s: GameState, p: ProductId) => round2(PRODUCTS[p].basePrice * s.market[p].idx * IMPORT_MARKUP);
export const dist = (s: GameState, a: number, b: number) => s.dist ? s.dist[a][b] : a === b ? 15 : Math.hypot(s.cities[a].x - s.cities[b].x, s.cities[a].y - s.cities[b].y);

// ---- railways: buildings within RAIL_REACH tiles of a track are on that rail network; shipping between two buildings of the same network is cheaper and bigger
export const RAIL_REACH = 3, RAIL_COST_MUL = 0.5, RAIL_SHIP_MUL = 2.5, SHIP_BASE = 1.2;
type RailMap = { on: Uint8Array; comp: Int16Array };
const railCache = new WeakMap<object, RailMap>();
export function railMap(s: { world?: { w: number; h: number; tiles: string; rails?: { a: number; b: number; tiles: number[] }[] } }): RailMap | null {
  const w = s.world; if (!w?.rails?.length) return null; let m = railCache.get(w); if (m) return m;
  const n = w.w * w.h; m = { on: new Uint8Array(n), comp: new Int16Array(n).fill(-1) };
  const uf: number[] = []; const root = (i: number): number => { uf[i] ??= i; return uf[i] === i ? i : (uf[i] = root(uf[i])); };
  for (const r of w.rails) uf[root(r.a)] = root(r.b);
  for (const r of w.rails) { const c = root(r.a); for (const t of r.tiles) { m.on[t] = 1; m.comp[t] = c; } }
  for (const r of w.rails) { const c = root(r.a); for (const t of r.tiles) { const tx = t % w.w, ty = (t / w.w) | 0;
    for (let dy = -RAIL_REACH; dy <= RAIL_REACH; dy++) for (let dx = -RAIL_REACH; dx <= RAIL_REACH; dx++) { const x = tx + dx, y = ty + dy; if (x >= 0 && y >= 0 && x < w.w && y < w.h && m.comp[y * w.w + x] < 0) m.comp[y * w.w + x] = c; } } }
  // urban tiles next to a connected tile belong to the same network (no tracks are laid inside cities)
  const urb = (i: number) => 'ulsh'.includes(w.tiles[i]); const q: number[] = [];
  for (let i = 0; i < n; i++) if (m.comp[i] >= 0 && urb(i)) q.push(i);
  for (let k = 0; k < q.length; k++) { const i = q[k], x = i % w.w; for (const j of [i - 1, i + 1, i - w.w, i + w.w]) if (j >= 0 && j < n && !(j === i - 1 && x === 0) && !(j === i + 1 && x === w.w - 1) && m.comp[j] < 0 && urb(j)) { m.comp[j] = m.comp[i]; q.push(j); } }
  railCache.set(w, m); return m;
}
// ---- hauling: goods travel tile by tile; entering a tile costs: rail or city (downtown/suburb/town hall) 1, road or harbour 5, field / farmland / grass 10, forest 20, mountain (and ore deposits) 100, sea 5.
// Changing between land and sea costs an extra 500 (loading / unloading at a port).
export const HAUL_RAIL = 1, HAUL_ROAD = 5, HAUL_FIELD = 10, HAUL_FOREST = 20, HAUL_MOUNTAIN = 100, HAUL_SEA = 5, HAUL_SWITCH = 500;
export const HAUL_OFF = HAUL_FIELD; // legacy name: open land
export const HAUL_K = 0.0001; // share of a product's base price per point of path cost
const NO_PATH = 65535;
const fieldCache = new WeakMap<object, Map<number, Uint16Array>>();
const isSea = (ch: string) => ch === 'a' || ch === 'd';
/** Cost points of entering tile `i`. */
function haulStep(w: { tiles: string }, rm: ReturnType<typeof railMap>, i: number): number {
  if (rm?.on[i]) return HAUL_RAIL;
  switch (w.tiles[i]) {
    case 'a': case 'd': return HAUL_SEA;
    case 'u': case 'l': case 's': case 'h': return HAUL_RAIL;
    case 'i': return HAUL_RAIL;
    case 'r': case 'p': case 'w': return HAUL_ROAD;
    case 't': return HAUL_FOREST;
    case 'm': case 'e': case 'c': case 'x': return HAUL_MOUNTAIN;
    default: return HAUL_FIELD; // g, f, o
  }
}
/** Cost of moving from tile `u` onto the neighbouring tile `v` (adds the land/sea change surcharge). */
const haulMove = (w: { tiles: string }, rm: ReturnType<typeof railMap>, u: number, v: number) => haulStep(w, rm, v) + (isSea(w.tiles[u]) !== isSea(w.tiles[v]) ? HAUL_SWITCH : 0);
/** Cheapest haul cost from `origin` to every tile (Dial's bucket search; 65535 = cannot be reached over land). */
export function costField(s: TileCtx, origin: number): Uint16Array {
  const w = s.world!; let cache = fieldCache.get(w); if (!cache) fieldCache.set(w, cache = new Map());
  const hit = cache.get(origin); if (hit) return hit;
  const n = w.w * w.h, rm = railMap(s), d = new Uint16Array(n).fill(NO_PATH); d[origin] = 0;
  const B = HAUL_SWITCH + HAUL_MOUNTAIN + 1, buckets: number[][] = Array.from({ length: B }, () => []); buckets[0].push(origin);
  let pending = 1;
  for (let cur = 0; pending > 0 && cur < NO_PATH; cur++) {
    const bk = buckets[cur % B];
    while (bk.length) {
      const u = bk.pop()!; pending--; if (d[u] !== cur) continue;
      const x = u % w.w, y = (u / w.w) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0); if (nx < 0 || ny < 0 || nx >= w.w || ny >= w.h) continue;
        const v = ny * w.w + nx, st = haulMove(w, rm, u, v); const nd = cur + st;
        if (nd < d[v] && nd < NO_PATH) { d[v] = nd; buckets[nd % B].push(v); pending++; }
      }
    }
  }
  if (cache.size >= 60) cache.delete(cache.keys().next().value!);
  cache.set(origin, d); return d;
}
/** Path cost between two tiles; places the land route cannot join (islands) fall back to a straight line at the off-road rate plus a ferry surcharge. */
export function haulPath(s: TileCtx, from: number, to: number): number {
  const c = costField(s, from)[to]; if (c !== NO_PATH) return c;
  const w = s.world!; return Math.round(Math.hypot((from % w.w) - (to % w.w), ((from / w.w) | 0) - ((to / w.w) | 0)) * HAUL_FIELD * 1.5);
}
/** The cheapest tile route from `from` to `to` (both included), or [] when the land route does not exist. */
export function haulRoute(s: TileCtx, from: number, to: number): number[] {
  const w = s.world!, d = costField(s, from); if (d[to] === NO_PATH) return [];
  const rm = railMap(s); const out = [to]; let u = to, guard = w.w * w.h;
  while (u !== from && guard-- > 0) {
    const x = u % w.w, y = (u / w.w) | 0; let next = -1;
    for (let k = 0; k < 4 && next < 0; k++) {
      const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0); if (nx < 0 || ny < 0 || nx >= w.w || ny >= w.h) continue;
      const v = ny * w.w + nx; if (d[v] !== NO_PATH && d[v] + haulMove(w, rm, v, u) === d[u]) next = v;
    }
    if (next < 0) break; out.push(next); u = next;
  }
  return out.reverse();
}
/** Cost points of crossing tile `idx` (rail / city 1, road 10, open land 100; 0 = water) and the cheapest path cost from the nearest city's centre to it. */
export function tileHaul(s: TileCtx, idx: number): { step: number; toCity: number | null; city: number } {
  const w = s.world!, c = nearestCity(s.cities, idx), from = Math.floor(s.cities[c].y / WORLD_SCALE) * w.w + Math.floor(s.cities[c].x / WORLD_SCALE);
  const step = haulStep(w, railMap(s), idx); const d = costField(s, from)[idx];
  return { step, toCity: d === NO_PATH ? null : d, city: c };
}
/** Transport cost per unit of a product between two tiles. */
export const haulCost = (s: TileCtx, p: ProductId, from: number, to: number) => PRODUCTS[p].basePrice * HAUL_K * haulPath(s, from, to);

// ---- per-tile figures: population, transport availability (0-100), build price
type TileCtx = { cities: City[]; emitters?: { idx: number; w: number }[]; turn?: number; world?: { w: number; h: number; tiles: string; qual?: string; rails?: { a: number; b: number; tiles: number[] }[] } };
const URBAN_W: Record<string, number> = { u: 3, l: 5, s: 1, w: 1, h: 3 }, RURAL_POP: Record<string, number> = { f: 40, g: 12, t: 5, b: 8 };
const popCache = new WeakMap<object, number[]>(), weightCache = new WeakMap<object, Float32Array>();
/** Population weight of every tile (0 = not urban). Downtown is fixed; a suburb or town tile weighs more the closer it is to downtown: touching it twice as much as an average one,
 *  fading to a quarter as much far away (so the people crowd around the centre). */
function urbanWeights(s: TileCtx): Float32Array {
  const w = s.world!; let m = weightCache.get(w); if (m) return m; const n = w.tiles.length, W = w.w, H = w.h;
  const dist = new Uint8Array(n).fill(255); const q: number[] = [];
  for (let i = 0; i < n; i++) { const ch = w.tiles[i]; if (ch === 'u' || ch === 'l' || ch === 'h') { dist[i] = 0; q.push(i); } }
  for (let h = 0; h < q.length; h++) { const i = q[h], d = dist[i]; if (d >= 20) continue; const x = i % W, y = (i / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const j = Y * W + X; if (dist[j] === 255) { dist[j] = d + 1; q.push(j); } } }
  m = new Float32Array(n);
  for (let i = 0; i < n; i++) { const ch = w.tiles[i]; const k = URBAN_W[ch]; if (!k) continue;
    if (ch === 's' || ch === 'w') { const d = dist[i]; m[i] = d <= 1 ? 2 : 0.5 + Math.exp(-(d - 2) / 4); } else m[i] = k; } // d = tiles to the nearest downtown tile (Chebyshev)
  weightCache.set(w, m); return m;
}
function urbanSums(s: TileCtx): number[] {
  const w = s.world!; let m = popCache.get(w); if (m) return m; m = s.cities.map(() => 0); const wt = urbanWeights(s);
  for (let i = 0; i < w.tiles.length; i++) if (wt[i] > 0) m[nearestCity(s.cities, i)] += wt[i];
  popCache.set(w, m); return m;
}
/** Inhabitants on a tile: a city's population is spread over its downtown and suburb tiles by weight (suburbs next to downtown hold the most of them); farmland and grass hold a few. */
export function tilePop(s: TileCtx, idx: number): number {
  const t = terrainAt(s, idx), k = urbanWeights(s)[idx];
  if (!k) return RURAL_POP[t] ?? 0;
  const c = nearestCity(s.cities, idx); return Math.round(s.cities[c].pop * k / Math.max(1, urbanSums(s)[c]));
}
// ---- area of effect: every building feels the 5x5 tiles around it
export const AREA_R = 2;
/** Radius of the square a building feels / can expand over: farms work a bigger 7x7 area. */
export const areaR = (type: string): number => (type === 'farm' ? 3 : AREA_R);
export const HALL_BONUS = 0.3;
export type AreaKind = 'pop' | 'deposits' | 'trees' | 'farmland';
export interface AreaInfo { kind: AreaKind; hall?: number; pop: number; count: number; max: number; factor: number; quality?: number; qualityName?: string }
/** Tile quality 0..1: forest density, farmland fertility, suburb services (null for other terrain). */
export const QUALITY_NAME: Record<string, string> = { t: 'Density', f: 'Fertility', g: 'Fertility', s: 'Services' };
/** Cities pollute everything within POLLUTION_R tiles: strong at the centre, fading out, stronger for big cities. 0..1 per tile. */
export const ROAD_POLLUTION = 0.06, POLLUTION_R = 30, POLLUTION_FERT_LOSS = 0.7;
/** How much a facility fouls the air (0..1): steel mills are the worst, light assembly the least. Only factories pollute. */
export const FACTORY_POLLUTION: Partial<Record<ProductId, number>> = { steel: 1, chemicals: 0.8, fuel: 0.8, plastics: 0.6, cmaterials: 0.5, cars: 0.5, electronics: 0.35, components: 0.3, appliances: 0.3, fabric: 0.3, pharma: 0.3 };
export const factoryPollution = (type: string, product: ProductId | null): number => (type === 'factory' && product ? FACTORY_POLLUTION[product] ?? 0.15 : 0);
const pollCache = new WeakMap<object, { turn: number | undefined; src: unknown; sig: string; f: Float32Array }>();
type Emitter = { idx: number; w: number };
function pollutionField(s: TileCtx): Float32Array {
  const w = s.world!; const turn = (s as { turn?: number }).turn; const src = s.emitters ?? (s as { buildings?: unknown }).buildings; const hit = pollCache.get(w); if (hit && turn !== undefined && hit.turn === turn && hit.src === src) return hit.f; // one field per turn (and per game copy)
  const em: Emitter[] = s.emitters ?? Object.values((s as { buildings?: Record<string, { type: string; idx: number; product: ProductId | null; building: number }> }).buildings ?? {}).filter(b => !b.building).map(b => ({ idx: b.idx, w: factoryPollution(b.type, b.product) })).filter(e => e.w > 0);
  const sig = s.cities.map(c => Math.round(c.pop / 20000)).join(',') + '|' + em.map(e => e.idx + ':' + e.w).join(','); if (hit && hit.sig === sig) { hit.turn = turn; hit.src = src; return hit.f; }
  const f = new Float32Array(w.w * w.h);
  const spread = (cx: number, cy: number, I: number, R: number) => {
    for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(w.h - 1, Math.ceil(cy + R)); y++) for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(w.w - 1, Math.ceil(cx + R)); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (d >= R) continue; f[y * w.w + x] += I * Math.pow(1 - d / R, 1.5);
    }
  };
  for (const c of s.cities) spread(c.x / WORLD_SCALE, c.y / WORLD_SCALE, Math.min(1, Math.sqrt(c.pop / 1_200_000)), POLLUTION_R);
  for (const e of em) spread((e.idx % w.w) + 0.5, Math.floor(e.idx / w.w) + 0.5, 0.8 * e.w, 6 + 8 * e.w); // steel: 14 tiles, light factories: ~7
  for (let i = 0; i < w.tiles.length; i++) if (w.tiles[i] === 'r') spread((i % w.w) + 0.5, Math.floor(i / w.w) + 0.5, ROAD_POLLUTION, 5); // traffic: every road tile fouls 5 tiles around it (a straight road adds up to ~25%)
  { // forests clean the air: the share of forest in the 9x9 tiles around a tile takes up to 70% of its pollution away
    const R = 4, sum = new Int32Array((w.w + 1) * (w.h + 1)); for (let y = 0; y < w.h; y++) { let row = 0; for (let x = 0; x < w.w; x++) { row += w.tiles[y * w.w + x] === 't' ? 1 : 0; sum[(y + 1) * (w.w + 1) + x + 1] = sum[y * (w.w + 1) + x + 1] + row; } }
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) { const i = y * w.w + x; if (f[i] <= 0) continue; const x0 = Math.max(0, x - R), x1 = Math.min(w.w, x + R + 1), y0 = Math.max(0, y - R), y1 = Math.min(w.h, y + R + 1);
      const n = sum[y1 * (w.w + 1) + x1] - sum[y0 * (w.w + 1) + x1] - sum[y1 * (w.w + 1) + x0] + sum[y0 * (w.w + 1) + x0]; f[i] *= 1 - Math.min(0.7, 0.9 * n / ((x1 - x0) * (y1 - y0))); }
  }
  for (let i = 0; i < f.length; i++) if (f[i] > 1) f[i] = 1;
  pollCache.set(w, { turn, src, sig, f }); return f;
}
export function tilePollution(s: TileCtx, idx: number): number { return s.world ? pollutionField(s)[idx] ?? 0 : 0; }
export function tileQuality(s: TileCtx, idx: number): number | null {
  const w = s.world; if (!w || !QUALITY_NAME[w.tiles[idx]]) return null; const c = w.qual?.substr(idx * 2, 2); const base = !c ? 0.5 : +c / 99;
  return w.tiles[idx] === 'f' ? Math.max(0.05, base * (1 - POLLUTION_FERT_LOSS * tilePollution(s, idx))) : base; // smog from nearby cities blights farmland
}
const AREA_TERRAIN: Record<string, [AreaKind, string]> = { mine: ['deposits', 'e'], copper: ['deposits', 'c'], quarry: ['deposits', 'm'], rare: ['deposits', 'x'], oil: ['deposits', 'o'], forest: ['trees', 't'], farm: ['farmland', 'f'] };
const areaCache = new WeakMap<object, Map<string, number>>();
/** Extractive facilities (mines, wells, farms, logging camps) only profit from tiles of their square (5x5, farms 7x7) they have bought as expansions. */
export const EXPAND_TYPES = ['mine', 'copper', 'quarry', 'rare', 'oil', 'farm', 'forest'];
export const EXPAND_BONUS = 0.2;
/** Why tile `idx` cannot be bought as an expansion of building `b` (null = it can). */
export function expansionIssue(s: TileCtx & { lots: Record<string, Lot>; vacant?: { idx: number }[]; buildings?: Record<string, { idx: number }> }, b: { type: string; idx: number; expand?: number[] }, idx: number): string | null {
  const w = s.world!; if (!EXPAND_TYPES.includes(b.type)) return 'This facility cannot be expanded';
  const x = idx % w.w, y = Math.floor(idx / w.w), x0 = b.idx % w.w, y0 = Math.floor(b.idx / w.w);
  if (!Number.isInteger(idx) || idx < 0 || idx >= w.tiles.length || Math.max(Math.abs(x - x0), Math.abs(y - y0)) > areaR(b.type)) return b.type === 'farm' ? 'Outside the 7×7 area' : 'Outside the 5×5 area';
  if (idx === b.idx || b.expand?.includes(idx)) return 'Already part of this facility';
  if (!TERRAIN_INFO[w.tiles[idx] as Terrain].price) return 'This terrain cannot be bought';
  if (w.tiles[idx] === 'm' && b.type !== 'quarry') return 'Only quarries can use mountains';
  if (railMap(s)?.on[idx]) return 'Railway tracks run over this tile';
  if (s.lots[lotKey(idx)]) return 'Somebody already owns this tile';
  if (s.vacant?.some(v => v.idx === idx) || (s.buildings && Object.values(s.buildings).some(o => o.idx === idx))) return 'There is a facility on this tile';
  const own = [b.idx, ...(b.expand ?? [])];
  if (!own.some(o => Math.max(Math.abs((o % w.w) - x), Math.abs(Math.floor(o / w.w) - y)) <= 1)) return 'It must touch a tile of this facility';
  return null;
}
/** Output multiplier from the surroundings: factories, shops and labs like population nearby (log scale, 0.6x-1.5x);
 *  extractive facilities get +20% per bought expansion tile of the right terrain (deposits / trees / farmland). */
export function areaInfo(s: TileCtx, b: { type: string; idx: number; expand?: number[] }): AreaInfo {
  const w = s.world!; const spec = AREA_TERRAIN[b.type];
  const x0 = b.idx % w.w, y0 = Math.floor(b.idx / w.w);
  if (spec) {
    let m = areaCache.get(w); if (!m) areaCache.set(w, m = new Map());
    const key = b.type + ':' + b.idx; let avail = m.get(key);
    if (avail === undefined) { avail = 0; const R = areaR(b.type); for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const x = x0 + dx, y = y0 + dy; if ((dx || dy) && x >= 0 && y >= 0 && x < w.w && y < w.h && spec[1].includes(w.tiles[y * w.w + x])) avail++; } m.set(key, avail); }
    const qw = (i: number) => { const q = tileQuality(s, i); return q == null ? 1 : 0.6 + 0.8 * q; }; // quality 0..1 -> x0.6..x1.4
    const exp = (b.expand ?? []).filter(i => spec[1].includes(w.tiles[i])); const owned = exp.length;
    const own = tileQuality(s, b.idx);
    return { kind: spec[0], pop: 0, count: owned, max: avail, factor: qw(b.idx) * (1 + EXPAND_BONUS * exp.reduce((n, i) => n + qw(i), 0)), quality: own ?? undefined, qualityName: QUALITY_NAME[w.tiles[b.idx]] };
  }
  let pop = 0;
  for (let dy = -AREA_R; dy <= AREA_R; dy++) for (let dx = -AREA_R; dx <= AREA_R; dx++) {
    const x = x0 + dx, y = y0 + dy; if (x < 0 || y < 0 || x >= w.w || y >= w.h) continue;
    pop += tilePop(s, y * w.w + x);
  }
  // a town hall (city centre) nearby brings shoppers: +HALL_BONUS next to it, half of that two tiles away
  let hall = 0;
  if (b.type === 'store' || b.type === 'supermarket' || b.type === 'mall') for (let dy = -AREA_R; dy <= AREA_R; dy++) for (let dx = -AREA_R; dx <= AREA_R; dx++) { const x = x0 + dx, y = y0 + dy; if (x >= 0 && y >= 0 && x < w.w && y < w.h && w.tiles[y * w.w + x] === 'h') hall = Math.max(hall, Math.max(Math.abs(dx), Math.abs(dy)) <= 1 ? HALL_BONUS : HALL_BONUS / 2); }
  const sq = b.type === 'mall' || w.tiles[b.idx] !== 's' ? null : tileQuality(s, b.idx); // shops, factories and labs in a suburb like good services
  return { kind: 'pop', hall, pop, count: 0, max: 0, factor: (1 + hall) * (b.type === 'mall' ? 1 : clamp(0.6 + 0.28 * Math.log10(1 + pop / 2000), 0.6, 1.5)) * (sq == null ? 1 : 0.8 + 0.4 * sq), quality: sq ?? undefined, qualityName: sq == null ? undefined : 'Services' };
}
// ---- construction: a facility is built out of Buildings (the product), so its price follows that product's market price
export const BUILD_UNIT = 12000;       // facility cost / this = units of Buildings it takes
export const OWN_BUILD_FACTOR = 0.35;  // building with your own Buildings factory costs this share of the market price
export interface BuildCand { id: string; owner: string; price: number; qty: number }
export interface BuildQuote { cost: number; units: number; source: 'market' | 'own' | 'other'; from?: string }
export const buildUnits = (defCost: number) => Math.max(1, Math.ceil(defCost / BUILD_UNIT));
/** Cheapest way to get the Buildings for a facility: the market, your own factory (much cheaper) or a rival's factory that sells under the market price. */
export function quoteBuild(idx: number, buyer: string, defCost: number, cands: BuildCand[]): BuildQuote {
  const base = PRODUCTS.buildings.basePrice, units = buildUnits(defCost), mkt = base * idx;
  let best: BuildQuote = { cost: Math.round(defCost * idx), units, source: 'market' };
  for (const c of cands) {
    if (c.qty < units) continue;
    const own = c.owner === buyer; const price = own ? mkt * OWN_BUILD_FACTOR : c.price; if (!own && price >= mkt) continue;
    const cost = Math.round(defCost * price / base); if (cost < best.cost) best = { cost, units, source: own ? 'own' : 'other', from: c.id };
  }
  return best;
}
export function buildCands(s: GameState): BuildCand[] {
  return Object.values(s.buildings).filter(b => b.type === 'factory' && b.product === 'buildings' && !b.building && b.stock.qty >= 1)
    .map(b => ({ id: b.id, owner: b.owner, price: b.listPrice ?? Infinity, qty: Math.floor(b.stock.qty) }));
}
const trCache = new WeakMap<object, Uint8Array>();
/** 0-100: how easily goods can reach a tile — roads, city streets, docks and (a bonus) railways within a few tiles. */
export function transportMap(s: TileCtx): Uint8Array {
  const w = s.world!; let m = trCache.get(w); if (m) return m; const W = w.w, H = w.h; m = new Uint8Array(W * H);
  const src: Record<string, number> = { r: 70, u: 80, s: 62, p: 85 }; const R = 4;
  for (let i = 0; i < w.tiles.length; i++) { const v = src[w.tiles[i]]; if (!v) continue; const x = i % W, y = (i / W) | 0;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const val = v - 14 * Math.max(Math.abs(dx), Math.abs(dy)); if (val > m[yy * W + xx]) m[yy * W + xx] = val; } }
  const rm = railMap(s); if (rm) for (let i = 0; i < m.length; i++) if (rm.comp[i] >= 0) m[i] = Math.min(100, m[i] + 25);
  for (let i = 0; i < m.length; i++) if ('ad'.includes(w.tiles[i])) m[i] = 0;
  trCache.set(w, m); return m;
}
export const tileTransport = (s: TileCtx, idx: number): number => transportMap(s)[idx];
export const railComp = (s: Parameters<typeof railMap>[0], idx: number): number => railMap(s)?.comp[idx] ?? -1;
export const cityTile = (s: { world?: { w: number } }, c: { x: number; y: number }) => Math.floor(c.y / WORLD_SCALE) * (s.world?.w ?? WORLD_W) + Math.floor(c.x / WORLD_SCALE);
/** True when both tiles sit on the same rail network. */
export const railLink = (s: Parameters<typeof railMap>[0], a: number, b: number): boolean => { const x = railComp(s, a); return x >= 0 && x === railComp(s, b); };
const buyerTile = (b: Building) => b.idx;

// ---- factory layout
export interface ModStats { lines: number; robots: number; warehouse: number; imports: number; brand: number; rd: number; qa: number; idle: number[] }
/** Side of a factory's cell grid by the tile it stands on: urban 2x2, suburb 3x3, anything else 4x4. */
export const gridFor = (terrain: string): number => terrain === 'u' || terrain === 'l' ? 2 : terrain === 's' || terrain === 'w' ? 3 : 4;
export const gridN = (b: { layout?: unknown[]; grid?: number }): number => b.grid ?? Math.round(Math.sqrt(b.layout?.length ?? FAC_GRID * FAC_GRID));
export const adj4 = (i: number, n: number): number[] => {
  const x = i % n, y = Math.floor(i / n), out: number[] = [];
  if (x > 0) out.push(i - 1); if (x < n - 1) out.push(i + 1); if (y > 0) out.push(i - n); if (y < n - 1) out.push(i + n);
  return out;
};
export const adj8 = (i: number, n: number): number[] => {
  const x = i % n, y = Math.floor(i / n), out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < n && ny < n) out.push(ny * n + nx); }
  return out;
};
export const linkKey = (a: number, b: number) => (a < b ? a + '-' + b : b + '-' + a);
/** Facility layout links are arrows: "i>j" = goods flow from cell i to cell j (import/line/warehouse -> line/warehouse/export, and export -> warehouse). Support modules (robot, QA, branding, R&D)
 *  connect to a line with a plain undirected link "i-j". */
export const flowKey = (from: number, to: number) => from + '>' + to;
export const linkEnds = (k: string): [number, number] => { const [x, y] = k.split(/[->]/).map(Number); return [x, y]; };
export const SUPPORT_MODS = ['robot', 'qa', 'brand', 'rd'];
const FLOW_FROM = ['import', 'line', 'warehouse'], FLOW_TO = ['line', 'warehouse', 'export'];
export const canFlow = (from: string | null, to: string | null): boolean => !!from && !!to && ((FLOW_FROM.includes(from) && FLOW_TO.includes(to)) || (from === 'export' && to === 'warehouse'));
/** The natural direction for a new link between cells a and b (used when a client just says "link them"). */
function autoDir(L: LayoutCell[], a: number, b: number, bd: Building): 'ab' | 'ba' | 'plain' {
  const ma = L[a].m, mb = L[b].m, f1 = canFlow(ma, mb), f2 = canFlow(mb, ma);
  if (!f1 && !f2) return 'plain'; if (f1 && !f2) return 'ab'; if (f2 && !f1) return 'ba';
  if (ma === 'line' && mb === 'line') return PRODUCTS[L[b].product ?? bd.product!]?.recipe[L[a].product as ProductId] ? 'ab' : 'ba'; // the line that makes an ingredient feeds the other
  if (ma === 'line' && mb === 'warehouse') return L[a].product === bd.product ? 'ab' : 'ba';
  if (ma === 'warehouse' && mb === 'line') return L[b].product === bd.product ? 'ba' : 'ab';
  return 'ab';
}
export const flowsTo = (b: Building, i: number, j: number) => !!b.links?.includes(flowKey(i, j));
/** Connected in any way (an arrow either way, or a plain support link). */
export const isLinked = (b: Building, i: number, j: number) => !!b.links && (b.links.includes(linkKey(i, j)) || b.links.includes(flowKey(i, j)) || b.links.includes(flowKey(j, i)));
export const incoming = (b: Building, i: number): number[] => adj8(i, gridN(b)).filter(j => flowsTo(b, j, i));
export const outgoing = (b: Building, i: number): number[] => adj8(i, gridN(b)).filter(j => flowsTo(b, i, j));

/** Workers a facility cell needs to run at full strength. */
const MODULE_WORKERS: Record<ModuleType, number> = { line: 0, robot: 1, warehouse: 1, import: 1, brand: 2, rd: 3, qa: 1, export: 1 };
export const linkable = (x: string | null, y: string | null): boolean => canFlow(x, y) || canFlow(y, x) || (x === 'line' && SUPPORT_MODS.includes(y ?? '')) || (y === 'line' && SUPPORT_MODS.includes(x ?? ''));
const placedRobots = (b: Building) => (b.layout ?? []).reduce((n, c, i) => n + (c.m === 'robot' && adj8(i, gridN(b)).some(j => b.layout![j].m === 'line' && isLinked(b, i, j)) ? 1 : 0), 0);
export function cellNeed(b: Building, i: number): number {
  const c = b.layout?.[i]; if (!c || !c.m) return 0;
  if (c.m === 'line') return Math.max(1, Math.ceil(PRODUCTS[c.product ?? b.product!].workers * (1 - 0.08 * placedRobots(b))));
  return MODULE_WORKERS[c.m];
}
/** Strength of a crew: w/need below the requirement; above it each extra worker adds OVERSTAFF_BONUS (max 1 + (CAP-1)*BONUS). */
export const staffFactor = (w: number, need: number): number => !need ? 1 : w <= need ? w / need : 1 + (Math.min(w, need * OVERSTAFF_CAP) - need) / need * OVERSTAFF_BONUS;
/** Most workers a headcount `need` may hold. */
export const staffCap = (need: number): number => Math.ceil(need * OVERSTAFF_CAP);
/** How much a warehouse can hold of its one product. */
/** Quality effort of a production line (50-150%, 100 = normal): each 10 points above normal gives +3 quality but takes 2.5% more ingredients per unit
 *  and slows the line 2.5%; below normal it saves ingredients and runs faster, at lower quality. */
export const EFFORT_MIN = 50, EFFORT_MAX = 150;
export const effortFx = (e = 100) => ({ q: 0.3 * (e - 100), inputs: 0.75 + 0.25 * e / 100, speed: 1.25 - 0.25 * e / 100 });
/** What a production line can make in a month at full efficiency: line capacity x robots x crew x quality-effort speed x its output limit. */
export const lineCap = (b: Building, i: number): number => { const c = b.layout?.[i]; if (c?.m !== 'line' || !c.product) return 0; return PRODUCTS[c.product].cap * (1 + 0.06 * b.auto) * staffRatio(b, i) * effortFx(c.effort).speed * (c.rate ?? 100) / 100; };
/** Base room for finished goods in a building (warehouses linked to the final line add their own capacity on top). */
export const baseStorage = (b: Building) => PRODUCTS[b.product!].cap * b.lines * 2.5;
/** An import cell keeps a small buffer of what it bought ahead (a warehouse holds 40 times as much). */
export const impCap = (b: Building, i: number): number => { const c = b.layout?.[i]; return c?.m === 'import' && c.product ? PRODUCTS[c.product].cap * 0.5 * Math.max(1, b.lines) * staffRatio(b, i) : 0; };
export const whCap = (b: Building, i: number): number => { const c = b.layout?.[i]; return c?.m === 'warehouse' && c.product ? PRODUCTS[c.product].cap * 20 * Math.max(1, b.lines) * staffRatio(b, i) : 0; };
/** How much an export cell can hold of its one product. */
export const exportCap = (b: Building, i: number): number => { const c = b.layout?.[i]; return c?.m === 'export' && c.product ? PRODUCTS[c.product].cap * 2 * Math.max(1, b.lines) * staffRatio(b, i) : 0; };
/** 0..1.5: how well a cell is staffed. */
export const staffRatio = (b: Building, i: number): number => staffFactor(b.layout![i].workers ?? 0, cellNeed(b, i));

export function moduleStats(b: Building): ModStats & { final: number } {
  const st = { lines: 0, final: 0, robots: 0, warehouse: 0, imports: 0, brand: 0, rd: 0, qa: 0, idle: [] as number[] };
  const L = b.layout; if (!L) return st;
  const linkedTo = (i: number, f: (j: number) => boolean) => adj8(i, gridN(b)).some(j => isLinked(b, i, j) && L[j].m && f(j));
  const toLine = (i: number) => linkedTo(i, j => L[j].m === 'line');
  L.forEach((cell, i) => {
    const m = cell.m; if (!m) return; const r = staffRatio(b, i); // module effects are scaled by how well the cell is staffed
    if (m === 'line') { st.lines++; if (cell.product === b.product) st.final++; }
    else if (m === 'import') st.imports++;
    else if (m === 'export') { if (!incoming(b, i).some(j => L[j].m)) st.idle.push(i); }
    else if (m === 'warehouse') { if (incoming(b, i).some(j => L[j].m === 'line' && L[j].product === b.product)) st.warehouse += r; else if (!incoming(b, i).some(j => L[j].m) && !outgoing(b, i).some(j => L[j].m)) st.idle.push(i); }
    else if (!toLine(i)) st.idle.push(i); // robots, QA, branding and R&D only work when linked to a production line
    else if (m === 'brand') st.brand += r;
    else if (m === 'rd') st.rd += r;
    else if (m === 'robot') st.robots += r;
    else if (m === 'qa') st.qa += r;
  });
  return st;
}
/** Products a cell could handle judging by its arrows: an import cell = the inputs that the lines it feeds still need; a warehouse or export cell = what flows into it. */
export function cellCandidates(b: Building, i: number): ProductId[] {
  const L = b.layout!; const c = L[i]; const out = new Set<ProductId>();
  if (c.m === 'import') {
    for (const l of outgoing(b, i)) { if (L[l].m !== 'line' || !L[l].product) continue;
      const have = new Set<ProductId>(); for (const j of incoming(b, l)) if (j !== i && L[j].product && ['import', 'line', 'warehouse'].includes(L[j].m ?? '')) have.add(L[j].product!);
      for (const Y of Object.keys(PRODUCTS[L[l].product!].recipe) as ProductId[]) if (!have.has(Y)) out.add(Y); }
  } else if (c.m === 'warehouse' || c.m === 'export') {
    for (const j of incoming(b, i)) { const p = L[j].product; if (p) out.add(p); }
  }
  return [...out];
}
/** Cells without a manual product take the one their links imply, when there is exactly one option. */
function inferProducts(b: Building) {
  const L = b.layout!;
  const apply = (i: number) => {
    const c = L[i]; const cands = cellCandidates(b, i);
    if (c.m === 'warehouse' && c.product && !cands.includes(c.product) && !(c.stock && c.stock.qty > 0.5)) c.auto = true; // a warehouse only holds what its links bring: an empty one whose links changed is re-assigned
    if (c.product && !c.auto) return;
    const np = cands.length === 1 ? cands[0] : c.auto && c.product && cands.includes(c.product) ? c.product : undefined;
    if (np !== c.product) { if (c.m === 'import') c.source = ''; c.stock = undefined; }
    c.product = np; c.auto = true;
  };
  L.forEach((c, i) => { if (c.m === 'import') apply(i); });
  for (let pass = 0; pass < 4; pass++) L.forEach((c, i) => { if (c.m === 'warehouse' || c.m === 'export') apply(i); }); // warehouses can feed warehouses: let the product travel down the chain
}
export function syncLayout(b: Building) {
  if (b.type !== 'factory' || !b.layout) return;
  b.links = (b.links ?? []).filter(k => { const [x, y] = linkEnds(k); return b.layout![x]?.m && b.layout![y]?.m; });
  inferProducts(b);
  const st = moduleStats(b); b.lines = Math.max(1, st.final); b.auto = Math.round(st.robots * 100) / 100;
  b.links = (b.links ?? []).filter(k => { const [x, y] = linkEnds(k); return b.layout![x]?.m && b.layout![y]?.m; });
  b.workers = b.layout.reduce((n, c) => n + (c.m ? (c.workers ?? 0) : 0), 0);
}
/** Spread `total` workers over the cells: lines first, then the other cells, each up to its need. */
function distributeWorkers(b: Building, total: number) {
  const L = b.layout!; let left = total;
  for (const c of L) c.workers = 0;
  const order = L.map((c, i) => i).filter(i => L[i].m).sort((p, q) => (L[p].m === 'line' ? 0 : 1) - (L[q].m === 'line' ? 0 : 1) || p - q);
  for (const i of order) { const w = Math.min(left, cellNeed(b, i)); L[i].workers = w; left -= w; }
  for (const i of order) { const w = Math.min(left, staffCap(cellNeed(b, i)) - (L[i].workers ?? 0)); L[i].workers = (L[i].workers ?? 0) + w; left -= w; } // extra crew above the requirement
  syncLayout(b);
}
function removeWorkers(b: Building, n: number) {
  const L = b.layout!;
  for (let k = 0; k < n; k++) { let bi = -1, bw = 0; L.forEach((c, i) => { if (c.m && (c.workers ?? 0) > bw) { bw = c.workers!; bi = i; } }); if (bi < 0) break; L[bi].workers!--; }
  syncLayout(b);
}
/** Default wiring: a line in the middle making the product, one import cell per recipe input, all linked to the line. */
export function ensureLayout(b: Building) {
  const n = gridN(b);
  if (b.type !== 'factory' || (b.layout && b.layout.length === n * n)) return;
  const L: LayoutCell[] = Array.from({ length: n * n }, () => ({ m: null }));
  const center = n === 2 ? 0 : n === 3 ? 4 : 5; b.links = [];
  L[center] = { m: 'line', product: b.product! };
  const inputs = Object.keys(PRODUCTS[b.product!].recipe) as ProductId[];
  const ring = [...adj4(center, n), ...adj8(center, n).filter(j => !adj4(center, n).includes(j))]; // straight neighbours first, then diagonals
  ring.forEach((cell, k) => { if (inputs[k]) { L[cell] = { m: 'import', product: inputs[k], source: '' }; b.links!.push(flowKey(cell, center)); } }); // import cells feed the line
  const exportAt = ring.find(cell => !L[cell].m); // the product leaves through an export cell: without one the factory cannot sell
  if (exportAt !== undefined) { L[exportAt] = { m: 'export', product: b.product! }; b.links!.push(flowKey(center, exportAt)); }
  b.layout = L; syncLayout(b);
}
/** After retooling: line cells that made the old product make the new one; import cells are re-assigned to the new recipe inputs. */
function retoolLayout(b: Building, oldP: ProductId, newP: ProductId) {
  ensureLayout(b); const L = b.layout!;
  for (const c of L) if ((c.m === 'line' || c.m === 'export') && c.product === oldP) { c.product = newP; if (c.m === 'export') c.stock = undefined; }
  const inputs = Object.keys(PRODUCTS[newP].recipe) as ProductId[]; let k = 0;
  for (const c of L) if (c.m === 'import') { c.product = inputs[k++]; c.source = ''; }
  for (const c of L) if (c.m === 'warehouse') { c.product = undefined; c.stock = undefined; }
  syncLayout(b);
}
/** Problems of each layout cell that keep it from working properly (shown as a warning sign on the cell): a missing source of goods, a missing target for its goods, no crew. */
export function cellWarnings(b: Building, cities?: { port?: boolean; harbour?: HarbourGood[] }[]): Record<number, string[]> {
  const out: Record<number, string[]> = {}; if (b.type !== 'factory' || !b.layout) return out; const L = b.layout; const add = (i: number, m: string) => { (out[i] ??= []).push(m); };
  const leadsToExport = (i: number, seen = new Set<number>()): boolean => { if (seen.has(i)) return false; seen.add(i); return outgoing(b, i).some(j => L[j].m === 'export' || (L[j].m === 'warehouse' && leadsToExport(j, seen))); };
  L.forEach((c, i) => {
    if (!c.m) return; const inn = incoming(b, i).filter(j => L[j].m), outs = outgoing(b, i).filter(j => L[j].m);
    if (c.m !== 'line' && c.m !== 'import' && SUPPORT_MODS.indexOf(c.m) < 0 && !c.product) add(i, 'holds no product: draw an arrow into it');
    if (cellNeed(b, i) > 0 && (c.workers ?? 0) === 0) add(i, 'no crew');
    if (c.m === 'import') {
      if (!c.product) add(i, 'no product: draw an arrow from it to a line that needs something');
      else if (!c.source) add(i, 'no source of ' + PRODUCTS[c.product].name + ': pick one');
      else if (cities && c.source.startsWith('harbour:') && !harbourStocks(cities, c.source, c.product)) add(i, 'the harbour no longer stocks ' + PRODUCTS[c.product].name);
      if (!outs.length) add(i, 'no target: nothing receives what it buys');
    } else if (c.m === 'line') {
      if (!c.product) { add(i, 'makes nothing: pick a product'); return; }
      for (const Y of Object.keys(PRODUCTS[c.product].recipe) as ProductId[]) if (!inn.some(j => L[j].product === Y && (L[j].m !== 'import' || !!L[j].source))) add(i, 'no source of ' + PRODUCTS[Y].name + ': draw an arrow into it');
      if (c.product === b.product) { if (!L.some((x, k) => x.m === 'line' && x.product === b.product && leadsToExport(k))) add(i, 'no way to sell: draw an arrow to an export cell'); } // every final line adds to the finished stock; one arrow into an export cell is enough
      else if (!outs.some(j => L[j].m === 'warehouse' || L[j].m === 'export' || (L[j].m === 'line' && !!L[j].product && !!PRODUCTS[L[j].product!].recipe[c.product!]))) add(i, 'no target: nothing uses ' + PRODUCTS[c.product].name);
    } else if (c.m === 'warehouse') {
      if (!inn.length) add(i, 'no source: nothing flows into it'); else if (c.product && !inn.some(j => L[j].product === c.product)) add(i, 'no incoming arrow brings ' + PRODUCTS[c.product].name);
      if (!outs.length) add(i, 'no target: it only fills up');
    } else if (c.m === 'export') {
      if (!inn.length) add(i, 'no source: nothing flows into it'); else if (c.product && !inn.some(j => L[j].product === c.product)) add(i, 'no incoming arrow brings ' + PRODUCTS[c.product].name);
    } else if (!inn.length && !adj8(i, gridN(b)).some(j => L[j].m === 'line' && isLinked(b, i, j))) add(i, 'not linked to a production line');
  });
  return out;
}
export function layoutIssues(b: Building, cities?: { port?: boolean; harbour?: HarbourGood[] }[]): string[] {
  if (b.type !== 'factory') return []; ensureLayout(b); const L = b.layout!, out: string[] = [];
  const lines = L.map((c, i) => (c.m === 'line' ? i : -1)).filter(i => i >= 0);
  if (!lines.some(i => L[i].product === b.product)) out.push('No production line makes ' + PRODUCTS[b.product!].name);
  if (!L.some(c => c.m === 'export' && c.product === b.product)) out.push('No export cell for ' + PRODUCTS[b.product!].name + ': the factory cannot sell it (add one and draw an arrow from the line into it)');
  for (const i of lines) {
    const X = L[i].product; if (!X) { out.push('A production line has no product'); continue; }
    for (const Y of Object.keys(PRODUCTS[X].recipe) as ProductId[]) {
      const ok = incoming(b, i).some(j => (L[j].m === 'import' && L[j].product === Y && !!L[j].source && (!cities || !L[j].source!.startsWith('harbour:') || !!harbourStocks(cities, L[j].source!, Y))) || (L[j].m === 'line' && L[j].product === Y) || (L[j].m === 'warehouse' && L[j].product === Y));
      if (!ok) out.push(PRODUCTS[X].name + ' line: no arrow brings ' + PRODUCTS[Y].name);
    }
  }
  L.forEach((c, i) => { if (c.m !== 'warehouse' && c.m !== 'export') return; const inn = incoming(b, i).filter(j => L[j].m); const what = c.m === 'warehouse' ? 'Warehouse' : 'Export cell'; if (!inn.length) { out.push(what + ' #' + (i + 1) + ': no arrow flows into it'); return; } if (!c.product) { out.push(what + ' #' + (i + 1) + ' holds no product (pick one)'); return; } if (!inn.some(j => L[j].product === c.product)) out.push(what + ' #' + (i + 1) + ' holds ' + PRODUCTS[c.product].name + ' but no incoming arrow brings it'); });

  for (const c of L) if (c.m === 'import') { if (!c.product) out.push('An import cell has no product'); else if (!c.source) out.push('Import cell for ' + PRODUCTS[c.product].name + ' has no source'); else if (cities && c.source.startsWith('harbour:') && !harbourStocks(cities, c.source, c.product)) out.push('The harbour no longer stocks ' + PRODUCTS[c.product].name + ' (pick another source)'); }
  return out;
}
const factoryExtra = (b: Building) => b.type === 'factory' ? moduleStats(b) : null;

export function requiredWorkers(b: Building): number {
  if (b.type === 'rd') return Math.max(1, b.workers);
  if (b.type === 'mall') return 0;
  if (b.type === 'store') return b.super ? 6 + b.size * 4 : 2 + b.size * 2;
  if (b.type === 'factory' && b.layout) return Math.max(1, b.layout.reduce((n, c, i) => n + cellNeed(b, i), 0));
  const def = PRODUCTS[b.product ?? 'grain'];
  return Math.max(1, Math.ceil(def.workers * b.lines * (1 - 0.08 * b.auto)));
}
export function capacity(b: Building): number {
  if (!b.product || b.type === 'store' || b.type === 'rd') return 0;
  return PRODUCTS[b.product].cap * b.lines * (1 + 0.06 * b.auto);
}
export function slotCapacity(b: Building, p: ProductId): number { return Math.round((PRODUCTS[p].demandPerK ?? 1) * 60 * b.size); }
function moraleFactor(s: GameState, b: Building) { return clamp(0.55 + 0.45 * (b.wage / cityWage(s, b.city)), 0.55, 1.08); }
export function efficiency(s: GameState, b: Building): number {
  const staff = b.type === 'factory' && b.layout ? 1 : staffFactor(b.workers, requiredWorkers(b));
  return staff * moraleFactor(s, b) * (0.6 + 0.4 * b.condition / 100) * (1 + mgrBonus(s, b).eff) * areaInfo(s, b).factor;
}
function seasonFactor(s: GameState, b: Building): number {
  let f = 1;
  if (b.type === 'farm' && b.product === 'grain') f *= [0.2, 0.2, 0.5, 0.9, 1.2, 1.4, 1.5, 1.5, 1.4, 1.0, 0.4, 0.2][s.turn % 12] * 1.0;
  for (const e of s.effects) if (e.kind === 'drought' && b.product === 'grain') f *= e.value;
  return f;
}
export function companyBuildings(s: GameState, cid: string): Building[] { return Object.values(s.buildings).filter(b => b.owner === cid); }
// ---- stock market
export const TOTAL_SHARES = 1_000_000, SHARE_SPREAD = 0.01, SHARE_IMPACT = 0.25, MIN_OWN = 0.51;
export function ensureEquity(c: Company) {
  c.shares ??= TOTAL_SHARES; c.float ??= 0; c.price ??= 1; c.priceHist ??= [c.price]; c.portfolio ??= {}; c.policy ??= { dividend: 0, invest: 0, target: 'facilities' };
}
export const heldTotal = (s: GameState, c: Company): number => s.companies.reduce((n, o) => n + (o.portfolio?.[c.id] ?? 0), 0);
export const treasury = (s: GameState, c: Company): number => (c.shares ?? TOTAL_SHARES) - (c.float ?? 0) - heldTotal(s, c);
export const portfolioValue = (s: GameState, c: Company): number => Object.entries(c.portfolio ?? {}).reduce((n, [id, q]) => { const o = s.companies.find(x => x.id === id); return n + (o && !o.bankrupt ? q * (o.price ?? 1) : 0); }, 0);
/** Holding more than half of a company's shares means controlling it: the controlled company is merged into the holder (and its owner loses). */
export const CONTROL = 0.5;
export function mergeCompany(s: GameState, acq: Company, tgt: Company) {
  ensureEquity(acq); ensureEquity(tgt);
  // other investors in the target are cashed out at the market price (paid from the target's own cash, which the acquirer inherits)
  for (const o of s.companies) { const q = o.portfolio?.[tgt.id] ?? 0; if (q <= 0) continue; delete o.portfolio![tgt.id]; if (o.id === acq.id) continue; const amt = Math.round(q * tgt.price!); o.cash += amt; tgt.cash -= amt; o.news.push({ turn: s.turn, text: `${acq.name} took over ${tgt.name}: your ${Math.floor(q).toLocaleString('en-US')} shares were bought out for ${fmtMoney(amt)}.` }); }
  acq.cash += tgt.cash; acq.debt += tgt.debt; acq.loans = [...(acq.loans ?? []), ...(tgt.loans ?? [])]; acq.staff = [...(acq.staff ?? []), ...(tgt.staff ?? [])];
  for (const [id, q] of Object.entries(tgt.portfolio ?? {})) if (id !== acq.id && id !== tgt.id) acq.portfolio![id] = (acq.portfolio![id] ?? 0) + q;
  for (const k of Object.keys(tgt.tech ?? {}) as ProductId[]) acq.tech[k] = Math.max(acq.tech[k] ?? 0, tgt.tech[k] ?? 0);
  for (const k of Object.keys(tgt.brand ?? {}) as ProductId[]) acq.brand[k] = Math.max(acq.brand[k] ?? 0, tgt.brand[k] ?? 0);
  for (const [k, v] of Object.entries(tgt.research ?? {})) { acq.research ??= {}; acq.research[k as ProductId] = (acq.research[k as ProductId] ?? 0) + (v ?? 0); }
  let moved = 0; for (const b of Object.values(s.buildings)) if (b.owner === tgt.id) { b.owner = acq.id; moved++; }
  for (const l of Object.values(s.lots)) if (l.owner === tgt.id) l.owner = acq.id;
  for (const ad of s.adContracts ?? []) if (ad.owner === tgt.id) ad.owner = acq.id;
  tgt.cash = 0; tgt.debt = 0; tgt.loans = []; tgt.staff = []; tgt.portfolio = {}; tgt.float = 0; tgt.bankrupt = true; tgt.mergedInto = acq.id;
  const nw = netWorth(s, acq);
  s.news.push({ turn: s.turn, text: `${acq.name} now controls more than half of ${tgt.name} and merged it into its group (${moved} facilities).`, kind: 'info' });
  acq.news.push({ turn: s.turn, text: `You hold more than half of ${tgt.name}: it was merged into your company (${moved} facilities, net worth now ${fmtMoney(nw)}).` });
  tgt.news.push({ turn: s.turn, text: `${acq.name} bought more than half of your shares and took over your company. You lost.` });
}
/** Merge `t` into whoever holds a controlling stake of it (called after share trades). */
export function checkTakeover(s: GameState, t: Company): boolean {
  if (t.bankrupt) return false;
  for (const o of s.companies) if (o.id !== t.id && !o.bankrupt && (o.portfolio?.[t.id] ?? 0) > CONTROL * (t.shares ?? TOTAL_SHARES)) { mergeCompany(s, o, t); return true; }
  return false;
}
/** Net worth attributable to the company's own owners, plus the shares it holds in others. */
export function netWorth(s: GameState, c: Company): number {
  const eq = equity(s, c); const own = eq > 0 ? eq * treasury(s, c) / (c.shares ?? TOTAL_SHARES) : eq;
  return Math.round(own + portfolioValue(s, c));
}
/** Book value of the company: cash + assets - debt (before sharing it with outside shareholders). */
export function equity(s: GameState, c: Company): number {
  let v = c.cash - c.debt;
  for (const b of Object.values(s.buildings)) {
    if (b.owner !== c.id) continue;
    v += b.invested * (0.6 + 0.4 * b.condition / 100);
    const stockV = (st: Stock | undefined, p: ProductId | null) => st && p ? st.qty * PRODUCTS[p].basePrice * 0.8 : 0;
    v += stockV(b.stock, b.product);
    for (const [p, st] of Object.entries(b.inputs)) v += stockV(st, p as ProductId);
    for (const sl of b.slots) v += stockV(sl.stock, sl.product);
  }
  for (const l of Object.values(s.lots)) if (l.owner === c.id) v += l.paid * 0.9;
  return Math.round(v);
}
export const MAX_LOANS = 8;
export const pledgedTo = (c: Company, bid: string): Loan | undefined => (c.loans ?? []).find(l => l.collateral.includes(bid));
/** What a lender would accept as security for a building. */
export const collateralValue = (b: Building): number => Math.round(b.invested * (0.6 + 0.4 * b.condition / 100));
/** The credit a lender offers right now: its limit (grows with the pledged collateral), minimum, and the monthly rate. */
export function loanOffer(s: GameState, c: Company, l: Lender, collateral: string[] = []) {
  const pledged = collateral.reduce((n, id) => n + (s.buildings[id] ? collateralValue(s.buildings[id]) : 0), 0);
  const secured = collateral.length > 0 && l.collateral !== 'none'; const scale = s.interest / 0.006;
  const unsecured = l.collateral === 'required' ? 0 : l.base + l.nwFrac * Math.max(0, netWorth(s, c) + c.debt);
  const owed = (c.loans ?? []).filter(x => x.lender === l.id).reduce((n, x) => n + x.principal, 0);
  const total = Math.max(0, maxDebt(s, c) + 0.7 * pledged - c.debt);
  const max = Math.max(0, Math.floor(Math.min(unsecured + (secured ? l.ltv * pledged : 0) - owed, total) / 1000) * 1000);
  return { max, min: l.min, rate: (secured ? l.securedRate : l.rate) * scale, secured, pledged };
}
/** What a contract costs next month: interest plus the principal that falls due. */
export function loanDue(L: Loan) {
  const last = L.elapsed + 1 >= L.term;
  const principal = Math.min(L.principal, last ? L.principal : L.type === 'amortizing' ? L.installment : 0);
  return { interest: Math.round(L.principal * L.rate * (L.defaulted ? 2 : 1)), principal };
}
export const maxDebt = (s: GameState, c: Company) => Math.max(0, Math.round((300_000 + 0.6 * Math.max(0, netWorth(s, c) + c.debt)) / 10000) * 10000);
export const overdraftLimit = (s: GameState, c: Company) => Math.round(150_000 + 0.2 * Math.max(0, netWorth(s, c)));

/** Where a building's goods for sale sit: a factory sells only through its export cells; other facilities sell from their stock. */
export const salePool = (b: Building, p: ProductId): Stock[] => b.type === 'factory' ? (b.layout ?? []).filter(c => c.m === 'export' && c.product === p && c.stock).map(c => c.stock!) : b.product === p ? [b.stock] : [];
export const poolQty = (pool: Stock[]) => pool.reduce((n, x) => n + x.qty, 0);
export function takePool(pool: Stock[], n: number): { qty: number; q: number } {
  let got = 0, qsum = 0; for (const st of pool) { if (got >= n - 1e-9) break; const t = Math.min(n - got, st.qty); if (t <= 0) continue; st.qty -= t; got += t; qsum += t * st.q; }
  return { qty: got, q: got > 0 ? qsum / got : 0 };
}
export function listings(s: GameState): Listing[] {
  const out: Listing[] = [];
  for (const b of Object.values(s.buildings)) if (b.product && b.listPrice != null && b.stock.qty > 0.5 && b.type !== 'store' && b.type !== 'factory')
    out.push({ building: b.id, company: b.owner, city: b.city, product: b.product, price: b.listPrice, qty: Math.floor(b.stock.qty), q: Math.round(b.stock.q) });
  for (const b of Object.values(s.buildings)) b.layout?.forEach((c, i) => { if (c.m === 'export' && c.product && c.listPrice != null && (c.stock?.qty ?? 0) > 0.5) out.push({ building: b.id + '#' + i, company: b.owner, city: b.city, product: c.product, price: c.listPrice, qty: Math.floor(c.stock!.qty), q: Math.round(c.stock!.q) }); });
  return out;
}

// ---------------------------------------------------------------- actions
type Res = { ok: true; info?: string } | { error: string };
const err = (e: string): Res => ({ error: e });
const OK: Res = { ok: true };

/** Factories on open land (not downtown / suburb) can be built with a 2x2, 3x3 or 4x4 layout: the bigger, the more expensive. */
export const GRID_COST: Record<number, number> = { 2: 0.6, 3: 0.8, 4: 1 };
/** Layout size of a new factory: downtown is always 2x2, a suburb or town lets you pick 2x2 or 3x3, open land (grass, forest) 2x2 to 4x4. */
export const gridChoice = (terrain: string, want?: number): number => terrain === 'u' || terrain === 'l' ? 2 : terrain === 's' || terrain === 'w' ? (want === 2 ? 2 : 3) : GRID_COST[want ?? 4] ? want ?? 4 : 4;
/** Price factor of a factory layout: downtown has one fixed size; in a suburb 3x3 is the base price; open land scales with the size. */
export const gridPrice = (terrain: string, grid: number): number => terrain === 'u' || terrain === 'l' ? 1 : terrain === 's' || terrain === 'w' ? GRID_COST[grid] / GRID_COST[3] : GRID_COST[grid];
function newBuilding(s: GameState, c: Company, btype: BuildingType, city: number, idx: number, product: ProductId | null, grid?: number, cost?: number): Building {
  const def = BUILDINGS[btype]; const sup = btype === 'supermarket'; const type: BuildingType = sup ? 'store' : btype;
  const cw = cityWage(s, city);
  const b: Building = {
    id: 'b' + s.nextId++, owner: c.id, type, city, idx, name: `${def.name} ${s.cities[city].name}`, product,
    lines: 1, auto: 0, size: 1, workers: 0, wage: type === 'rd' ? Math.round(cw * 1.5) : cw, maint: 100, condition: 100, target: 100,
    stock: emptyStock(), inputs: {}, sources: {}, listPrice: product && type !== 'store' && type !== 'rd' ? round2(PRODUCTS[product].basePrice * s.market[product].idx) : null,
    slots: [], invested: cost ?? def.cost, builtTurn: s.turn, report: emptyReport(),
  };
  if (type === 'factory') { b.grid = grid ?? gridChoice(s.world?.tiles[idx] ?? 'g'); ensureLayout(b); }
  if (type === 'mall') { b.rent = 10000; b.workers = 0; }
  if (sup) b.super = true;
  if (type === 'store') for (let i = 0; i < STORE_SLOTS; i++) b.slots.push({ product: null, price: 0, order: 0, source: '', stock: emptyStock(), sold: 0, revenue: 0, lost: 0 });
  return b;
}

/** New buildings / cells start with the required crew, as far as unemployed workers and cash allow. */
function fillStaff(s: GameState, cid: string, b: Building) {
  if (b.type === 'rd') return;
  if (b.type === 'factory' && b.layout) b.layout.forEach((c, i) => { if (c.m) { let n = cellNeed(b, i) - (c.workers ?? 0); const w0 = c.workers ?? 0; while (n > 0 && 'error' in applyAction(s, cid, { type: 'setCellStaff', id: b.id, cell: i, workers: w0 + n })) n--; } });
  else { let n = requiredWorkers(b) - b.workers; const w0 = b.workers; while (n > 0 && 'error' in applyAction(s, cid, { type: 'setStaff', id: b.id, workers: w0 + n, wage: b.wage })) n--; }
}
export function applyAction(s: GameState, cid: string, a: Action): Res {
  const c = s.companies.find(x => x.id === cid);
  if (!c || c.bankrupt) return err('No such company');
  if (s.finished) return err('The game is over');
  const own = (id: string) => { const b = s.buildings[id]; return b && b.owner === cid ? b : null; };
  const canPay = (amt: number) => c.cash - amt >= -overdraftLimit(s, c);
  const pay = (amt: number) => { c.cash -= amt; };
  const num = (v: unknown, lo: number, hi: number) => clamp(Number.isFinite(+(v as number)) ? +(v as number) : lo, lo, hi);

  switch (a.type) {
    case 'build': {
      const def = BUILDINGS[a.btype]; if (!def) return err('Unknown building');
      if (!s.world || !Number.isInteger(a.idx) || a.idx < 0 || a.idx >= s.world.tiles.length) return err('Bad location');
      const t = terrainAt(s, a.idx); const cityId = nearestCity(s.cities, a.idx);
      if (!def.terrain.includes(t)) return err(`${def.name} cannot be built on ${TERRAIN_INFO[t].name}`);
      if (railMap(s)?.on[a.idx]) return err('Railway tracks run over this tile');
      const k = lotKey(a.idx); const lot = s.lots[k];
      if (lot && lot.owner !== cid) return err('Lot is owned by someone else');
      if (Object.values(s.buildings).some(o => o.expand?.includes(a.idx))) return err('This tile is an expansion of one of your facilities');
      if (Object.values(s.buildings).some(b => b.idx === a.idx)) return err('Lot already built');
      if (a.btype === 'mall' && s.cities[cityId].town) return err('Malls need a city: towns are too small');
      if (a.btype === 'mall' && Object.values(s.buildings).filter(b => b.type === 'mall' && b.city === cityId).length >= MALL_PER_CITY) return err(`${s.cities[cityId].name} already has ${MALL_PER_CITY} malls`);
      if (s.vacant?.some(v => v.idx === a.idx)) return err('A ready-built facility is for sale here: buy it instead (Real estate tab)');
      let product: ProductId | null = null;
      if (def.products) { product = a.product && def.products.includes(a.product) ? a.product : def.products[0]; }
      else if (a.btype === 'factory') { if (!a.product || PRODUCTS[a.product]?.kind === 'raw' || !PRODUCTS[a.product]) return err('Choose a product to manufacture'); if (!isUnlocked(c, a.product)) return err(PRODUCTS[a.product].name + ' is hi-tech: research it with an R&D building first'); product = a.product; }
      else if (a.btype === 'rd') product = a.product && PRODUCTS[a.product] ? a.product : 'bread';
      const landCost = lot ? 0 : lotPrice(s, a.idx);
      const sub = openSubsidy(s, cityId, a.btype, product);
      const grant = sub?.reward === 'land' ? Math.round(lotPrice(s, a.idx) * sub.amount) : 0;
      const grid = a.btype === 'factory' ? gridChoice(t, a.grid) : undefined; const defCost = Math.round(def.cost * (grid ? gridPrice(t, grid) : 1));
      const quote = quoteBuild(s.market.buildings.idx, cid, defCost, buildCands(s));
      const tax = Math.round((landCost + quote.cost) * BUILD_TAX); const total = Math.max(0, landCost + quote.cost - grant) + tax; // the city's tax on the purchase and the works
      if (!canPay(total)) return err(`Not enough cash (need ${fmtMoney(total)})`);
      pay(total); c.ledger.tax += tax;
      if (quote.from) { const sb = s.buildings[quote.from]; sb.stock.qty -= quote.units;
        if (quote.source === 'other') { const sc = s.companies.find(x => x.id === sb.owner); if (sc) { sc.cash += quote.cost; sc.ledger.revenue += quote.cost; sb.report.revenue += quote.cost; sb.report.sold += quote.units; sb.report.soldCo = (sb.report.soldCo ?? 0) + quote.units;
          sc.news.push({ turn: s.turn, text: `${c.name} bought ${quote.units} Buildings from ${sb.name} for ${fmtMoney(quote.cost)} to build a ${def.name.toLowerCase()}.` }); } } }
      if (!lot) s.lots[k] = { owner: cid, paid: landCost };
      const b = newBuilding(s, c, a.btype, cityId, a.idx, product, grid, defCost);
      if (a.btype === 'store') b.slots[0].product = null;
      if (a.btype === 'supermarket') b.slots.forEach((sl, i) => { const sp = SUPER_PRODUCTS[i]; sl.product = sp; sl.price = retailRef(s, cityId, sp); sl.order = 100; });
      s.buildings[b.id] = b;
      b.building = BUILD_TURNS[a.btype];
      if (a.btype === 'mall') s.news.push({ turn: s.turn, kind: 'info', tag: 'announce', text: `${c.name} announces a shopping mall in ${s.cities[cityId].name}, opening in ${b.building} months. Units can be rented from now on.` });
      if (sub) claimSubsidy(s, c, sub, grant);
      return { ok: true, info: b.id };
    }
    case 'sellBuilding': {
      const b = own(a.id); if (!b) return err('Not your building');
      if (pledgedTo(c, b.id)) return err('This facility is pledged as collateral: repay the loan first');
      if (b.type === 'mall' && Object.values(s.buildings).some(x => x.mall === b.id)) return err('Tenants still hold leases in this mall');
      c.cash += Math.round(b.invested * 0.4);
      delete s.buildings[b.id];
      for (const o of Object.values(s.buildings)) for (const [p, src] of Object.entries(o.sources)) if (src === b.id || src.startsWith(b.id + '#')) o.sources[p as ProductId] = '';
      for (const o of Object.values(s.buildings)) for (const sl of o.slots) if (sl.source === b.id || sl.source.startsWith(b.id + '#')) sl.source = '';
      return OK;
    }
    case 'releaseLot': {
      const k = lotKey(a.idx); const lot = s.lots[k];
      if (!lot || lot.owner !== cid) return err('Not your lot');
      if (Object.values(s.buildings).some(b => b.idx === a.idx)) return err('Demolish the building first');
      for (const o of Object.values(s.buildings)) if (o.expand?.includes(a.idx)) o.expand = o.expand.filter(i => i !== a.idx);
      c.cash += Math.round(lot.paid * 0.9); delete s.lots[k]; return OK;
    }
    case 'buyExpansion': {
      const b = own(a.id); if (!b) return err('Not your building');
      const why = expansionIssue(s, b, a.idx); if (why) return err(why);
      const price = lotPrice(s, a.idx); if (!canPay(price)) return err(`Not enough cash (need ${fmtMoney(price)})`);
      pay(price); s.lots[lotKey(a.idx)] = { owner: cid, paid: price }; (b.expand ??= []).push(a.idx); return OK;
    }
    case 'setProduct': {
      const b = own(a.id); if (!b) return err('Not your building');
      const def = BUILDINGS[b.type];
      if (b.type === 'store' || b.type === 'mall') return err('Stores use shelf slots');
      if (def.products && !def.products.includes(a.product)) return err('This building cannot produce that');
      if (b.type === 'factory' && (!PRODUCTS[a.product] || PRODUCTS[a.product].kind === 'raw')) return err('Factories make manufactured goods');
      if (b.type === 'factory' && !isUnlocked(c, a.product)) return err(PRODUCTS[a.product].name + ' is hi-tech: research it first');
      if (a.product === b.product) return OK;
      if (b.type === 'factory') { const cost = Math.round(def.cost * 0.15 * b.lines); if (!canPay(cost)) return err('Cannot afford retooling'); pay(cost); b.inputs = {}; b.sources = {}; }
      const oldP = b.product; b.product = a.product; b.stock = emptyStock();
      if (b.type === 'factory' && oldP) retoolLayout(b, oldP, a.product);
      if (b.type !== 'rd') b.listPrice = round2(PRODUCTS[a.product].basePrice * s.market[a.product].idx);
      return OK;
    }
    case 'setStaff': {
      const b = own(a.id); if (!b) return err('Not your building');
      if (b.type === 'factory') ensureLayout(b);
      const w = Math.min(b.type === 'rd' ? 2000 : staffCap(requiredWorkers(b)), Math.round(num(a.workers, 0, 2000))); const wage = Math.round(num(a.wage, 500, 20000));
      const hire = Math.max(0, w - b.workers);
      const city = s.cities[b.city];
      if (hire > 0) {
        const free = laborPool(city) - laborUsed(s, b.city);
        if (hire > free) return err(`Only ${Math.max(0, free)} unemployed workers left in ${city.name}`);
        if (!canPay(hire * 800)) return err('Cannot afford hiring costs ($800 each)');
        pay(hire * 800);
      } else if (w < b.workers) pay((b.workers - w) * 1200); // severance
      if (b.type === 'factory') { ensureLayout(b); if (w !== b.workers) distributeWorkers(b, w); } else b.workers = w;
      b.wage = wage; return OK;
    }
    case 'setTarget': { const b = own(a.id); if (!b) return err('Not your building'); b.target = Math.round(num(a.pct, 0, 100)); return OK; }
    case 'setMaint': { const b = own(a.id); if (!b) return err('Not your building'); b.maint = Math.round(num(a.pct, 0, 200)); return OK; }
    case 'setWorldSell': {
      const b = own(a.id); if (!b || b.type === 'store' || b.type === 'rd' || b.type === 'mall') return err('This building has nothing to sell');
      if (a.cell !== undefined) { ensureLayout(b); const cl = b.layout?.[a.cell]; if (!cl || cl.m !== 'export') return err('Only export cells can sell to the world market'); cl.world = !!a.on; }
      else b.world = !!a.on;
      return OK;
    }
    case 'setListPrice': {
      const b = own(a.id); if (!b) return err('Not your building');
      if (a.price == null) b.listPrice = null; else b.listPrice = round2(num(a.price, 0.01, 1e7));
      return OK;
    }
    case 'setSource': { // only the operating supplies of non-factory facilities (a farm's fuel); factories choose sources on their import cells
      const b = own(a.id); if (!b) return err('Not your building'); if (b.type === 'factory') return err('Choose the source on the import cells of the factory layout');
      if (!SUPPLIES[b.type]?.[a.product]) return err('This facility does not use ' + (PRODUCTS[a.product]?.name ?? 'that'));
      if (a.source && a.source !== 'market') { const e = sourceError(s, cid, a.product, a.source); if (e) return err(e); } b.sources[a.product] = a.source; return OK;
    }
    case 'setModule': {
      const b = own(a.id); if (!b || b.type !== 'factory') return err('Only factories have a facility layout');
      ensureLayout(b); const L = b.layout!;
      if (!Number.isInteger(a.cell) || a.cell < 0 || a.cell >= L.length) return err('Bad cell');
      const old = L[a.cell].m;
      if (a.module === old) return OK;
      if (a.module) {
        const md = MODULES[a.module]; if (!md) return err('Unknown module');
        const count = L.filter(x => x.m === a.module).length;
        if (count >= md.max) return err('At most ' + md.max + ' x ' + md.name);
        if (!canPay(md.cost - (old ? Math.round(MODULES[old].cost * 0.4) : 0))) return err('Need ' + fmtMoney(md.cost));
      }
      if (old === 'line' && L[a.cell].product === b.product && L.filter(x => x.m === 'line' && x.product === b.product).length <= 1) return err('Keep at least one line making ' + PRODUCTS[b.product!].name);
      if (old) { const refund = Math.round(MODULES[old].cost * 0.4); c.cash += refund; b.invested = Math.max(0, b.invested - MODULES[old].cost); }
      if (a.module) { pay(MODULES[a.module].cost); b.invested += MODULES[a.module].cost; }
      L[a.cell] = a.module ? { m: a.module, product: a.module === 'line' ? b.product! : undefined, source: '' } : { m: null };
      b.links = (b.links ?? []).filter(k => !linkEnds(k).includes(a.cell)); // a changed cell loses its connections
      syncLayout(b); fillStaff(s, cid, b); return OK;
    }
    case 'setCell': {
      const b = own(a.id); if (!b || b.type !== 'factory') return err('Only factories have a facility layout');
      ensureLayout(b); const L = b.layout!;
      if (!Number.isInteger(a.cell) || a.cell < 0 || a.cell >= L.length) return err('Bad cell');
      const cell = L[a.cell];
      if (a.discard) { if (cell.m !== 'warehouse' && cell.m !== 'import' && cell.m !== 'export') return err('Only storage cells hold stock'); cell.stock = emptyStock(); return OK; } // throw the stock away
      if (cell.m === 'line') {
        if (a.product !== undefined) {
          if (!a.product || !PRODUCTS[a.product] || PRODUCTS[a.product].kind === 'raw') return err('Production lines manufacture goods, not raw materials');
          if (!isUnlocked(c, a.product)) return err(PRODUCTS[a.product].name + ' is hi-tech: research it first');
          cell.product = a.product;
        }
        if (a.rate !== undefined) cell.rate = clamp(Math.round(num(a.rate, 0, 100) / 5) * 5, 0, 100);
        if (a.effort !== undefined) cell.effort = clamp(Math.round(num(a.effort, EFFORT_MIN, EFFORT_MAX) / 5) * 5, EFFORT_MIN, EFFORT_MAX);
      } else if (cell.m === 'export') {
        if (a.product !== undefined) { if (a.product && !PRODUCTS[a.product]) return err('Unknown product'); if (a.product !== cell.product) cell.stock = undefined; cell.product = a.product ?? undefined; cell.auto = a.product == null; }
        if (a.price !== undefined) cell.listPrice = a.price == null ? null : Math.max(0.01, round2(num(a.price, 0.01, 1e6)));
      } else if (cell.m === 'warehouse') {
        if (a.product !== undefined) { if (a.product && !PRODUCTS[a.product]) return err('Unknown product'); if (a.product && !cellCandidates(b, a.cell).includes(a.product)) return err('A warehouse only stores what its links bring: link it to an import cell or to the line that makes ' + PRODUCTS[a.product].name); if (a.product !== cell.product) cell.stock = undefined; cell.product = a.product ?? undefined; cell.auto = a.product == null; }
      } else if (cell.m === 'import') {
        if (a.product !== undefined) { if (a.product && !PRODUCTS[a.product]) return err('Unknown product'); if (a.product !== cell.product) cell.source = ''; cell.product = a.product ?? undefined; cell.auto = a.product == null; }
        if (a.source !== undefined) {
          if (!cell.product) return err('Choose the product to import first');
          if (a.source !== cell.source) { const e = sourceError(s, cid, cell.product, a.source); if (e) return err(e); }
          cell.source = a.source;
        }
      } else return err('This cell has nothing to configure');
      syncLayout(b); return OK;
    }
    case 'setCellStaff': {
      const b = own(a.id); if (!b || b.type !== 'factory') return err('Only factories have facility cells');
      ensureLayout(b); const L = b.layout!;
      if (!Number.isInteger(a.cell) || !L[a.cell] || !L[a.cell].m) return err('Bad cell');
      const w = Math.min(staffCap(cellNeed(b, a.cell)), Math.round(num(a.workers, 0, 500))), old = L[a.cell].workers ?? 0, delta = w - old; const city = s.cities[b.city];
      if (delta > 0) {
        const free = laborPool(city) - laborUsed(s, b.city);
        if (delta > free) return err('Only ' + Math.max(0, free) + ' unemployed workers left in ' + city.name);
        if (!canPay(delta * 800)) return err('Cannot afford hiring costs ($800 each)');
        pay(delta * 800);
      } else if (delta < 0) pay(-delta * 1200);
      L[a.cell].workers = w; syncLayout(b); return OK;
    }
    case 'setLink': {
      const b = own(a.id); if (!b || b.type !== 'factory') return err('Only factories have a facility layout');
      ensureLayout(b); const L = b.layout!; const ai = a.a, bi = a.b;
      if (!(L[ai] && L[bi]) || !adj8(ai, gridN(b)).includes(bi)) return err('Only neighbouring cells (including diagonals) can be linked');
      if (!linkable(L[ai].m, L[bi].m)) return err('Arrows carry goods from imports, lines and warehouses into lines, warehouses and export cells (and from an export cell into a warehouse); robots, quality control, branding and R&D link to a line');
      let dir: 'ab' | 'ba' | 'plain' | 'none' = a.dir ?? (a.on ? 'auto' as never : 'none');
      if ((dir as string) === 'auto') dir = autoDir(L, ai, bi, b);
      const set = new Set(b.links ?? []); for (const k of [linkKey(ai, bi), flowKey(ai, bi), flowKey(bi, ai)]) set.delete(k);
      if (dir === 'ab') { if (!canFlow(L[ai].m, L[bi].m)) return err('Goods cannot flow that way between these cells'); set.add(flowKey(ai, bi)); }
      else if (dir === 'ba') { if (!canFlow(L[bi].m, L[ai].m)) return err('Goods cannot flow that way between these cells'); set.add(flowKey(bi, ai)); }
      else if (dir === 'plain') { if (canFlow(L[ai].m, L[bi].m) || canFlow(L[bi].m, L[ai].m)) return err('Use an arrow between these cells'); set.add(linkKey(ai, bi)); }
      b.links = [...set]; syncLayout(b); return OK;
    }
    case 'addLine': {
      const b = own(a.id); if (!b || b.type === 'store' || b.type === 'rd' || b.type === 'mall') return err('Cannot expand that');
      if (b.type === 'factory') return err('Use the facility layout to add production lines');
      if (b.lines >= MAX_LINES) return err('Maximum lines reached');
      const cost = Math.round(BUILDINGS[b.type].cost * 0.6);
      if (!canPay(cost)) return err(`Need ${fmtMoney(cost)}`); pay(cost); b.lines++; b.invested += cost; return OK;
    }
    case 'upgradeAuto': {
      const b = own(a.id); if (!b || b.type === 'store' || b.type === 'rd' || b.type === 'mall') return err('Cannot automate that');
      if (b.type === 'factory') return err('Place robotics next to a line in the facility layout');
      if (b.auto >= MAX_AUTO) return err('Fully automated');
      const cost = Math.round(BUILDINGS[b.type].cost * 0.4 * (b.auto + 1)); if (!canPay(cost)) return err(`Need ${fmtMoney(cost)}`);
      pay(cost); b.auto++; b.invested += cost; return OK;
    }
    case 'decorate': {
      const b = own(a.id); if (!b || b.type !== 'store') return err('Only stores can be decorated'); const amount = Math.round(num(a.amount, 1000, 5_000_000)); if (!canPay(amount)) return err(`Need ${fmtMoney(amount)}`);
      if ((b.decor ?? 0) >= 99.5) return err('The decoration is already at its best');
      const pts = amount / (DECOR_COST * (b.mall ? 1 : b.size)); const room = 100 - (b.decor ?? 0); const used = Math.min(pts, room); const spent = Math.round(amount * used / pts);
      pay(spent); b.decor = Math.min(100, (b.decor ?? 0) + used); b.invested += Math.round(spent * 0.5); return OK;
    }
    case 'upgradeSize': {
      const b = own(a.id); if (!b || b.type !== 'store') return err('Only stores can be enlarged'); if (b.mall) return err('Mall units cannot be enlarged');
      if (b.size >= MAX_STORE_SIZE) return err('Maximum size');
      const cost = Math.round(BUILDINGS.store.cost * 0.5 * b.size); if (!canPay(cost)) return err(`Need ${fmtMoney(cost)}`);
      pay(cost); b.size++; b.invested += cost; return OK;
    }
    case 'setSlot': {
      const b = own(a.id); if (!b || b.type !== 'store') return err('Not your store');
      const sl = b.slots[a.slot]; if (!sl) return err('Bad slot');
      if (b.mall && a.product && c.brand[a.product] < MALL_MIN_BRAND) return err('Mall units only sell branded products: build up the brand of ' + PRODUCTS[a.product].name + ' to ' + MALL_MIN_BRAND + ' first (advertising / branding studios)');
      if (a.product && PRODUCTS[a.product]?.kind !== 'consumer') return err('Stores only sell consumer goods');
      if (a.product && b.super && !SUPER_PRODUCTS.includes(a.product)) return err('A supermarket only sells dairy, bread, meat, pastry, cleaning and hygiene products');
      if (a.product && b.slots.some((o, i) => i !== a.slot && o.product === a.product)) return err('Product already on another shelf');
      if (a.product && a.source && (a.source !== sl.source || a.product !== sl.product)) { const e2 = sourceError(s, cid, a.product, a.source); if (e2) return err(e2); }
      if (sl.product !== a.product) { sl.stock = emptyStock(); sl.sold = sl.revenue = sl.lost = 0; }
      sl.product = a.product; sl.price = round2(num(a.price, 0.01, 1e8)); sl.order = Math.round(num(a.order, 0, 100000)); sl.source = a.source;
      return OK;
    }
    case 'adContract': {
      const m = MEDIA.find(x => x.id === a.media); if (!m) return err('Unknown media outlet');
      if (PRODUCTS[a.product]?.kind !== 'consumer') return err('Only consumer goods can be advertised');
      if (!MEDIA_TERMS.includes(a.months)) return err('Choose one of the offered terms');
      const list = (s.adContracts ??= []);
      if (list.filter(x => x.media === m.id).length >= m.slots) return err(m.name + ' has no free advertising slots');
      if (list.some(x => x.media === m.id && x.owner === cid && x.product === a.product)) return err('You already advertise that product with ' + m.name);
      const fee = Math.round(m.fee * (1 - (MEDIA_DISCOUNT[a.months] ?? 0)));
      if (c.cash < fee) return err('Not enough cash (need ' + fmtMoney(fee) + ')');
      list.push({ id: 'ad' + (s.nextId++), owner: cid, media: m.id, product: a.product, fee, start: s.turn, end: s.turn + a.months });
      return { ok: true, info: `Contract signed with ${m.name}: ${PRODUCTS[a.product].name} for ${a.months} months at ${fmtMoney(fee)} a month` };
    }
    case 'cancelAd': {
      const list = s.adContracts ?? []; const i = list.findIndex(x => x.id === a.id && x.owner === cid); if (i < 0) return err('No such contract');
      const x = list[i]; const pen = x.fee * MEDIA_CANCEL_MONTHS; if (c.cash < pen) return err('Not enough cash (need ' + fmtMoney(pen) + ')');
      c.cash -= pen; c.ledger.ads += pen; list.splice(i, 1); return { ok: true, info: `Contract cancelled: penalty ${fmtMoney(pen)}` };
    }
    case 'rename': { const b = own(a.id); if (!b) return err('Not your building'); b.name = String(a.name).slice(0, 40) || b.name; return OK; }
    case 'buyShares': case 'sellShares': {
      const t = s.companies.find(x => x.id === a.company); if (!t || t.bankrupt) return err('No such listed company'); if (t.id === c.id) return err('Use issue / buy back for your own shares');
      ensureEquity(t); ensureEquity(c); const q = Math.floor(num(a.qty, 0, 1e9)); if (q < 1) return err('Enter a number of shares');
      const imp = SHARE_IMPACT * q / t.shares!;
      if (a.type === 'buyShares') {
        // beyond the shares on the market, the owners of an AI company sell their own at a 50% premium (so it can be taken over); human owners never do
        const q1 = Math.min(q, t.float!), q2 = q - q1, avail = t.isAI ? Math.max(0, treasury(s, t) - 1) : 0;
        if (q2 > avail) return err(t.isAI ? 'Only ' + Math.floor(t.float! + avail).toLocaleString('en-US') + ' shares of ' + t.name + ' can be bought' : 'Only ' + Math.floor(t.float!).toLocaleString('en-US') + ' shares of ' + t.name + ' are for sale');
        const px = t.price! * (1 + imp), cost = Math.round((q1 * px + q2 * px * 1.5) * (1 + SHARE_SPREAD)); if (c.cash < cost) return err('Need ' + fmtMoney(cost));
        c.cash -= cost; t.float! -= q1; c.portfolio![t.id] = (c.portfolio![t.id] ?? 0) + q; t.price = px;
        if (checkTakeover(s, t)) return OK;
      } else {
        const have = c.portfolio![t.id] ?? 0; if (q > have) return err('You only hold ' + Math.floor(have).toLocaleString('en-US') + ' shares');
        const px = Math.max(0.01, t.price! * (1 - imp)); c.cash += Math.round(q * px * (1 - SHARE_SPREAD)); t.float! += q; c.portfolio![t.id] = have - q; if (c.portfolio![t.id] <= 0) delete c.portfolio![t.id]; t.price = px;
      }
      return OK;
    }
    case 'issueShares': case 'buybackShares': {
      ensureEquity(c); const q = Math.floor(num(a.qty, 0, 1e9)); if (q < 1) return err('Enter a number of shares'); const imp = SHARE_IMPACT * q / c.shares!;
      if (a.type === 'issueShares') {
        if (q > treasury(s, c)) return err('You only hold ' + Math.max(0, Math.floor(treasury(s, c))).toLocaleString('en-US') + ' of your own shares');
        const px = Math.max(0.01, c.price! * (1 - imp)); c.cash += Math.round(q * px * 0.97); c.float! += q; c.price = px; // 3% underwriting fee
      } else {
        if (q > c.float!) return err('Only ' + Math.floor(c.float!).toLocaleString('en-US') + ' of your shares are on the market');
        const px = c.price! * (1 + imp), cost = Math.round(q * px * (1 + SHARE_SPREAD)); if (c.cash < cost) return err('Need ' + fmtMoney(cost));
        c.cash -= cost; c.float! -= q; c.price = px;
      }
      return OK;
    }
    case 'buyVacant': {
      const vs = (s.vacant ??= []); const i = vs.findIndex(x => x.id === a.id); if (i < 0) return err('That property is no longer for sale');
      const v = vs[i]; if (s.lots[lotKey(v.idx)] || Object.values(s.buildings).some(b => b.idx === v.idx)) { vs.splice(i, 1); return err('That property was taken'); }
      const total = v.land + v.build; if (!canPay(total)) return err(`Not enough cash (need ${fmtMoney(total)})`);
      pay(total); s.lots[lotKey(v.idx)] = { owner: cid, paid: v.land };
      const b = newBuilding(s, c, v.type, v.city, v.idx, v.product); b.condition = v.cond; b.invested = v.build; s.buildings[b.id] = b; vs.splice(i, 1);
      s.news.push({ turn: s.turn, kind: 'info', tag: 'opening', text: `${c.name} takes over ${/^[aeiou]/i.test(BUILDINGS[v.type].name) ? 'an' : 'a'} ${BUILDINGS[v.type].name.toLowerCase()}${v.product && v.type !== 'store' ? ' for ' + PRODUCTS[v.product].name.toLowerCase() : ''} in ${s.cities[v.city].name}.` });
      fillStaff(s, cid, b); return { ok: true, info: b.id };
    }
    case 'setRent': {
      const b = own(a.id); if (!b || b.type !== 'mall') return err('Not your mall'); b.rent = Math.round(num(a.rent, 500, 200000)); return OK;
    }
    case 'rentUnit': {
      const m = s.buildings[a.id]; if (!m || m.type !== 'mall') return err('No such mall'); const mo = s.companies.find(x => x.id === m.owner); if (!mo || mo.bankrupt) return err('The mall is closed');
      const p = PRODUCTS[a.product]; if (!p || p.kind !== 'consumer') return err('Malls only host consumer goods');
      if (c.brand[a.product] < MALL_MIN_BRAND) return err('Mall units only sell branded products: build up the brand of ' + p.name + ' to ' + MALL_MIN_BRAND + ' first (advertising / branding studios)');
      const units = Object.values(s.buildings).filter(x => x.mall === m.id);
      if (units.length >= MALL_UNITS) return err('The mall is full');
      if (units.some(x => x.owner === cid && x.slots[0]?.product === a.product)) return err('You already sell ' + p.name.toLowerCase() + ' in this mall');
      if (!canPay(MALL_FITOUT)) return err('Need ' + fmtMoney(MALL_FITOUT) + ' for the shop fit-out');
      pay(MALL_FITOUT);
      const u = newBuilding(s, c, 'store', m.city, m.idx, null); u.mall = m.id; u.rent = m.owner === cid ? 0 : m.rent ?? 10000; u.leaseEnd = s.turn + (m.building ?? 0) + MALL_LEASE; u.invested = MALL_FITOUT; u.size = 1; u.slots.length = 1;
      u.name = `${p.name} shop · ${m.name}`; u.slots[0] = { ...u.slots[0], product: a.product, price: round2(retailRef(s, m.city, a.product)), order: 0, source: '' };
      s.buildings[u.id] = u; if (!m.building) fillStaff(s, cid, u);
      if (m.owner !== cid) s.news.push({ turn: s.turn, kind: 'info', tag: 'opening', text: `${c.name} ${m.building ? 'reserves' : 'rents'} a unit in ${m.name} (${s.cities[m.city].name}) to sell ${p.name.toLowerCase()}.` });
      return { ok: true, info: u.id };
    }
    case 'sendMessage': {
      const to = s.companies.find(x => x.id === a.to); if (!to || to.id === cid) return err('Choose another company to write to');
      const text = String(a.text ?? '').trim().slice(0, 600); if (!text) return err('The message is empty');
      const ms = (s.messages ??= []); if (ms.filter(m => m.from === cid && m.turn === s.turn).length >= 20) return err('You have sent too many messages this month');
      ms.push({ id: s.nextId++, from: cid, to: to.id, turn: s.turn, text }); if (ms.length > 500) ms.splice(0, ms.length - 500); return OK;
    }
    case 'publishArticle': {
      const text = String(a.text ?? '').replace(/\s+/g, ' ').trim().slice(0, ARTICLE_MAX); if (text.length < 10) return err('Write at least a short sentence');
      const arts = (s.articles ??= []); if (arts.some(x => x.company === cid && x.turn === s.turn)) return err('You already bought a notice this month');
      if (c.cash - ARTICLE_FEE < -overdraftLimit(s, c)) return err(`The newspaper charges ${fmtMoney(ARTICLE_FEE)}`);
      arts.push({ id: s.nextId++, company: cid, turn: s.turn, text }); if (arts.length > 200) arts.splice(0, arts.length - 200); // the fee is charged when the month is played (advertising costs)
      return { ok: true, info: `Notice ordered (${fmtMoney(ARTICLE_FEE)}): it is printed in next month's issue.` };
    }
    case 'cancelOrder': return cancelOrder(s, cid, a.id);
    case 'answerCard': return answerCard(s, cid, a.id, a.option);
    case 'proposeContract': case 'answerContract': case 'cancelContract': return contractAction(s, cid, a);
    case 'readMessages': { for (const m of s.messages ?? []) if (m.to === cid && m.from === a.from) m.seen = true; return OK; }
    case 'bid': {
      const tg = bidTarget(s, a.id); if (!tg) return err('That person is no longer available');
      const p = tg.p; const sal = Math.round(num(a.salary, 0, 1e7) / 50) * 50;
      if (tg.employer) { // a contract about to end: the employer may counter-offer, rivals may poach
        const left = (p.contractEnd ?? 0) - s.turn; if (left > OFFER_WINDOW) return err(`${p.name}'s contract has ${left} months to run: offers open ${OFFER_WINDOW} months before it ends`);
        if (tg.employer.id === cid) { if (sal < p.salary) return err('A renewal cannot be below the current salary'); }
        else if (sal <= p.salary) return err(`To win ${p.name} over, offer more than the current ${fmtMoney(p.salary)} a month`);
      } else if (sal < p.salary) return err(p.name + ' will not work for less than ' + fmtMoney(p.salary) + ' a month');
      if (!(tg.employer?.id === cid)) { const staff = c.staff ?? []; if (staff.filter(x => x.kind === p.kind).length >= MAX_STAFF[p.kind]) return err('You already employ the maximum number of ' + (p.kind === 'manager' ? 'managers (' + MAX_STAFF.manager + ')' : 'advisors (' + MAX_STAFF.advisor + ')') + '. Fire someone first.'); }
      if (c.cash < sal * 2) return err('Keep at least two months of the offered salary in cash');
      p.bids = (p.bids ?? []).filter(x => x.company !== cid); p.bids.push({ company: cid, salary: sal }); return OK;
    }
    case 'withdrawBid': {
      const tg = bidTarget(s, a.id); if (!tg) return err('That person is no longer available'); tg.p.bids = (tg.p.bids ?? []).filter(x => x.company !== cid); return OK;
    }
    case 'fire': {
      const staff = c.staff ?? []; const i = staff.findIndex(x => x.id === a.id); if (i < 0) return err('No such employee');
      const p = staff[i]; c.cash -= p.salary; c.ledger.wages += p.salary; staff.splice(i, 1); return OK; // one month severance
    }
    case 'assign': {
      const p = (c.staff ?? []).find(x => x.id === a.id); if (!p || p.kind !== 'manager') return err('Only managers can be assigned to a facility');
      if (a.building) { const b = own(a.building); if (!b) return err('Not your building'); for (const o of c.staff ?? []) if (o.assigned === b.id) o.assigned = null; p.assigned = b.id; } else p.assigned = null;
      return OK;
    }
    case 'setPolicy': {
      ensureEquity(c); const d = Math.round(num(a.dividend, 0, 100)), i = Math.round(num(a.invest, 0, 100)); if (d + i > 100) return err('Dividends and investment cannot exceed 100% of the profit');
      if (!['facilities', 'rd', 'debt'].includes(a.target)) return err('Unknown investment target'); c.policy = { dividend: d, invest: i, target: a.target }; return OK;
    }
    case 'takeLoan': {
      const lender = LENDERS.find(l => l.id === a.lender); if (!lender) return err('Unknown lender');
      const loans = (c.loans ??= []); if (loans.length >= MAX_LOANS) return err('At most ' + MAX_LOANS + ' open loans');
      const amt = Math.round(num(a.amount, 0, 1e9)), term = Math.round(+a.term); if (!lender.terms.includes(term)) return err('Choose one of the offered terms');
      const col = [...new Set(a.collateral ?? [])]; for (const id of col) { const b = own(id); if (!b) return err('You can only pledge your own buildings'); if (pledgedTo(c, id)) return err(b.name + ' is already pledged to another loan'); }
      if (col.length && lender.collateral === 'none') return err(lender.name + ' does not accept collateral');
      if (lender.collateral === 'required' && !col.length) return err(lender.name + ' only lends against collateral');
      const o = loanOffer(s, c, lender, col); if (amt < lender.min) return err('Minimum loan is ' + fmtMoney(lender.min));
      if (amt > o.max) return err('This lender offers at most ' + fmtMoney(o.max) + ' right now');
      c.debt += amt; c.cash += amt;
      loans.push({ id: 'L' + s.nextId++, lender: lender.id, original: amt, principal: amt, rate: o.rate, type: lender.type, term, elapsed: 0, startTurn: s.turn, installment: Math.ceil(amt / term), collateral: col, late: 0 });
      return OK;
    }
    case 'repayLoan': {
      const L = (c.loans ?? []).find(x => x.id === a.id); if (!L) return err('No such loan');
      const amt = Math.round(Math.min(num(a.amount, 0, 1e9), L.principal)); if (amt <= 0) return err('Nothing to repay');
      if (c.cash < amt) return err('Not enough cash'); c.cash -= amt; c.debt -= amt; L.principal -= amt;
      if (L.principal <= 0) c.loans = c.loans!.filter(x => x !== L); else if (L.type === 'amortizing') L.installment = Math.ceil(L.principal / Math.max(1, L.term - L.elapsed));
      return OK;
    }
  }
  return err('Unknown action');
}
export const fmtMoney = (v: number) => (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US');

// ---------------------------------------------------------------- trading
interface Acquired { qty: number; q: number }
/** Source ids: '' = none selected, 'harbour:<cityId>' = import through that port city, otherwise a producing building id. */
export const harbourId = (city: number) => 'harbour:' + city;
export function sourceError(s: GameState, cid: string, product: ProductId, source: string): string | null {
  if (!source) return null;
  if (source.startsWith('contract:')) return contractSource(s, cid, product, source) ? null : 'That is not an active supply contract of yours for ' + PRODUCTS[product].name;
  if (source.startsWith('harbour:')) {
    const c = s.cities[+source.slice(8)]; if (!c || !c.port) return 'That city has no harbour';
    return harbourStocks(s.cities, source, product) ? null : 'That harbour has no ' + PRODUCTS[product].name + ' in stock right now';
  }
  if (source.includes('#')) {
    const [bid, ci] = source.split('#'); const ob = s.buildings[bid], ec = ob?.layout?.[+ci];
    if (!ob || !ec || ec.m !== 'export' || ec.product !== product) return 'Invalid export cell';
    if (ob.owner !== cid && ec.listPrice == null) return 'That export cell does not sell to everyone'; return null;
  }
  const src = s.buildings[source];
  if (!src || src.product !== product || src.type === 'store' || src.type === 'rd') return 'Invalid supplier';
  if (src.owner !== cid && src.listPrice == null) return 'That factory does not sell to everyone';
  return null;
}
export const harbourGoodPrice = (s: GameState, g: HarbourGood) => round2(importPrice(s, g.product) * g.mult);
/** Does the harbour named by `source` currently have this product in stock? */
export function harbourStocks(cities: { port?: boolean; harbour?: HarbourGood[] }[], source: string, product: ProductId): HarbourGood | undefined {
  if (!source.startsWith('harbour:')) return undefined; const c = cities[+source.slice(8)];
  return c?.port ? c.harbour?.find(g => g.product === product && g.qty > 0.5) : undefined;
}
const HARBOUR_SLOTS = 4, HARBOUR_LIFE = 12;
function newHarbourGood(s: GameState, exclude: ProductId[], since: number): HarbourGood {
  const pool = PRODUCT_LIST.filter(p => !exclude.includes(p.id)); const p = pool[Math.floor(rnd(s) * pool.length)];
  return { product: p.id, qty: Math.round(p.cap * rr(s, 2, 5)), mult: round2(rr(s, 0.92, 1.08)), since };
}
/** Every port keeps 4 different goods; a good is replaced when it sells out or has been stored for a year. */
export function refreshHarbours(s: GameState) {
  for (const c of s.cities) {
    if (!c.port) continue;
    const list = c.harbour ?? (c.harbour = []);
    while (list.length < HARBOUR_SLOTS) list.push(newHarbourGood(s, list.map(g => g.product), s.turn - Math.floor(rr(s, 0, 9))));
    list.forEach((g, i) => { if (g.qty <= 0.5 || s.turn - g.since >= HARBOUR_LIFE) list[i] = newHarbourGood(s, list.map(x => x.product), s.turn); });
  }
}

function acquire(s: GameState, buyer: Building, product: ProductId, qty: number, source: string): Acquired {
  if (qty <= 0.0001 || !source) return { qty: 0, q: 0 };
  const company = s.companies.find(x => x.id === buyer.owner)!;
  const limit = overdraftLimit(s, company);
  const bt = buyerTile(buyer); let rail = false;
  type Cand = { b?: Building; cell?: LayoutCell; good?: HarbourGood; price: number; landed: number; avail: number; q: number; internal: boolean };
  let cd: Cand;
  if (source.startsWith('contract:')) {
    const k = contractSource(s, buyer.owner, product, source); const b = k?.from ? s.buildings[k.from] : undefined;
    const pool = b ? salePool(b, product) : []; if (!k || !b || b.owner !== k.seller || poolQty(pool) < 0.5) return { qty: 0, q: 0 };
    const n0 = Math.min(qty, poolQty(pool), Math.max(0, k.qty - k.delivered)); if (n0 <= 0.0001) return { qty: 0, q: 0 };
    const landed = k.price + haulCost(s, product, b.idx, bt); const n = Math.min(n0, Math.max(0, (company.cash + limit) / landed)); if (n <= 0.0001) return { qty: 0, q: 0 };
    const total = n * k.price, tr = n * (landed - k.price); const seller = s.companies.find(x => x.id === b.owner)!;
    company.cash -= total + tr; company.ledger.purchases += total; company.ledger.transport += tr; buyer.report.purchases += total + tr;
    const taken = takePool(pool, n); seller.cash += total; seller.ledger.revenue += total; b.report.revenue += total; b.report.sold += n; b.report.soldCo = (b.report.soldCo ?? 0) + n; k.delivered += n;
    return { qty: n, q: taken.q };
  }
  if (source.startsWith('harbour:')) {
    const hc = s.cities[+source.slice(8)]; const gd = harbourStocks(s.cities, source, product); if (!hc || !gd) return { qty: 0, q: 0 };
    const price = harbourGoodPrice(s, gd);
    rail = railLink(s, cityTile(s, hc), bt);
    cd = { good: gd, price, landed: price + haulCost(s, product, cityTile(s, hc), bt), avail: gd.qty, q: IMPORT_QUALITY, internal: false };
  } else {
    const [bid, ci] = source.split('#'); const b = s.buildings[bid]; const ec = ci !== undefined ? b?.layout?.[+ci] : undefined;
    if (!b || b.id === buyer.id) return { qty: 0, q: 0 };
    if (ci !== undefined) { if (!ec || ec.m !== 'export' || ec.product !== product || !ec.stock || ec.stock.qty < 0.5) return { qty: 0, q: 0 }; }
    else if (b.product !== product || b.stock.qty < 0.5 || b.type === 'factory') return { qty: 0, q: 0 }; // a factory ships only from its export cells
    const internal = b.owner === buyer.owner; const lp = ec ? ec.listPrice : b.listPrice; if (!internal && lp == null) return { qty: 0, q: 0 };
    const price = internal ? 0 : lp!; const stk = ec ? ec.stock! : b.stock;
    rail = railLink(s, b.idx, bt);
    const ship = b.city === buyer.city ? Infinity : Math.max(capacity(b), ec ? exportCap(b, +ci) : 0) * (rail ? RAIL_SHIP_MUL : SHIP_BASE) - (b.shipped ?? 0);
    cd = { b, cell: ec, price, landed: price + haulCost(s, product, b.idx, bt), avail: Math.min(stk.qty, Math.max(0, ship)), q: stk.q, internal };
  }
  let n = Math.min(qty, cd.avail);
  if (cd.landed > 0) n = Math.min(n, Math.max(0, (company.cash + limit) / cd.landed));
  if (n <= 0.0001) return { qty: 0, q: 0 };
  const total = n * cd.price, tr = n * (cd.landed - cd.price);
  company.cash -= total + tr; company.ledger.purchases += total; company.ledger.transport += tr;
  buyer.report.purchases += total + tr;
  if (cd.good) cd.good.qty -= n;
  if (cd.b) {
    (cd.cell ? cd.cell.stock! : cd.b.stock).qty -= n; if (cd.b.city !== buyer.city) cd.b.shipped = (cd.b.shipped ?? 0) + n;
    const seller = s.companies.find(x => x.id === cd.b!.owner)!;
    if (!cd.internal) { seller.cash += total; seller.ledger.revenue += total; cd.b.report.revenue += total; cd.b.report.sold += n; cd.b.report.soldCo = (cd.b.report.soldCo ?? 0) + n; }
  }
  return { qty: n, q: cd.q };
}
export function addStock(st: Stock, qty: number, q: number) {
  if (qty <= 0) return; const t = st.qty + qty; st.q = (st.qty * st.q + qty * q) / t; st.qty = t;
}

// ---------------------------------------------------------------- turn
export function processTurn(s: GameState) {
  if (s.finished) return;
  const live = s.companies.filter(c => !c.bankrupt);
  for (const b of Object.values(s.buildings)) b.shipped = 0;
  for (const c of live) { c.ledger = emptyLedger(); c.news = c.news.filter(n => n.turn > s.turn - 12); }
  for (const x of s.articles ?? []) if (x.turn === s.turn) { const c = live.find(o => o.id === x.company); if (c) c.ledger.ads += ARTICLE_FEE; } // paid notices are billed as advertising
  if (!s.world) buildWorld(s);
  for (const b of Object.values(s.buildings)) { b.report = emptyReport(); ensureLayout(b); syncLayout(b); }
  // the desk: AI companies answer contract offers, players' sealed orders are carried out, decision cards take effect
  aiAnswerContracts(s); resolveOrders(s); resolveCards(s);

  for (const b of Object.values(s.buildings)) if (b.building) { b.building--; if (!b.building) { b.building = undefined; completeBuilding(s, b); } }
  updateMarket(s);
  refreshHarbours(s);
  for (const x of (s.adContracts ?? []).filter(x => x.end <= s.turn)) { const o = s.companies.find(c => c.id === x.owner); o?.news.push({ turn: s.turn, text: `Your ${MEDIA.find(m => m.id === x.media)?.name ?? 'media'} contract for ${PRODUCTS[x.product].name} has ended.` }); }
  if (s.adContracts) s.adContracts = s.adContracts.filter(x => x.end > s.turn && !s.companies.find(c => c.id === x.owner)?.bankrupt);
  resolveHiring(s);
  resolveContracts(s);
  refreshCandidates(s);
  spawnVacancies(s);
  spawnSubsidies(s);
  for (const c of live) if (c.isAI) aiTurn(s, c);

  // production tiers: raw first, then deeper recipes
  const producers = Object.values(s.buildings).filter(b => !idle(s, b) && b.product && b.type !== 'store' && b.type !== 'rd' && !s.companies.find(c => c.id === b.owner)!.bankrupt);
  shuffle(s, producers).sort((a, b) => PRODUCTS[a.product!].depth - PRODUCTS[b.product!].depth);
  for (const b of producers) produce(s, b);

  // stores buy
  for (const b of shuffle(s, Object.values(s.buildings).filter(b => b.type === 'store' && !idle(s, b)))) storeBuy(s, b);

  // retail
  retail(s);
  sellWorld(s);
  recordSales(s);
  settleContracts(s);

  // R&D
  for (const b of Object.values(s.buildings)) if (b.type === 'rd' && b.product && !idle(s, b)) {
    const c = s.companies.find(x => x.id === b.owner)!;
    const pts = b.workers * 0.15 * moraleFactor(s, b) * (0.6 + 0.4 * b.condition / 100) * areaInfo(s, b).factor;
    const P = PRODUCTS[b.product];
    if (P.research && !isUnlocked(c, b.product)) { // a hi-tech project: points go into unlocking the product instead of its tech level
      if (!canResearch(c, b.product)) { b.report.produced = 0; b.report.note = `${P.name} cannot be researched until ${PRODUCTS[P.after!].name} is unlocked.`; continue; }
      c.research ??= {}; const gain = pts * UNLOCK_RATE; c.research[b.product] = Math.min(P.research, researchOf(c, b.product) + gain); b.report.produced = round2(gain);
      if (isUnlocked(c, b.product)) { b.report.note = `${P.name} developed! You can now manufacture it.`; s.news.push({ turn: s.turn, kind: 'good', tag: 'product', text: `${c.name} has developed ${P.name} and can now manufacture it.` }); }
      else b.report.note = `Developing ${P.name}: ${Math.round(researchOf(c, b.product))} / ${P.research} points (+${gain.toFixed(1)}).`;
      continue;
    }
    const before = c.tech[b.product];
    c.tech[b.product] = Math.min(100, before + pts * (1 - before / 110));
    b.report.produced = round2(c.tech[b.product] - before);
    b.report.note = `Research on ${PRODUCTS[b.product].name}: +${b.report.produced.toFixed(2)} (now ${c.tech[b.product].toFixed(1)})`;
  }

  // factory R&D benches
  for (const b of Object.values(s.buildings)) if (b.type === 'factory' && b.product) {
    const fx = moduleStats(b); if (!fx.rd) continue;
    const c = s.companies.find(x => x.id === b.owner)!; if (c.bankrupt) continue;
    c.tech[b.product] = Math.min(100, c.tech[b.product] + fx.rd * 0.4 * (1 - c.tech[b.product] / 110));
  }

  // accounting
  collectRents(s);
  for (const c of live) closeBooks(s, c);

  // cities
  growCities(s);
  for (const city of s.cities) {
    const growth = 0.002 + 0.001 * (city.wealth - 1);
    city.pop = Math.round(city.pop * (1 + growth));
    city.wealth = round2(clamp(city.wealth + rr(s, -0.01, 0.012) * (city.wealth > 1.4 ? 0.2 : 1), 0.6, 1.8));
  }
  s.turn++;
  for (const c of live) c.ready = c.isAI;
  dealCards(s);
  checkEnd(s);
}

function sellWorld(s: GameState) {
  const used: Partial<Record<ProductId, number>> = {}; s.sales ??= { local: {}, world: {} }; s.sales.world = {};
  const sell = (b: Building, p: ProductId, st: Stock) => {
    const co = s.companies.find(x => x.id === b.owner)!; if (co.bankrupt) return;
    const vol = worldVolume(p), u = used[p] ?? 0, n = Math.min(st.qty, vol - u); if (n < 0.5) return;
    const pr = (x: number) => worldPrice(s, p) * (1 - WORLD_DROP * x / vol);
    const total = n * (pr(u) + pr(u + n)) / 2 * (0.6 + 0.4 * st.q / 100);
    st.qty -= n; used[p] = u + n; ((s.sales!.world[p] ??= {})[co.id] = (s.sales!.world[p]?.[co.id] ?? 0) + n); co.cash += total; co.ledger.revenue += total; b.report.revenue += total; b.report.sold += n; b.report.soldWorld = (b.report.soldWorld ?? 0) + n;
    b.report.note += ` Sold ${Math.round(n)} ${PRODUCTS[p].name} to the world market for ${fmtMoney(Math.round(total))}.`;
  };
  for (const b of shuffle(s, Object.values(s.buildings))) {
    if (b.type === 'store' || b.type === 'rd') continue;
    if (b.world && b.product && b.type !== 'factory') sell(b, b.product, b.stock);
    b.layout?.forEach(c => { if (c.m === 'export' && c.world && c.product && c.stock) sell(b, c.product, c.stock); });
  }
  s.worldSold = used;
}

function updatePrice(s: GameState, c: Company) {
  ensureEquity(c);
  const recent = c.history.slice(-6), avg = recent.length ? recent.reduce((n, p) => n + p.profit, 0) / recent.length : 0;
  const target = Math.max(0.01, (Math.max(0, equity(s, c)) + 24 * Math.max(0, avg)) / c.shares!);
  c.price = Math.max(0.01, round2(c.price! + (target - c.price!) * 0.3 + c.price! * rr(s, -0.02, 0.02)));
  c.priceHist!.push(c.price); if (c.priceHist!.length > 120) c.priceHist!.shift();
}
/** December: split the year's profit between dividends to outside shareholders, investment, and the cash reserve. */
function fiscalYearEnd(s: GameState, c: Company) {
  ensureEquity(c); const pol = c.policy!; const profit = Math.max(0, c.history.slice(-12).reduce((n, p) => n + p.profit, 0));
  let div = Math.min(profit * pol.dividend / 100, Math.max(0, c.cash)); let paid = 0;
  const outside = treasury(s, c) < c.shares! ? c.shares! - treasury(s, c) : 0;
  if (div > 0 && outside > 0) {
    const dps = div / outside; c.lastDps = round2(dps);
    for (const o of s.companies) { const q = o.portfolio?.[c.id] ?? 0; if (q > 0 && !o.bankrupt) { const amt = Math.round(q * dps); o.cash += amt; paid += amt; o.news.push({ turn: s.turn, text: `Dividend from ${c.name}: ${fmtMoney(amt)} (${dps.toFixed(3)} per share).` }); } }
    c.cash -= paid; if (paid > 0) s.news.push({ turn: s.turn, kind: 'good', tag: 'market', text: `${c.name} pays shareholders ${fmtMoney(paid)} in dividends for the year (${dps.toFixed(3)} per share).` });
  }
  let inv = Math.min(profit * pol.invest / 100, Math.max(0, c.cash)); let spent = 0;
  if (inv > 0) {
    if (pol.target === 'facilities') { const mine = companyBuildings(s, c.id); const tot = mine.reduce((n, b) => n + b.invested, 0); if (tot > 0) for (const b of mine) { const part = inv * b.invested / tot; b.condition = Math.min(100, b.condition + part / Math.max(1, b.invested) * 100); b.invested += Math.round(part); spent += part; } }
    else if (pol.target === 'rd') { const ps = [...new Set(companyBuildings(s, c.id).map(b => b.product).filter((p): p is ProductId => !!p && b0(p)))]; for (const p of ps) { c.tech[p] = Math.min(100, c.tech[p] + inv / ps.length / 60_000); } if (ps.length) spent = inv; }
    else { for (const L of [...(c.loans ?? [])].sort((x, y) => y.rate - x.rate)) { const pay = Math.min(L.principal, inv - spent); if (pay <= 0) break; L.principal -= pay; c.debt -= pay; spent += pay; if (L.principal <= 0) c.loans = c.loans!.filter(x => x !== L); } }
    c.cash -= Math.round(spent);
  }
  c.lastYear = { profit: Math.round(profit), dividends: paid, invested: Math.round(spent), target: pol.target };
  c.news.push({ turn: s.turn, text: `Fiscal year closed: profit ${fmtMoney(profit)}; ${fmtMoney(paid)} paid as dividends, ${fmtMoney(spent)} invested${spent ? ' (' + pol.target + ')' : ''}, the rest stays in the bank.` });
}
const b0 = (p: ProductId) => !!PRODUCTS[p];
/** Monthly loan servicing: pay what falls due, or miss it (3 misses in a row = the lender seizes the collateral). Returns the interest + fees for the ledger. */
function serviceLoans(s: GameState, c: Company): number {
  let cost = 0;
  for (const L of [...(c.loans ?? [])]) {
    const d = loanDue(L); const lender = LENDERS.find(x => x.id === L.lender)!; cost += d.interest;
    if (c.cash - d.principal >= -overdraftLimit(s, c)) { c.cash -= d.principal; c.debt -= d.principal; L.principal -= d.principal; L.late = 0; }
    else if (d.principal > 0) {
      L.late++; const fee = Math.round(d.principal * 0.03); cost += fee;
      c.news.push({ turn: s.turn, text: `Missed a payment of ${fmtMoney(d.principal)} to ${lender.name}${L.late >= 3 ? '.' : ` (${L.late}/3, fee ${fmtMoney(fee)}).`}` });
      if (L.late >= 3) foreclose(s, c, L, lender);
    }
    L.elapsed++;
    if (L.principal <= 0) { c.loans = c.loans!.filter(x => x !== L); c.news.push({ turn: s.turn, text: `Loan from ${lender.name} fully repaid.` }); }
  }
  return cost;
}
function foreclose(s: GameState, c: Company, L: Loan, lender: Lender) {
  let got = 0;
  for (const id of L.collateral) { const b = s.buildings[id]; if (!b) continue; got += Math.round(collateralValue(b) * 0.6); removeBuilding(s, b); }
  const paid = Math.min(L.principal, got); L.principal -= paid; c.debt -= paid; c.cash += got - paid;
  s.news.push({ turn: s.turn, kind: 'bad', text: `${lender.name} seized ${L.collateral.length ? L.collateral.length + ' facilities' : 'no collateral'} from ${c.name} after missed payments.` });
  c.news.push({ turn: s.turn, text: `${lender.name} foreclosed${L.collateral.length ? ' on your pledged facilities' : ''} and recovered ${fmtMoney(paid)}.${L.principal > 0 ? ' The rest (' + fmtMoney(L.principal) + ') is restructured at double interest over 12 months.' : ''}` });
  L.collateral = []; L.late = 0;
  if (L.principal <= 0) { c.loans = c.loans!.filter(x => x !== L); return; }
  Object.assign(L, { defaulted: true, type: 'amortizing', term: 12, elapsed: 0, startTurn: s.turn, original: L.principal, installment: Math.ceil(L.principal / 12) });
}
function removeBuilding(s: GameState, b: Building) {
  delete s.buildings[b.id];
  for (const o of Object.values(s.buildings)) for (const [p, src] of Object.entries(o.sources)) if (src === b.id || src.startsWith(b.id + '#')) o.sources[p as ProductId] = '';
  for (const o of Object.values(s.buildings)) for (const sl of o.slots) if (sl.source === b.id || sl.source.startsWith(b.id + '#')) sl.source = '';
}

function updateMarket(s: GameState) {
  for (const p of PRODUCT_LIST) {
    const m = s.market[p.id]; m.prev = m.idx;
    m.idx = clamp(m.idx + (1 - m.idx) * 0.12 + rr(s, -0.03, 0.03), 0.6, 1.8);
    m.demand = 1;
  }
  s.effects = s.effects.filter(e => e.until > s.turn);
  for (const e of s.effects) {
    if (e.kind === 'recession' || e.kind === 'boom') for (const p of PRODUCT_LIST) s.market[p.id].demand *= e.value;
  }
  if (s.settings.events && rnd(s) < 0.3) {
    const roll = rnd(s); const t = s.turn;
    const push = (text: string, kind: 'good' | 'bad' | 'info') => s.news.push({ turn: t, text, kind });
    if (roll < 0.15) { s.effects.push({ kind: 'drought', until: t + 3, value: 0.65 }); s.market.grain.idx *= 1.2; push('Drought hits the farmlands: grain harvests down 35% for 3 months.', 'bad'); }
    else if (roll < 0.3) { s.market.oil.idx *= 1.3; push('Oil shock! Crude prices jump 30%.', 'bad'); }
    else if (roll < 0.45) { s.effects.push({ kind: 'recession', until: t + 4, value: 0.88 }); push('Recession fears: consumers spend 12% less for 4 months.', 'bad'); }
    else if (roll < 0.6) { s.effects.push({ kind: 'boom', until: t + 4, value: 1.1 }); push('Consumer confidence is high: demand +10% for 4 months.', 'good'); }
    else if (roll < 0.75) { const c = s.cities[Math.floor(rnd(s) * s.cities.length)]; c.wealth = round2(clamp(c.wealth + 0.1, 0.6, 1.8)); c.pop = Math.round(c.pop * 1.03); push(`${c.name} is booming: new industry attracts residents and wealth.`, 'good'); }
    else if (roll < 0.85) { s.market.livestock.idx *= 1.25; push('Cattle disease outbreak pushes livestock prices up 25%.', 'bad'); }
    else if (roll < 0.95) { s.market.steel.idx *= 1.2; push('Steelworkers strike: steel prices up 20%.', 'bad'); }
    else { for (const p of PRODUCT_LIST) s.market[p.id].idx *= 0.92; push('Global glut: prices fall across the board.', 'info'); }
  }
  s.news = s.news.slice(-150);
}

/** Factory production over the layout graph: lines pull their recipe inputs from linked import cells or linked lines. */
function produceFactory(s: GameState, b: Building, c: Company, eff: number, fx: ReturnType<typeof moduleStats>, storage: number): string {
  const L = b.layout!; const final = b.product!; const room = Math.max(0, storage - b.stock.qty);
  const capLeft = new Map<number, number>();
  L.forEach(cell => { cell.made = 0; cell.madeQ = 0; cell.moved = 0; }); // this month's per-cell report
  L.forEach((cell, i) => { if (cell.m === 'line' && cell.product) capLeft.set(i, lineCap(b, i) * eff); });
  const impLeft = new Map<number, number>();
  L.forEach((cell, i) => { if (cell.m === 'import' && cell.product) impLeft.set(i, PRODUCTS[cell.product].cap * 3 * staffRatio(b, i)); });
  const ORDER: Record<string, number> = { warehouse: 0, import: 1, line: 2 }; // inputs come from warehouses first (stock already paid for), then import cells, then other lines
  const neigh = (i: number) => incoming(b, i).filter(j => ORDER[L[j].m ?? ''] !== undefined).sort((p, q) => ORDER[L[p].m!] - ORDER[L[q].m!] || p - q);
  const notes = new Set<string>();
  const make = (i: number, wanted: number, path: Set<number>): { qty: number; q: number } => {
    const X = L[i].product!; const left = capLeft.get(i) ?? 0;
    let units = Math.min(wanted, left); if (units <= 1e-6) return { qty: 0, q: 0 };
    const recipe = Object.entries(PRODUCTS[X].recipe) as [ProductId, number][]; let qs = 0;
    const fxE = effortFx(L[i].effort);
    for (const [Y, per0] of recipe) {
      const per = per0 * fxE.inputs; const need = units * per; let have = 0, qsum = 0;
      for (const j of neigh(i)) {
        if (have >= need - 1e-6) break; const cell = L[j];
        if (cell.m === 'warehouse' && cell.product === Y) { const sp = cell.stock; if (sp && sp.qty > 1e-6) { const t = Math.min(need - have, sp.qty); sp.qty -= t; have += t; qsum += t * sp.q; } }
        else if (cell.m === 'import' && cell.product === Y) {
          { const bf = cell.stock; if (bf && bf.qty > 1e-6) { const t = Math.min(need - have, bf.qty); bf.qty -= t; have += t; qsum += t * bf.q; } } // the import cell's own buffer first
          if (have >= need - 1e-6) continue;
          const room = impLeft.get(j) ?? 0; if (room <= 1e-6) { notes.add('Import cell #' + (j + 1) + ' (' + PRODUCTS[Y].name + ') is not staffed enough.'); continue; } const r = acquire(s, b, Y, Math.min(need - have, room), cell.source ?? ''); impLeft.set(j, room - r.qty); cell.moved = (cell.moved ?? 0) + r.qty; have += r.qty; qsum += r.qty * r.q; }
        else if (cell.m === 'line' && cell.product === Y && !path.has(j)) { const np = new Set(path); np.add(j); const r = make(j, need - have, np); have += r.qty; qsum += r.qty * r.q; }
      }
      if (have < need - 1e-6) notes.add(PRODUCTS[X].name + ' line short of ' + PRODUCTS[Y].name + '.');
      units = Math.min(units, have / per); qs += have > 0 ? qsum / have : 0;
    }
    units = Math.max(0, units); capLeft.set(i, left - units);
    const inputQ = recipe.length ? qs / recipe.length : 60;
    const q = clamp(0.6 * (25 + 0.75 * c.tech[X]) + 0.4 * inputQ + 3 * fx.qa + fxE.q, 5, 100);
    if (units > 0) { const m0 = L[i].made ?? 0; L[i].madeQ = ((L[i].madeQ ?? 0) * m0 + q * units) / (m0 + units); L[i].made = m0 + units; }
    return { qty: units, q };
  };
  let total = 0, qsum = 0;
  L.forEach((cell, i) => {
    if (cell.m !== 'line' || cell.product !== final) return;
    const want = Math.min((capLeft.get(i) ?? 0) * (b.target / 100), room - total); if (want <= 1e-6) return;
    const r = make(i, want, new Set([i])); total += r.qty; qsum += r.qty * r.q;
  });
  addStock(b.stock, total, total > 0 ? qsum / total : 50);
  b.report.produced = Math.round(total * 10) / 10; if (total > 0) b.report.quality = Math.round(qsum / total);
  // finished goods follow the arrows out of the final lines: they are shared equally between the warehouses and export cells those lines point to (a full one passes its share on)
  { const sinks = [...new Set(L.flatMap((x, k) => (x.m === 'line' && x.product === final ? outgoing(b, k) : [])))].filter(k => (L[k].m === 'warehouse' || L[k].m === 'export') && L[k].product === final);
    let left = b.stock.qty; let open = sinks.filter(k => (L[k].m === 'export' ? exportCap(b, k) : whCap(b, k)) - (L[k].stock?.qty ?? 0) > 1e-6);
    for (let pass = 0; pass < 4 && open.length && left > 1e-6; pass++) {
      const share = left / open.length; const next: number[] = [];
      for (const k of open) { const st = (L[k].stock ??= emptyStock()); const room = (L[k].m === 'export' ? exportCap(b, k) : whCap(b, k)) - st.qty; const t = Math.min(share, room); if (t > 1e-6) { addStock(st, t, b.stock.q); b.stock.qty -= t; left -= t; L[k].moved = (L[k].moved ?? 0) + t; } if (room - t > 1e-6) next.push(k); }
      open = next;
    } }
  // import cells refill their small buffer with the buying capacity that is still left
  L.forEach((cell, i) => {
    if (cell.m !== 'import' || !cell.product) return; const left = impLeft.get(i) ?? 0; const st = (cell.stock ??= emptyStock()); const want = Math.min(left, impCap(b, i) - st.qty); if (want <= 1e-6) return;
    const r = acquire(s, b, cell.product, want, cell.source ?? ''); addStock(st, r.qty, r.q); impLeft.set(i, left - r.qty); cell.moved = (cell.moved ?? 0) + r.qty;
  });
  // warehouses and export cells collect what flows into them: from lines (spare capacity), import cells (spare buying capacity), other warehouses and, into a warehouse, an export cell (their stock moves along).
  // Several passes let goods travel down a chain of warehouses.
  for (let pass = 0; pass < 3; pass++) L.forEach((cell, e) => {
    if ((cell.m !== 'warehouse' && cell.m !== 'export') || !cell.product) return; const P = cell.product; const st = (cell.stock ??= emptyStock()); const cap = cell.m === 'export' ? exportCap(b, e) : whCap(b, e);
    for (const i of incoming(b, e)) {
      const src = L[i]; if (src.product !== P) continue; const room = cap - st.qty; if (room <= 1e-6) break;
      if (src.m === 'line') { if (cell.m === 'warehouse' && P === b.product) continue; /* finished goods reach a warehouse through the overflow step */ const want = Math.min(capLeft.get(i) ?? 0, room); if (want > 1e-6) { const r = make(i, want, new Set([i])); addStock(st, r.qty, r.q); cell.moved = (cell.moved ?? 0) + r.qty; } }
      else if (src.m === 'warehouse' || src.m === 'export') { const w = src.stock; if (w && w.qty > 1e-6) { const t = Math.min(w.qty, room); w.qty -= t; addStock(st, t, w.q); cell.moved = (cell.moved ?? 0) + t; } }
      else if (src.m === 'import') { const left = impLeft.get(i) ?? 0; const want = Math.min(left, room); if (want > 1e-6) { const r = acquire(s, b, P, want, src.source ?? ''); addStock(st, r.qty, r.q); impLeft.set(i, left - r.qty); cell.moved = (cell.moved ?? 0) + r.qty; src.moved = (src.moved ?? 0) + r.qty; } }
    }
  });
  L.forEach((cell, i) => { if (cell.m && staffRatio(b, i) < 0.99) notes.add('Cell #' + (i + 1) + ' understaffed (' + (cell.workers ?? 0) + '/' + cellNeed(b, i) + ').'); });
  if (!notes.size) for (const m of layoutIssues(b).slice(0, 2)) notes.add(m + '.');
  return [...notes].join(' ');
}

function produce(s: GameState, b: Building) {
  const def = PRODUCTS[b.product!]; const c = s.companies.find(x => x.id === b.owner)!;
  ensureLayout(b); const fx = factoryExtra(b);
  b.stock.qty *= 1 - def.spoil * (1 - 0.2 * Math.min(3, fx?.warehouse ?? 0));
  for (const [p, st] of Object.entries(b.inputs)) st!.qty *= 1 - PRODUCTS[p as ProductId].spoil;
  for (const c of b.layout ?? []) if ((c.m === 'warehouse' || c.m === 'export' || c.m === 'import') && c.stock && c.product) c.stock.qty *= 1 - PRODUCTS[c.product].spoil * 0.5;
  const eff = efficiency(s, b) * seasonFactor(s, b) * (1 + mgrBonus(s, b).prod);
  const storage = baseStorage(b); // room for finished goods inside the factory; everything beyond is dispatched through the arrows
  if (b.type === 'factory') {
    let note = produceFactory(s, b, c, eff, fx!, storage);
    if (eff < 0.95) note += ' Efficiency ' + (eff * 100).toFixed(0) + '% (condition ' + b.condition.toFixed(0) + '%, wages).';
    b.report.note = note.trim(); return;
  }
  let max = Math.min(capacity(b) * (b.target / 100) * eff, Math.max(0, storage - b.stock.qty));
  let inputQ = 60, note = '';
  const recipe = Object.entries(def.recipe) as [ProductId, number][];
  if (recipe.length) {
    // fetch inputs for this month's potential production
    for (const [p, q] of recipe) {
      const st = (b.inputs[p] ??= emptyStock());
      const want = Math.min(max * q * 1.0 - st.qty, PRODUCTS[b.product!].cap * b.lines * q * 2);
      if (want > 0) { const got = acquire(s, b, p, want, b.sources[p] ?? ''); addStock(st, got.qty, got.q); }
    }
    let units = max, qs = 0;
    for (const [p, q] of recipe) units = Math.min(units, (b.inputs[p]?.qty ?? 0) / q);
    units = Math.max(0, units);
    for (const [p, q] of recipe) { const st = b.inputs[p]!; st.qty -= units * q; qs += st.q; }
    inputQ = qs / recipe.length; max = units;
    if (units < capacity(b) * (b.target / 100) * eff * 0.99) note = 'Input shortage or cash limit. ';
  }
  // operating supplies (a farm's fuel): bought from the chosen source; short of them the facility works by hand at SUPPLY_HAND output
  for (const [p, per] of Object.entries(SUPPLIES[b.type] ?? {}) as [ProductId, number][]) {
    const st = (b.inputs[p] ??= emptyStock()); const need = max * per; const src = b.sources[p] ?? 'market'; // no choice made yet: the local market (a fuel station: import price, no transport)
    const want = need - st.qty + capacity(b) * per * 0.5; // plus a half-month reserve
    if (need - st.qty > 1e-6 && src === 'market') { const n = Math.max(0, Math.min(want, (c.cash + 1e6) / importPrice(s, p))); const cost = n * importPrice(s, p); c.cash -= cost; c.ledger.purchases += cost; b.report.purchases += cost; addStock(st, n, IMPORT_QUALITY); }
    else if (need - st.qty > 1e-6 && src) { const got = acquire(s, b, p, want, src); addStock(st, got.qty, got.q); }
    if (src !== 'market' && src && need - st.qty > 1e-6) { const n = Math.max(0, Math.min(need - st.qty, (c.cash + 1e6) / importPrice(s, p))); const cost = n * importPrice(s, p); c.cash -= cost; c.ledger.purchases += cost; b.report.purchases += cost; addStock(st, n, IMPORT_QUALITY); } // the supplier fell short: top up at the local market
    const fill = need > 0 ? Math.min(1, st.qty / need) : 1; st.qty = Math.max(0, st.qty - need * fill);
    if (fill < 0.999) { max *= SUPPLY_HAND + (1 - SUPPLY_HAND) * fill; note += (src ? 'Short of ' : 'No source for ') + PRODUCTS[p].name.toLowerCase() + ': working by hand. '; }
  }
  if (eff < 0.95) note += `Efficiency ${(eff * 100).toFixed(0)}% (staff ${b.workers}/${requiredWorkers(b)}, cond ${b.condition.toFixed(0)}%). `;
  const q = clamp(0.6 * (25 + 0.75 * c.tech[b.product!]) + 0.4 * inputQ + 3 * (fx?.qa ?? 0), 5, 100);
  addStock(b.stock, max, q);
  b.report.produced = Math.round(max * 10) / 10; if (max > 0) b.report.quality = Math.round(q); b.report.note = note.trim();
}

/** Supermarket variety bonus: with more than 4 goods on sale (shelf stocked and priced) customers like it more: +20% for 5, +40% for 6. */
export const SUPER_MIN_GOODS = 4, SUPER_BONUS_PER_GOOD = 0.2;
export const superGoods = (b: Building) => b.slots.filter(x => x.product && x.stock.qty >= 0.5 && x.price > 0).length;
export const superBonus = (b: Building) => b.super ? Math.max(0, superGoods(b) - SUPER_MIN_GOODS) * SUPER_BONUS_PER_GOOD : 0;

function storeBuy(s: GameState, b: Building) {
  const staffEff = staffFactor(b.workers, requiredWorkers(b));
  for (const sl of b.slots) {
    if (!sl.product) continue;
    sl.stock.qty *= 1 - PRODUCTS[sl.product].spoil;
    const room = slotCapacity(b, sl.product) * 1.5 - sl.stock.qty;
    const want = Math.min(sl.order, room);
    if (want > 0 && staffEff > 0) { const got = acquire(s, b, sl.product, want, sl.source); addStock(sl.stock, got.qty, got.q); }
  }
}

const dem: Record<string, number> = {}; // demand of the month being processed (filled by retail)
function recordSales(s: GameState) {
  s.salesHist ??= {};
  for (const p of PRODUCT_LIST) {
    const h = (s.salesHist[p.id] ??= { l: [], w: [], d: [] }); const sum = (m?: Record<string, number>) => Math.round(Object.values(m ?? {}).reduce((a, b) => a + b, 0));
    h.l.push(sum(s.sales?.local[p.id])); h.w.push(sum(s.sales?.world[p.id])); h.d.push(Math.round(dem[p.id] ?? 0));
    for (const k of ['l', 'w', 'd'] as const) if (h[k].length > 36) h[k].shift();
  }
  for (const k of Object.keys(dem)) delete dem[k];
}
/** What downtown (index 0) and suburban (index 1) shoppers buy, relative to the average: offices and flats downtown, families with cars and gardens in the suburbs. */
export const TASTE: Partial<Record<ProductId, [number, number]>> = {
  clothing: [1.4, 0.8], shoes: [1.3, 0.85], phones: [1.4, 0.8], computers: [1.3, 0.85], pastry: [1.35, 0.85], pharma: [1.15, 0.9], hygiene: [1.1, 0.95], tvs: [1.0, 1.0],
  furniture: [0.65, 1.3], appliances: [0.7, 1.25], cars: [0.55, 1.4], fuel: [0.6, 1.35], cleaning: [0.8, 1.15], bread: [0.9, 1.08], meat: [0.85, 1.12], dairy: [0.9, 1.08], beverages: [1.1, 0.95], alcohol: [1.25, 0.88], machinery: [0.5, 1.25], ultrafood: [0.9, 1.1], canned: [0.95, 1.05],
};
const splitCache = new WeakMap<object, number[]>();
/** Share of a city's people who live downtown (town hall and downtown tiles count x3, suburbs x1; towns are all suburb). */
export function cityPopSplit(s: TileCtx, city: number): number {
  const w = s.world; if (!w) return 0.5; let m = splitCache.get(w);
  if (!m) { const d = s.cities.map(() => 0), t = s.cities.map(() => 0); for (let i = 0; i < w.tiles.length; i++) { const ch = w.tiles[i]; if (ch !== 'u' && ch !== 'l' && ch !== 'h' && ch !== 's' && ch !== 'w') continue; const c = nearestCity(s.cities, i); const k = ch === 's' || ch === 'w' ? 1 : 3; t[c] += k; if (ch !== 's' && ch !== 'w') d[c] += k; } m = d.map((x, i) => (t[i] ? x / t[i] : 0)); splitCache.set(w, m); }
  return m[city] ?? 0.5;
}
/** Share of the people in a building's area who live downtown. */
export function areaPopSplit(s: TileCtx, b: { idx: number }): number {
  const w = s.world; if (!w) return 0.5; const x0 = b.idx % w.w, y0 = Math.floor(b.idx / w.w); let d = 0, t = 0;
  for (let dy = -AREA_R; dy <= AREA_R; dy++) for (let dx = -AREA_R; dx <= AREA_R; dx++) { const x = x0 + dx, y = y0 + dy; if (x < 0 || y < 0 || x >= w.w || y >= w.h) continue; const i = y * w.w + x, p = tilePop(s, i); t += p; if (w.tiles[i] === 'u' || w.tiles[i] === 'l' || w.tiles[i] === 'h') d += p; }
  return t > 0 ? d / t : 0;
}
// ---- city growth
// ---- shoppers live on city tiles: every downtown / suburb tile buys from the shops that reach it
/** How far a shop's customers come from (tiles, square): small shops serve their neighbourhood, supermarkets and malls draw from further away. */
export const shopReach = (b: { super?: boolean; mall?: string | null }): number => (b.mall ? 5 : b.super ? 4 : 3);
const tileCache = new WeakMap<object, { idx: number; k: 0 | 1 }[][]>();
/** Urban tiles (downtown, luxury, town hall, suburb) of every city; k = 0 downtown, 1 suburb (they buy different things, see TASTE). */
export function urbanTiles(s: TileCtx): { idx: number; k: 0 | 1 }[][] {
  const w = s.world!; let m = tileCache.get(w); if (m) return m; m = s.cities.map(() => []);
  for (let i = 0; i < w.tiles.length; i++) { const ch = w.tiles[i]; if (ch === 'u' || ch === 'l' || ch === 'h' || ch === 's' || ch === 'w') m[nearestCity(s.cities, i)].push({ idx: i, k: ch === 's' || ch === 'w' ? 1 : 0 }); }
  tileCache.set(w, m); return m;
}

/** Cities grow on goods: a tile grows when the shops that reach it actually sell its people their everyday products (and luxuries for the top tier),
 *  and when there is production (work) nearby. Bought from the generic market (imports) does not count: only real shops do. */
export const GROW_BASIC: ProductId[] = ['bread', 'dairy', 'meat', 'fuel', 'furniture', 'clothing'];
export const GROW_LUX: ProductId[] = ['alcohol', 'computers', 'phones', 'tvs', 'cars'];
export const GROW_ALL: ProductId[] = [...GROW_BASIC, ...GROW_LUX];
/** A need counts as met when real shops sold the tile GROW_SHARE of its demand; luxury downtown needs GROW_LUX_FILL of its luxuries met.
 *  Production within PROD_R tiles (value per month) makes growth likelier: PROD_REF of it doubles the chance, up to x3. */
export const GROW_SHARE = 0.15, GROW_LUX_FILL = 0.3, PROD_R = 6, PROD_REF = 400000;
/** Units of each growth product the shops sold to a tile last month, and what the tile wanted. */
export function tileServed(s: { served?: Record<string, number[]> }, idx: number): { product: ProductId; got: number; need: number }[] {
  const a = s.served?.[String(idx)]; const n = GROW_ALL.length;
  return GROW_ALL.map((p, i) => ({ product: p, got: a?.[i] ?? 0, need: (a?.[n + i] ?? 0) * GROW_SHARE }));
}
const fillOf = (x: { got: number; need: number }[]) => x.length ? x.reduce((a, y) => a + (y.need > 0 ? Math.min(1, y.got / y.need) : 1), 0) / x.length : 1;
/** Value of last month's production (raw materials and goods, not shops) around a tile. */
type Producer = { idx: number; value: number };
export const producersOf = (s: { buildings: Record<string, Building> } | { buildings: Building[] }): Producer[] =>
  (Array.isArray(s.buildings) ? s.buildings : Object.values(s.buildings)).filter(b => !b.building && b.product && b.type !== 'store' && b.type !== 'rd' && b.type !== 'mall' && b.report?.produced > 0).map(b => ({ idx: b.idx, value: b.report.produced * PRODUCTS[b.product!].basePrice }));
export function prodNear(w: { w: number }, prods: Producer[], idx: number): number {
  const x0 = idx % w.w, y0 = (idx / w.w) | 0; let v = 0; for (const p of prods) if (Math.abs((p.idx % w.w) - x0) <= PROD_R && Math.abs(((p.idx / w.w) | 0) - y0) <= PROD_R) v += p.value; return v;
}
const prodBonus = (v: number) => Math.min(2, v / PROD_REF);

/** Cities grow one tile at a time. A city tile that meets its needs (its shops sell it everyday goods, clean air, a wealthy city) may expand into open land
 *  around it as a new suburb; suburbs that are well served become downtown; downtown that also gets luxuries, is rich, clean and fully built-up becomes
 *  luxury downtown. Production nearby makes all of it likelier. Suburbs also pop up now and then next to roads near a city. Only unowned open land is taken;
 *  tiles with factories never change. */
export const GROW = { base: 0.0015, expand: 0.3, down: 0.5, lux: 0.6, roadChance: 0.08 }; // needs met = share of the everyday goods that the shops reaching a tile sold to it
/** Needs met (0..1) of a tile: how much of its everyday goods the shops reaching it sold (air and city wealth are not needs: a player cannot improve them). */
function tileNeedScore(s: TileCtx & { served?: Record<string, number[]> }, idx: number, poll: number): { score: number; basic: number; lux: number; air: number; wealthN: number } {
  const city = s.cities[nearestCity(s.cities, idx)]; const sv = tileServed(s, idx);
  const basic = fillOf(sv.slice(0, GROW_BASIC.length)), lux = fillOf(sv.slice(GROW_BASIC.length)), air = 1 - Math.min(1, poll / 0.9), wealthN = clamp((city.wealth - 0.6) / 0.9, 0, 1);
  return { score: basic, basic, lux, air, wealthN };
}
function growCities(s: GameState) {
  const w = s.world; if (!w) return; const W = w.w, H = w.h; const tiles = [...w.tiles]; const ctx = s as unknown as TileCtx; const poll = pollutionField(ctx); const rm = railMap(ctx);
  const occupied = new Set<number>(), fixed = new Set<number>(); const prods = producersOf(s);
  for (const b of Object.values(s.buildings)) { occupied.add(b.idx); for (const e of b.expand ?? []) occupied.add(e); if (b.type === 'factory' || b.building) fixed.add(b.idx); }
  for (const v of s.vacant ?? []) { occupied.add(v.idx); fixed.add(v.idx); }
  const nbr8 = (i: number): number[] => { const x = i % W, y = (i / W) | 0, o: number[] = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) o.push((y + dy) * W + x + dx); return o; };
  const nbr4 = (i: number): number[] => nbr8(i).filter(j => Math.abs((j % W) - (i % W)) + Math.abs(((j / W) | 0) - ((i / W) | 0)) === 1);
  const freeLand = (j: number) => (tiles[j] === 'g' || tiles[j] === 'f') && !s.lots[lotKey(j)] && !occupied.has(j) && !rm?.on[j];
  const lists = urbanTiles(ctx).map(l => l.map(t => t.idx));
  const memo = new Map<number, ReturnType<typeof tileNeedScore> & { bonus: number }>();
  const need = (i: number) => { let g = memo.get(i); if (!g) memo.set(i, g = { ...tileNeedScore(s, i, poll[i]), bonus: prodBonus(prodNear(w, prods, i)) }); return g; };
  const score: Record<string, number> = {};
  let roads: number[][] | null = null; let changed = false;
  for (const c of s.cities) {
    const mine = lists[c.id]; if (!mine.length) continue; const weight = mine.reduce((n, i) => n + (URBAN_W[tiles[i]] ?? 1), 0);
    for (const i of mine) score[i] = Math.round(need(i).score * 100);
    const cityProd = prods.reduce((n, p) => n + (nearestCity(s.cities, p.idx) === c.id ? p.value : 0), 0);
    const wealthN = clamp((c.wealth - 0.6) / 0.9, 0, 1); const want = mine.length * GROW.base * (0.5 + wealthN) * 2 * (1 + Math.min(2, cityProd / (PROD_REF * 5)));
    const B = clamp(Math.floor(want) + (rnd(s) < want % 1 ? 1 : 0), 0, 10); // expected growth per turn, rounded at random
    const n = { exp: 0, down: 0, lux: 0, road: 0, town: 0 };
    const pick = (cand: number[], cap: number, p: number, apply: (i: number) => boolean, key: 'exp' | 'down' | 'lux' | 'town') => { shuffle(s, cand); for (const i of cand) { if (n[key] >= cap) break; if (rnd(s) < Math.min(0.95, p * (1 + need(i).bonus)) && apply(i)) n[key]++; } };
    const urbN = (i: number) => nbr8(i).filter(j => 'ulh'.includes(tiles[j])).length;
    if (!c.town) pick(mine.filter(i => tiles[i] === 'u' && !fixed.has(i) && urbN(i) >= 6 && need(i).score >= GROW.lux && need(i).lux >= GROW_LUX_FILL), Math.ceil(B * 0.4), 0.25, i => { tiles[i] = 'l'; return true; }, 'lux');
    // a growing suburb spreads into open land next to it; with no open land left around it (every tile around is built, owned, water, mountain...) it turns into downtown
    const freeAround = (i: number) => nbr8(i).filter(freeLand);
    pick(mine.filter(i => tiles[i] === 's' && need(i).score >= GROW.expand && (freeAround(i).some(j => nearestCity(s.cities, j) === c.id) || (!c.town && !fixed.has(i)))), B, 0.35, i => {
      if (n.exp + n.down >= B) return false;
      const t = shuffle(s, freeAround(i).filter(j => nearestCity(s.cities, j) === c.id))[0];
      if (t != null) { tiles[t] = 's'; n.exp++; return false; }
      if (c.town || fixed.has(i)) return false; tiles[i] = 'u'; n.down++; return false;
    }, 'exp');
    pick(mine.filter(i => tiles[i] === 'w' && !fixed.has(i) && need(i).score >= GROW.down && nbr8(i).filter(j => 'wsulh'.includes(tiles[j])).length >= 2), Math.ceil(B * 0.8), 0.3, i => { tiles[i] = 's'; return true; }, 'town'); // a town that grew together with others becomes a suburb
    pick(mine.filter(i => tiles[i] !== 's' && need(i).score >= GROW.expand && nbr4(i).some(freeLand)), B, 0.35, i => { const t = shuffle(s, nbr4(i).filter(freeLand))[0]; if (t == null || nearestCity(s.cities, t) !== c.id) return false; tiles[t] = tiles[i] === 'w' ? 'w' : 's'; return true; }, 'exp'); // downtown and towns spread outwards
    if (c.wealth >= 0.75 && rnd(s) < GROW.roadChance) { // a new suburb beside a road near the city
      if (!roads) { roads = s.cities.map(() => []); for (let i = 0; i < tiles.length; i++) if (tiles[i] === 'r') roads[nearestCity(s.cities, i)].push(i); }
      const R = roads[c.id], reach = 8 + c.radius * 2, cx = c.x / WORLD_SCALE, cy = c.y / WORLD_SCALE;
      for (let k = 0; k < 25 && R.length && !n.road; k++) { const r = R[Math.floor(rnd(s) * R.length)]; if (Math.hypot((r % W) - cx, ((r / W) | 0) - cy) > reach) continue; const t = shuffle(s, nbr4(r).filter(freeLand))[0]; if (t != null && nearestCity(s.cities, t) === c.id) { tiles[t] = 's'; n.road = 1; } }
    }
    const added = n.exp + n.road + 2 * n.down + 2 * n.lux;
    if (added || n.town) changed = true;
    if (added) { c.pop = Math.round(c.pop * (1 + 0.3 * added / Math.max(1, weight))); }
    if (added || n.town) s.news.push({ turn: s.turn, kind: 'good', tag: 'growth', text: `${c.name} grows: ` + [n.town ? `${n.town} town${n.town > 1 ? 's' : ''} grew into suburbs` : '', n.exp + n.road ? `${n.exp + n.road} new suburb block${n.exp + n.road > 1 ? 's' : ''}` : '', n.down ? `${n.down} suburb${n.down > 1 ? 's' : ''} became downtown` : '', n.lux ? `${n.lux} district${n.lux > 1 ? 's' : ''} turned into luxury downtown` : ''].filter(Boolean).join(', ') + '.' });
  }
  // a new town appears beside a road, away from other settlements (anywhere on the map, not only near cities)
  const townCount = (() => { let n = 0; for (const ch of tiles) if (ch === 'w') n++; return n; })();
  if (townCount < 10 + s.turn / 2 && rnd(s) < 0.3) {
    const allRoads: number[] = roads ? roads.flat() : (() => { const o: number[] = []; for (let i = 0; i < tiles.length; i++) if (tiles[i] === 'r') o.push(i); return o; })();
    const near = (t: number) => { const x0 = t % W, y0 = (t / W) | 0; for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = x0 + dx, y = y0 + dy; if (x >= 0 && y >= 0 && x < W && y < H && 'ulshw'.includes(tiles[y * W + x])) return true; } return false; };
    for (let k = 0; k < 40 && allRoads.length; k++) {
      const r = allRoads[Math.floor(rnd(s) * allRoads.length)]; const t = shuffle(s, nbr4(r).filter(freeLand))[0]; if (t == null || near(t)) continue;
      tiles[t] = 'w'; changed = true; const cid = nearestCity(s.cities, t), cc = s.cities[cid];
      cc.pop = Math.round(cc.pop * (1 + 0.3 / Math.max(1, lists[cid].reduce((n, i) => n + (URBAN_W[tiles[i]] ?? 1), 0))));
      s.news.push({ turn: s.turn, kind: 'good', tag: 'growth', text: `A new town appears along the road near ${cc.name}.` }); break;
    }
  }
  s.tileScore = score;
  if (changed) s.world = { ...w, tiles: tiles.join(''), rev: (w.rev ?? 0) + 1 };
}

export interface GrowthItem { label: string; have: number; need: number; max: number; text: string; ok: boolean; product?: ProductId }
/** What a city tile still lacks to grow (the tile panel): goods its shops sold it last month vs what it needs, production nearby, clean air, a wealthy city. */
export function growthStatus(s: TileCtx & { served?: Record<string, number[]>; buildings: Record<string, Building>; lots?: Record<string, unknown> }, idx: number): { stage: string; shops: number; items: GrowthItem[] } | null {
  const w = s.world; const ch = w?.tiles[idx]; if (!w || !ch || !'ulsw'.includes(ch)) return null;
  const city = s.cities[nearestCity(s.cities, idx)]; const poll = tilePollution(s, idx); const t = tileNeedScore(s, idx, poll); const sv = tileServed(s, idx);
  const near = prodNear(w, producersOf(s), idx); const x0 = idx % w.w, y0 = (idx / w.w) | 0;
  const shops = Object.values(s.buildings).filter(b => b.type === 'store' && !b.building && Math.abs((b.idx % w.w) - x0) <= shopReach(b) && Math.abs(((b.idx / w.w) | 0) - y0) <= shopReach(b)).length;
  let neigh = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && x0 + dx >= 0 && y0 + dy >= 0 && x0 + dx < w.w && y0 + dy < w.h && 'ulh'.includes(w.tiles[(y0 + dy) * w.w + x0 + dx])) neigh++;
  const pct = (x: number) => Math.round(x * 100) + '%'; const n0 = (x: number) => Math.round(x).toLocaleString('en-US');
  const item = (label: string, have: number, need: number, max: number, text: string, product?: ProductId): GrowthItem => ({ label, have, need, max, text, ok: have >= need - 1e-9, product });
  const prod = (x: { product: ProductId; got: number; need: number }) => item(PRODUCTS[x.product].name, x.got, x.need, Math.max(x.need, 1e-9), n0(x.got) + ' / ' + n0(x.need) + ' ' + PRODUCTS[x.product].unit, x.product);
  const thr = ch === 'u' ? GROW.lux : ch === 's' ? GROW.down : ch === 'w' ? GROW.down : GROW.expand;
  const stage = ch === 'l' ? 'Luxury downtown: the top tier' : ch === 'u' ? 'Next: luxury downtown' : ch === 'w' ? 'Next: suburb' : city.town ? 'Towns only grow outwards' : ch === 's' ? 'Grows into open land; with none left it becomes downtown' : 'Next: downtown';
  const items: GrowthItem[] = sv.slice(0, GROW_BASIC.length).map(prod);
  if (ch === 'u' && !city.town) items.push(...sv.slice(GROW_BASIC.length).map(prod));
  items.push(item('Production nearby', near, 0, PROD_REF * 2, '$' + n0(near) + ' / mo · ' + (prodBonus(near) > 0.005 ? '+' + pct(prodBonus(near)) + ' chance' : 'no bonus')));
  items.push(item('Everyday goods covered', t.score, thr, 1, pct(t.score) + ' of ' + pct(thr)));
  if (ch === 'u' && !city.town) items.push(item('Luxuries sold here', t.lux, GROW_LUX_FILL, 1, pct(t.lux) + ' of ' + pct(GROW_LUX_FILL)));
  if (ch === 's') { // open land around it decides how a growing suburb grows
    const busy = new Set(Object.values(s.buildings).map(b => b.idx)); let free = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const x = x0 + dx, y = y0 + dy; if (x < 0 || y < 0 || x >= w.w || y >= w.h) continue; const j = y * w.w + x; if ((w.tiles[j] === 'g' || w.tiles[j] === 'f') && !s.lots?.[String(j)] && !busy.has(j)) free++; }
    items.push(item('Open land around it', free, 0, 8, free > 0 ? free + ' tiles: a new suburb grows there' : 'none: it becomes downtown'));
  }
  if (ch === 'u' && !city.town) items.push(item('Built-up neighbours', neigh, 6, 8, neigh + ' / 6'));
  return { stage, shops, items };
}

function retail(s: GameState) {
  s.sales ??= { local: {}, world: {} }; s.sales.local = {};
  const season = (p: ProductId) => p === 'fuel' ? 1 + 0.1 * Math.sin((s.turn % 12) / 12 * 2 * Math.PI) : 1;
  const ctx = s as unknown as TileCtx; const W = s.world!.w; const NG = GROW_ALL.length; const gi = new Map(GROW_ALL.map((p, i) => [p, i] as const));
  const served: Record<string, number[]> = {};
  const stores = Object.values(s.buildings).filter(b => b.type === 'store' && !idle(s, b) && !s.companies.find(c => c.id === b.owner)!.bankrupt);
  for (const b of stores) for (const sl of b.slots) sl.sold = sl.revenue = sl.lost = 0;
  const tilesBy = urbanTiles(ctx);
  type E = { sl: StoreSlot; b: Building; price: number; attr: number; cap: number; sold: number; req: number; lost: number };
  for (const city of s.cities) {
    const T = tilesBy[city.id]; if (!T.length) continue;
    const pops = T.map(t => tilePop(ctx, t.idx));
    // every tile is reached by the shops within their reach (any owner, any city)
    const reach: number[][] = T.map(t => { const x = t.idx % W, y = (t.idx / W) | 0, out: number[] = []; stores.forEach((b, k) => { const r = shopReach(b); if (Math.abs((b.idx % W) - x) <= r && Math.abs(((b.idx / W) | 0) - y) <= r) out.push(k); }); return out; });
    const local = [...new Set(reach.flat())];
    for (const p of PRODUCT_LIST) {
      if (p.kind !== 'consumer') continue;
      const refP = retailRef(s, city.id, p.id); const lux = p.basePrice > 500 ? 1.5 : 0.5; const taste = TASTE[p.id] ?? [1, 1];
      const f = p.demandPerK! / 1000 * Math.pow(city.wealth, lux) * s.market[p.id].demand * season(p.id);
      const es = new Map<number, E>();
      for (const k of local) {
        const b = stores[k]; const sl = b.slots.find(x => x.product === p.id); if (!sl || sl.stock.qty < 0.5 || sl.price <= 0) continue;
        const c = s.companies.find(x => x.id === b.owner)!; const staffEff = staffFactor(b.workers, requiredWorkers(b)) * moraleFactor(s, b);
        const mallB = b.mall ? MALL_TRAFFIC * (0.8 + 0.2 * (s.buildings[b.mall]?.condition ?? 100) / 100) : 1;
        const attr = (1 + DECOR_ATTRACT * (b.decor ?? 0) / 100) * Math.pow(refP / sl.price, 2.2) * Math.pow(0.4 + sl.stock.q / 80, 1.3) * (1 + c.brand[p.id] / (b.mall ? 60 / MALL_BRAND_BOOST : 60)) * areaInfo(s, b).factor * mallB * (0.5 + 0.5 * staffEff) * (b.super ? 1 + superBonus(b) : 1);
        // a shop already selling this product to another city's tiles shares the capacity left
        const prev = sl.sold; es.set(k, { sl, b, price: sl.price, attr, cap: Math.max(0, Math.min(sl.stock.qty, slotCapacity(b, p.id) * Math.max(0.1, staffEff) * 1.3) - prev), sold: 0, req: 0, lost: 0 });
      }
      const npcAttr = Math.pow(1 / NPC_SHARE_MARKUP, 2.2) * Math.pow(0.4 + 40 / 80, 1.3) * 1.15, npcPrice = refP * NPC_SHARE_MARKUP; let npcSold = 0;
      const g = gi.get(p.id);
      const rem = T.map((t, i) => {
        const d = pops[i] * f * taste[t.k]; dem[p.id] = (dem[p.id] ?? 0) + d;
        if (g !== undefined) { const a = (served[t.idx] ??= new Array(2 * NG).fill(0)); a[NG + g] += d; }
        const rs = reach[i].map(k => es.get(k)).filter((e): e is E => !!e);
        const sumA = rs.reduce((x, e) => x + e.attr, npcAttr), avgP = rs.reduce((x, e) => x + e.price * e.attr, npcPrice * npcAttr) / sumA;
        return d * clamp(Math.pow(refP / avgP, 1.2), 0.25, 1.8);
      });
      for (let pass = 0; pass < 5; pass++) {
        for (const e of es.values()) e.req = 0;
        const act = T.map((_, i) => rem[i] > 0.01 ? reach[i].map(k => es.get(k)).filter((e): e is E => !!e && e.cap - e.sold > 0.01) : []);
        let any = false;
        T.forEach((_, i) => { if (rem[i] <= 0.01) return; any = true; const tot = act[i].reduce((x, e) => x + e.attr, npcAttr); for (const e of act[i]) e.req += rem[i] * e.attr / tot; });
        if (!any) break;
        const ratio = new Map<E, number>(); for (const e of es.values()) if (e.req > 0) { const r = Math.min(1, (e.cap - e.sold) / e.req); ratio.set(e, r); if (r < 1) e.lost += e.req * (1 - r); e.sold += e.req * r; }
        T.forEach((t, i) => {
          if (rem[i] <= 0.01) return; const tot = act[i].reduce((x, e) => x + e.attr, npcAttr); let got = 0;
          for (const e of act[i]) got += rem[i] * e.attr / tot * (ratio.get(e) ?? 0);
          const npc = rem[i] * npcAttr / tot; npcSold += npc; rem[i] -= got + npc;
          if (g !== undefined && got > 0) served[t.idx][g] += got;
        });
      }
      const sh = (s.sales!.local[p.id] ??= {}); sh.npc = (sh.npc ?? 0) + npcSold;
      for (const e of es.values()) {
        const sl = e.sl, b = e.b, c = s.companies.find(x => x.id === b.owner)!;
        const n = Math.min(e.sold, sl.stock.qty); if (n <= 0 && e.lost <= 0) continue; sl.stock.qty -= n; sh[c.id] = (sh[c.id] ?? 0) + n;
        sl.sold = Math.round((sl.sold + n) * 10) / 10; sl.revenue += n * sl.price; sl.lost = Math.round(sl.lost + e.lost);
        if (n >= 0.5 && sl.product) { const k = c.id + ':' + sl.product; s.sold ??= {}; if (!s.sold[k]) { s.sold[k] = 1; s.news.push({ turn: s.turn, kind: 'good', tag: 'product', text: `${c.name} starts selling ${PRODUCTS[sl.product].name.toLowerCase()} in ${s.cities[b.city].name}.` }); } }
        c.cash += n * sl.price; c.ledger.revenue += n * sl.price; b.report.revenue += n * sl.price; b.report.sold += n; b.report.soldLocal = (b.report.soldLocal ?? 0) + n;
      }
    }
  }
  for (const a of Object.values(served)) for (let i = 0; i < a.length; i++) a[i] = Math.round(a[i] * 10) / 10;
  s.served = served;
  for (const b of Object.values(s.buildings)) if (b.type === 'store') b.report.note = b.slots.filter(x => x.product).map(x => `${PRODUCTS[x.product!].name}: sold ${x.sold}`).join(' · ');
}

function closeBooks(s: GameState, c: Company) {
  const L = c.ledger;
  for (const b of Object.values(s.buildings)) {
    if (b.owner !== c.id) continue;
    if (idle(s, b)) { b.report.wages = b.report.maint = 0; continue; }
    const def = BUILDINGS[b.type];
    const mb = mgrBonus(s, b); const wages = Math.round(b.workers * b.wage * (1 - mb.exp)); const maint = Math.round(b.invested * def.maintPct / 100 * b.maint / 100 * (1 - mb.exp));
    L.wages += wages; L.maint += maint; b.report.wages = wages; b.report.maint = maint + (b.mall ? b.rent ?? 0 : 0);
    b.hist = [...(b.hist ?? []), Math.round(b.report.revenue - b.report.purchases - wages - maint)].slice(-12);
    b.prodHist = [...(b.prodHist ?? []), { p: Math.round(b.report.produced * 10) / 10, s: Math.round(b.report.sold * 10) / 10, q: b.report.quality }].slice(-24);
    b.condition = clamp(b.condition + (b.maint / 100) * 2.5 - 2, 0, 100);
    const wr = b.wage / cityWage(s, b.city);
    if (wr < 0.9 && b.workers > 0) { const quit = Math.floor(b.workers * (0.9 - wr) * 0.6 + rnd(s)); if (quit > 0) { if (b.type === 'factory' && b.layout) removeWorkers(b, quit); else b.workers = Math.max(0, b.workers - quit); b.report.note += ` ${quit} workers quit over low pay.`; } }
  }
  for (const m of c.staff ?? []) L.wages += m.salary;
  const adPower: Partial<Record<ProductId, number>> = {};
  for (const x of s.adContracts ?? []) if (x.owner === c.id) { L.ads += x.fee; adPower[x.product] = (adPower[x.product] ?? 0) + x.fee * (MEDIA.find(m => m.id === x.media)?.lev ?? 1); }
  for (const p of PRODUCT_LIST) c.brand[p.id] = Math.min(100, c.brand[p.id] * 0.92 + 0.8 * Math.sqrt((adPower[p.id] ?? 0) / 100));
  for (const b of Object.values(s.buildings)) if (b.owner === c.id && b.type === 'store' && (b.decor ?? 0) > 0) { // decorated shops build the brand of what they sell
    if (!b.building) for (const sl of b.slots) if (sl.product) c.brand[sl.product] = Math.min(100, c.brand[sl.product] + DECOR_BRAND * b.decor! / 100);
    b.decor = b.decor! * (1 - DECOR_FADE); if (b.decor < 0.5) b.decor = 0;
  }
  for (const b of Object.values(s.buildings)) if (b.owner === c.id && b.type === 'factory' && b.product) c.brand[b.product] = Math.min(100, c.brand[b.product] + 2 * moduleStats(b).brand);
  const loanInterest = serviceLoans(s, c);
  L.interest = Math.round(loanInterest + Math.max(0, -c.cash) * 0.02 - Math.max(0, c.cash) * 0.0025);
  const pretax = L.revenue - L.purchases - L.transport - L.wages - L.maint - L.ads - L.interest;
  let taxable = pretax - c.lossCarry; c.lossCarry = 0;
  if (taxable < 0) { c.lossCarry = -taxable; taxable = 0; }
  let taxCut = 0; if (c.taxBreak) { if (s.turn >= c.taxBreak.until) { c.news.push({ turn: s.turn, text: `The tax break from ${s.cities[c.taxBreak.city].name} has ended.` }); c.taxBreak = undefined; } else if (Object.values(s.buildings).some(b => b.owner === c.id && b.city === c.taxBreak!.city)) taxCut = c.taxBreak.cut; }
  L.tax = Math.round(taxable * 0.25 * (1 - taxCut));
  L.profit = pretax - L.tax;
  c.cash -= L.wages + L.maint + L.ads + L.interest + L.tax;
  c.cash = Math.round(c.cash);
  const nw = netWorth(s, c);
  c.history.push({ turn: s.turn, cash: c.cash, netWorth: nw, revenue: Math.round(L.revenue), profit: Math.round(L.profit), debt: c.debt });
  if (c.history.length > 240) c.history.shift();
  updatePrice(s, c);
  if (s.turn % 12 === 11) fiscalYearEnd(s, c);
  if (c.cash < -overdraftLimit(s, c) * 0.95) c.news.push({ turn: s.turn, text: 'You are at your overdraft limit! Purchases are being refused.' });
  if (nw < 0) c.negMonths++; else c.negMonths = 0;
  if (c.negMonths >= 3) {
    c.bankrupt = true;
    for (const b of Object.values(s.buildings)) if (b.owner === c.id && (b.mall || !s.buildings[b.id])) delete s.buildings[b.id]; else if (b.owner === c.id) { s.vacant ??= []; s.vacant.push({ id: 'v' + s.nextId++, type: b.type, city: b.city, idx: b.idx, product: b.product, cond: Math.round(b.condition), land: s.lots[lotKey(b.idx)]?.paid ?? lotPrice(s, b.idx), build: Math.round(b.invested * 0.5 / 100) * 100, listedTurn: s.turn, origin: 'bankrupt' }); delete s.buildings[b.id]; }
    for (const [k, l] of Object.entries(s.lots)) if (l.owner === c.id) delete s.lots[k];
    s.news.push({ turn: s.turn, text: `${c.name} has gone bankrupt and its assets were liquidated!`, kind: 'bad' });
  }
}

function checkEnd(s: GameState) {
  const live = s.companies.filter(c => !c.bankrupt);
  const nws = live.map(c => ({ c, nw: netWorth(s, c) })).sort((a, b) => b.nw - a.nw);
  const humans = live.filter(c => !c.isAI).length;
  if (s.settings.targetNetWorth > 0 && nws[0] && nws[0].nw >= s.settings.targetNetWorth) { s.finished = true; s.winner = nws[0].c.id; s.endReason = `${nws[0].c.name} reached the net worth target.`; }
  else if (s.turn >= s.settings.maxMonths) { s.finished = true; s.winner = nws[0]?.c.id; s.endReason = 'Time is up — richest company wins.'; }
  else if (s.companies.some(c => !c.isAI) && humans === 0) { s.finished = true; s.winner = nws[0]?.c.id; s.endReason = 'All human companies went bankrupt.'; }
  if (s.finished) s.news.push({ turn: s.turn, text: `GAME OVER: ${s.endReason}`, kind: 'info' });
}

// ---------------------------------------------------------------- AI
function chainOf(p: ProductId, out: ProductId[] = []): ProductId[] {
  for (const k of Object.keys(PRODUCTS[p].recipe) as ProductId[]) chainOf(k, out);
  if (!out.includes(p)) out.push(p); return out;
}
function freeLot(s: GameState, city: number, terr: Terrain[], preferCenter: boolean): number {
  const W = s.world!.w, H = s.world!.h, c = s.cities[city];
  const cx = Math.floor(c.x / WORLD_SCALE), cy = Math.floor(c.y / WORLD_SCALE);
  const R = preferCenter ? Math.ceil(c.radius * 1.5) : 130; let best = -1, bd = 1e9;
  for (let y = Math.max(0, cy - R); y <= Math.min(H - 1, cy + R); y++) for (let x = Math.max(0, cx - R); x <= Math.min(W - 1, cx + R); x++) {
    const i = y * W + x; if (!terr.includes(s.world!.tiles[i] as Terrain) || s.lots[lotKey(i)]) continue;
    const d = Math.hypot(x - cx, y - cy) + rnd(s) * (preferCenter ? 2 : 10);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
function tryBuild(s: GameState, c: Company, btype: BuildingType, product: ProductId, cityPref?: number, grid?: number): Building | null {
  const def = BUILDINGS[btype];
  const cities = shuffle(s, s.cities.map(x => x.id)); if (cityPref != null) cities.unshift(cityPref);
  for (const city of cities) {
    // factories and labs go on open land at the edge of town: building inside the urban area (downtown, suburb, town) is too expensive
    const terr = btype === 'store' ? def.terrain : def.terrain.filter(t => !'ulsw'.includes(t));
    const idx = freeLot(s, city, terr, btype === 'store'); if (idx < 0) continue;
    const r = applyAction(s, c.id, { type: 'build', idx, btype, product, grid: btype === 'factory' ? grid : undefined });
    if ('ok' in r) return s.buildings[r.info!];
  }
  return null;
}
/** AI helper: pick the cheapest landed source (own factory, a rival factory that sells to everyone, or a harbour import). `external`: skip our own facilities. */
function bestSourceCost(s: GameState, buyer: Building, product: ProductId, external = false): { id: string; cost: number } {
  let best = '', bc = Infinity;
  for (const o of Object.values(s.buildings)) {
    if (o.type === 'store' || o.type === 'rd' || o.id === buyer.id) continue;
    const internal = o.owner === buyer.owner; if (internal && external) continue;
    if (o.type === 'factory') { // a factory delivers from its export cells
      o.layout?.forEach((c, i) => { if (c.m !== 'export' || c.product !== product) return; if (!internal && c.listPrice == null) return; const cost = (internal ? 0 : c.listPrice!) + haulCost(s, product, o.idx, buyer.idx); if (cost < bc) { bc = cost; best = o.id + '#' + i; } });
      continue;
    }
    if (o.product !== product) continue; if (!internal && o.listPrice == null) continue;
    const cost = (internal ? 0 : o.listPrice!) + haulCost(s, product, o.idx, buyer.idx);
    if (cost < bc) { bc = cost; best = o.id; }
  }
  for (const city of s.cities) { const gd = harbourStocks(s.cities, harbourId(city.id), product); if (!gd) continue; const cost = harbourGoodPrice(s, gd) + haulCost(s, product, cityTile(s, city), buyer.idx); if (cost < bc) { bc = cost; best = harbourId(city.id); } }
  return { id: best, cost: bc };
}
const bestSource = (s: GameState, buyer: Building, product: ProductId): string => bestSourceCost(s, buyer, product).id;
/** Our own producer of a product that piles up unsold stock (room to supply another shop). */
const spareProducer = (s: GameState, c: Company, p: ProductId): { b: Building; src: string } | undefined => { for (const b of companyBuildings(s, c.id)) { if (b.type === 'store' || b.type === 'rd' || b.building) continue; if (b.type === 'factory') { const L = b.layout ?? []; const i = L.findIndex((x, k) => x.m === 'export' && x.product === p && (x.stock?.qty ?? 0) > exportCap(b, k) * 0.5); if (i >= 0) return { b, src: b.id + '#' + i }; } else if (b.product === p && b.stock.qty > capacity(b) * 0.8) return { b, src: b.id }; } return undefined; };
/** AI shop shelf source: stay with our own factory while it keeps up; when the shelf ran dry (lost more than it sold) buy from outside if that still leaves a margin. */
function aiShelfSource(s: GameState, c: Company, st: Building, sl: StoreSlot): string {
  const p = sl.product!; const ref = retailRef(s, st.city, p); const cur = sl.source ? s.buildings[sl.source.split('#')[0]] : undefined; const own = !!cur && cur.owner === c.id;
  if (!sl.source) return bestSource(s, st, p);
  if (own && sl.lost > sl.sold) { const ext = bestSourceCost(s, st, p, true); if (ext.id && ext.cost <= ref * 0.92) return ext.id; }
  if (!own) { const sp = spareProducer(s, c, p); if (sp) return sp.src; }
  return sl.source;
}
const aiBtype = (p: ProductId): BuildingType => PRODUCTS[p].kind !== 'raw' ? 'factory' : p === 'timber' ? 'forest' : p === 'ore' ? 'mine' : p === 'copper' ? 'copper' : p === 'stone' ? 'quarry' : p === 'rare' ? 'rare' : p === 'oil' ? 'oil' : 'farm';
/** Day one: every AI company already runs the whole chain (raw material + factory) of three first/second-tier goods and sells them in two shops. */
function aiSeed(s: GameState, c: Company) {
  const start = c.cash; c.cash += 8_000_000;
  const cons = PRODUCT_LIST.filter(p => p.kind === 'consumer' && p.depth <= 1 && !p.research && p.id !== c.aiFocus && !['buildings', 'shoes', 'pastry', 'beverages', 'alcohol', 'machinery', 'ultrafood'].includes(p.id));
  const raws = (p: ProductId) => chainOf(p).filter(q => PRODUCTS[q].kind === 'raw');
  const picks: ProductId[] = [c.aiFocus!]; // three goods with different raw materials, so that no farm or mine has to feed two factories
  for (const p of shuffle(s, cons)) if (picks.length < 3 && picks.every(o => raws(o).every(r => !raws(p.id).includes(r)))) picks.push(p.id);
  const mine = () => companyBuildings(s, c.id);
  const home = shuffle(s, [...s.cities].sort((a, b) => b.pop - a.pop).slice(0, 5))[0].id;
  for (const p of picks) for (const q of chainOf(p)) if (!mine().some(b => b.product === q && b.type !== 'store')) tryBuild(s, c, aiBtype(q), q, home, 2); // the first factories are small: a 2x2 layout (line, import, export)
  const cities = shuffle(s, [...s.cities].sort((a, b) => b.pop - a.pop).slice(0, 6)).slice(0, 2);
  for (const city of cities) { const st = tryBuild(s, c, 'store', picks[0], city.id); if (!st) continue;
    picks.forEach((p, i) => { st.slots[i] = { ...st.slots[i], product: p, price: retailRef(s, st.city, p), order: 100, source: '' }; }); }
  for (const b of mine()) { b.building = 0; if (b.type !== 'store' && b.type !== 'rd') seedStock(b); }
  aiManage(s, c);
  c.cash = Math.round(start * 2); // working capital for the first months (the owners put it in), so the chain does not stall on day one
}
/** Day-one stock of a producer: a factory holds it in its export cell (that is where goods leave from). */
function seedStock(b: Building) { const q = Math.round(capacity(b) * 0.4); const ex = b.type === 'factory' ? (b.layout ?? []).find(c => c.m === 'export' && c.product === b.product) : undefined; if (ex) ex.stock = { qty: q, q: 55 }; else { b.stock.qty = q; b.stock.q = 55; } }
/** A human company starts with one small business that already runs and earns: a farm, a bakery fed by it and a shop selling the bread (built, staffed, stocked; it costs nothing).
 *  Everything can be changed or sold; the player's cash is untouched. */
export function seedStarter(s: GameState, c: Company): boolean {
  const start = c.cash; c.cash += 8_000_000; const mine = () => companyBuildings(s, c.id);
  const home = [...s.cities].filter(x => !x.town).sort((a, b) => b.pop - a.pop)[Math.min(3, s.cities.length - 1) > 2 ? 2 : 0].id; // a big but not the biggest city: cheaper land, still plenty of customers
  for (const q of chainOf('bread')) if (!mine().some(b => b.product === q && b.type !== 'store')) tryBuild(s, c, aiBtype(q), q, home, 2); // a small 2x2 factory to start with
  const st = tryBuild(s, c, 'store', 'bread', home); if (st) st.slots[0] = { ...st.slots[0], product: 'bread', price: retailRef(s, st.city, 'bread'), order: 100, source: '' };
  for (const b of mine()) { b.building = 0; if (b.type !== 'store' && b.type !== 'rd') seedStock(b); }
  aiManage(s, c);
  const ok = mine().length > 0; c.cash = start; return ok;
}
function aiManage(s: GameState, c: Company) {
  const skill = s.settings.aiSkill;
  for (const b of companyBuildings(s, c.id)) {
    const cw = cityWage(s, b.city);
    const need = requiredWorkers(b);
    const free = laborPool(s.cities[b.city]) - laborUsed(s, b.city);
    const target = b.type === 'rd' ? 0 : need;
    const w = Math.min(target, b.workers + Math.max(0, free));
    if (w !== b.workers || b.wage < cw) applyAction(s, c.id, { type: 'setStaff', id: b.id, workers: w, wage: Math.round(cw * 1.02) });
    if (b.maint < 90) b.maint = 100;
    if (b.type === 'store') {
      const prods = b.slots.filter(x => x.product);
      for (const sl of prods) {
        const ref = retailRef(s, b.city, sl.product!);
        const margin = 1.0 + 0.06 * (1.6 - skill) * 3; // easy AIs overprice a bit
        sl.price = round2(ref * clamp(margin * 0.98, 0.95, 1.12));
        sl.order = Math.round(slotCapacity(b, sl.product!) * 0.9);
        sl.source = aiShelfSource(s, c, b, sl);
      }
    } else if (b.product && b.type !== 'rd') {
      const base = PRODUCTS[b.product].basePrice * s.market[b.product].idx;
      b.listPrice = round2(base * (1.02 + (b.stock.qty > capacity(b) * 1.5 ? -0.08 : 0.04)));
      if (b.type === 'factory') { ensureLayout(b); for (const cell of b.layout!) if (cell.m === 'export' && cell.product) cell.listPrice = round2(PRODUCTS[cell.product].basePrice * s.market[cell.product].idx * (1.02 + ((cell.stock?.qty ?? 0) > exportCap(b, b.layout!.indexOf(cell)) * 0.8 ? -0.08 : 0.04))); }
      if (b.type === 'factory') { ensureLayout(b); for (const cell of b.layout!) if (cell.m === 'import' && cell.product) cell.source = bestSource(s, b, cell.product); }
      for (const p of Object.keys(SUPPLIES[b.type] ?? {}) as ProductId[]) { const best = bestSourceCost(s, b, p); b.sources[p] = best.id && best.cost < importPrice(s, p) ? best.id : 'market'; } // cheapest supplier, else the local market
    }
  }
}
/** AI helper for city growth: open a shop where many people live whose everyday needs no shop of ours covers, and stock it with the goods they lack
 *  (own products first, then whatever has a source). Returns true when it built one. */
function aiGrowthShop(s: GameState, c: Company): boolean {
  const w = s.world!; const W = w.w; const ctx = s as unknown as TileCtx; const mine = companyBuildings(s, c.id);
  const myShops = mine.filter(b => b.type === 'store' && !b.mall);
  if (myShops.length >= 2 + Math.floor(s.turn / 12) || c.cash < 1_200_000) return false;
  const reached = (idx: number) => myShops.some(b => Math.abs((b.idx % W) - (idx % W)) <= shopReach(b) && Math.abs(((b.idx / W) | 0) - ((idx / W) | 0)) <= shopReach(b));
  let best = -1, bv = 0;
  for (const T of urbanTiles(ctx)) for (let k = 0; k < T.length; k += 2) { // every other tile is enough to find the neighbourhoods in need
    const idx = T[k].idx; if (reached(idx)) continue;
    const sv = tileServed(s, idx).slice(0, GROW_BASIC.length); const gap = 1 - fillOf(sv);
    const v = tilePop(ctx, idx) * gap * (0.7 + 0.6 * rnd(s)); if (v > bv) { bv = v; best = idx; }
  }
  if (best < 0) return false;
  const x0 = best % W, y0 = (best / W) | 0; const lots: number[] = [];
  for (let r = 0; r <= 2 && !lots.length; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = x0 + dx, y = y0 + dy; if (x < 0 || y < 0 || x >= W || y >= w.h) continue; const i = y * W + x;
    if ('uslw'.includes(w.tiles[i]) && !s.lots[lotKey(i)] && !(s.vacant ?? []).some(v => v.idx === i)) lots.push(i);
  }
  const city = nearestCity(s.cities, best); const sv = tileServed(s, best); const own = new Set(mine.filter(b => b.type !== 'store').map(b => b.product));
  for (const idx of shuffle(s, lots)) {
    const here = { id: '', owner: c.id, idx } as Building; // where the shop would stand: decide what it can sell at a profit before building it
    const fillP = (p: ProductId) => { const k = GROW_ALL.indexOf(p); return k < 0 ? 1 : fillOf([sv[k]]); };
    const want = [...new Set([...GROW_BASIC, ...mine.filter(b => b.type !== 'store' && b.product && PRODUCTS[b.product].kind === 'consumer').map(b => b.product!)])].sort((a, b) => (own.has(b) ? 1 : 0) - (own.has(a) ? 1 : 0) || fillP(a) - fillP(b));
    const stock: { p: ProductId; src: string }[] = [];
    for (const p of want) { if (stock.length >= STORE_SLOTS) break; const sp = spareProducer(s, c, p); const ext = bestSourceCost(s, here, p, true); const src = sp ? sp.src : ext.id && ext.cost <= retailRef(s, city, p) * 0.92 ? ext.id : ''; if (src) stock.push({ p, src }); }
    if (!stock.some(x => s.buildings[x.src.split('#')[0]]?.owner === c.id)) return false; // only when our own production has stock to spare
    if (!stock.length) return false; // nothing to sell there at a profit
    const r = applyAction(s, c.id, { type: 'build', idx, btype: 'store' }); if (!('ok' in r) || !r.info || !s.buildings[r.info]) continue;
    const st = s.buildings[r.info];
    stock.forEach((x, i) => { st.slots[i] = { ...st.slots[i], product: x.p, price: retailRef(s, st.city, x.p), order: 100, source: x.src }; });
    return true;
  }
  return false;
}
function aiTurn(s: GameState, c: Company) {
  aiManage(s, c);
  if (s.turn % 2 !== 0 || c.cash < 430_000) return;
  const mine = companyBuildings(s, c.id);
  if (c.cash > 3_000_000 && mine.length >= 5 && s.turn % 12 === 0) { const cons = PRODUCT_LIST.filter(p => p.kind === 'consumer' && !p.research); c.aiFocus = cons[Math.floor(rnd(s) * cons.length)].id; }
  const chain = chainOf(c.aiFocus!);
  // fill gaps in the supply chain first
  for (const p of chain) {
    const prod = mine.find(b => b.product === p && b.type !== 'store');
    if (prod) continue;
    const def = PRODUCTS[p];
    const btype = aiBtype(p);
    if (tryBuild(s, c, btype, p, mine[0]?.city)) return;
  }
  // a new shop when our own production piles up: placed where many people still lack everyday goods (it sells there, and the city grows)
  if (aiGrowthShop(s, c)) return;
  // otherwise a store in a city we don't serve yet
  const served = new Set(mine.filter(b => b.type === 'store').map(b => b.city));
  const target = s.cities.filter(x => !served.has(x.id)).sort((a, b) => b.pop - a.pop)[0];
  if (target && spareProducer(s, c, c.aiFocus!)) { const st = tryBuild(s, c, 'store', c.aiFocus!, target.id); if (st) { st.slots[0] = { ...st.slots[0], product: c.aiFocus!, price: retailRef(s, st.city, c.aiFocus!), order: 100, source: '' }; return; } }
  // expansion: add a line or enlarge a store
  const stores = mine.filter(b => b.type === 'store');
  for (const st of stores) {
    const sl = st.slots[0];
    if (sl.product && sl.sold >= slotCapacity(st, sl.product) * 0.9 && st.size < MAX_STORE_SIZE && applyAction(s, c.id, { type: 'upgradeSize', id: st.id }).hasOwnProperty('ok')) return;
  }
  for (const b of mine) if (b.type !== 'store' && b.type !== 'rd' && b.stock.qty < capacity(b) * 0.3 && b.lines < 4 && c.cash > 900_000) {
    if (b.type === 'factory') {
      // add a final line in a free corner that touches import cells covering every recipe input
      ensureLayout(b); const L = b.layout!; const need = Object.keys(PRODUCTS[b.product!].recipe);
      const gn = gridN(b);
      for (const corner of [0, gn - 1, gn * (gn - 1), gn * gn - 1]) {
        if (L[corner].m) continue;
        const nb = adj4(corner, gn).filter(j => L[j].m === 'import');
        if (!need.every(p => nb.some(j => L[j].product === p))) continue;
        if ('ok' in applyAction(s, c.id, { type: 'setModule', id: b.id, cell: corner, module: 'line' })) { for (const j of nb) applyAction(s, c.id, { type: 'setLink', id: b.id, a: corner, b: j, on: true }); return; }
      }
    }
    else if ('ok' in applyAction(s, c.id, { type: 'addLine', id: b.id })) return;
  }
  // diversify: store handles a second product of the chain's final good only; add research
  if (!mine.some(b => b.type === 'rd') && c.cash > 1_500_000 * 1) { const r = tryBuild(s, c, 'rd', c.aiFocus!); if (r) { applyAction(s, c.id, { type: 'setStaff', id: r.id, workers: 10, wage: Math.round(cityWage(s, r.city) * 1.5) }); } }
}

// ---------------------------------------------------------------- views
export function rankings(s: GameState) {
  return s.companies.filter(c => !c.bankrupt).map(c => ({ id: c.id, name: c.name, netWorth: netWorth(s, c) })).sort((a, b) => b.netWorth - a.netWorth);
}

// ---------------------------------------------------------------- personnel
export const MAX_STAFF = { manager: 2, advisor: 1 };
export const ADVISOR_SPECS: Record<string, string> = { market: 'Market analyst', finance: 'Financial advisor', production: 'Operations consultant', intel: 'Competitive intelligence' };
const FIRST = ['Alice', 'Bruno', 'Carla', 'Dmitri', 'Elena', 'Farid', 'Grace', 'Hiro', 'Ines', 'Jonas', 'Kofi', 'Lena', 'Marco', 'Nadia', 'Oscar', 'Priya', 'Quinn', 'Rosa', 'Sven', 'Tara', 'Umar', 'Vera', 'Walt', 'Yara', 'Zed'];
const LAST = ['Ashford', 'Brandt', 'Castillo', 'Dvorak', 'Eriksen', 'Fontaine', 'Gallagher', 'Hartmann', 'Ibarra', 'Jansen', 'Kowalski', 'Lindqvist', 'Moreau', 'Nakamura', 'Okafor', 'Petrov', 'Quist', 'Rossi', 'Santos', 'Tanaka', 'Ullman', 'Voss', 'Whitlock', 'Yilmaz'];
const MGR_SPECS: BuildingType[] = ['farm', 'forest', 'mine', 'copper', 'quarry', 'rare', 'oil', 'factory', 'store', 'rd'];
function makePerson(s: GameState, kind: 'manager' | 'advisor'): Person {
  const stat = () => clamp(Math.round(2 + rnd(s) * rnd(s) * 8 + rnd(s) * 2), 1, 10); // mostly mediocre, rarely brilliant
  const p: Person = {
    id: 'p' + s.nextId++, name: FIRST[Math.floor(rnd(s) * FIRST.length)] + ' ' + LAST[Math.floor(rnd(s) * LAST.length)], portrait: Math.floor(rnd(s) * 72),
    age: 26 + Math.floor(rnd(s) * 36), kind, term: [12, 12, 18, 24][Math.floor(rnd(s) * 4)], spec: '', eff: 0, prod: 0, exp: 0, skill: 0, salary: 0,
  };
  if (kind === 'manager') {
    p.spec = MGR_SPECS[Math.floor(rnd(s) * MGR_SPECS.length)]; p.eff = stat(); p.prod = stat(); p.exp = stat();
    p.salary = Math.round((1500 + (p.eff + p.prod + p.exp) * 330) / 50) * 50;
  } else {
    const k = Object.keys(ADVISOR_SPECS); p.spec = k[Math.floor(rnd(s) * k.length)]; p.skill = stat(); p.salary = Math.round((2000 + p.skill * 900) / 50) * 50;
  }
  return p;
}
/** A fresh short list every round: a few managers and advisors. Unhired ones leave. */
export function refreshCandidates(s: GameState, _initial = false) {
  s.candidates = [];
  for (let i = 0; i < 5; i++) s.candidates.push(makePerson(s, 'manager'));
  for (let i = 0; i < 3; i++) s.candidates.push(makePerson(s, 'advisor'));
}
/** Sealed bids: the highest salary offer wins each candidate (earliest bid on a tie). A company that is already full, or short of cash, is skipped. */
function resolveHiring(s: GameState) {
  const order = [...(s.candidates ?? [])].filter(p => p.bids?.length).sort((x, y) => Math.max(...y.bids!.map(b => b.salary)) - Math.max(...x.bids!.map(b => b.salary)));
  for (const p of order) {
    const bids = [...p.bids!].sort((x, y) => y.salary - x.salary);
    let winner: { company: string; salary: number } | undefined;
    for (const b of bids) {
      const c = s.companies.find(x => x.id === b.company); if (!c || c.bankrupt) continue;
      const have = (c.staff ?? []).filter(x => x.kind === p.kind).length;
      if (have >= MAX_STAFF[p.kind] || c.cash < b.salary * 2) continue; winner = b; break;
    }
    for (const b of bids) { const c = s.companies.find(x => x.id === b.company); if (c && !c.bankrupt && b !== winner) c.news.push({ turn: s.turn, text: winner ? `You lost the bidding for ${p.name} (${p.kind}); the winning offer was higher or yours could not be honoured.` : `${p.name} could not be hired: your offer was not valid any more.` }); }
    if (!winner) continue;
    const c = s.companies.find(x => x.id === winner!.company)!;
    const hired: Person = { ...p, bids: undefined, salary: winner.salary, assigned: null, hiredTurn: s.turn, contractEnd: s.turn + (p.term ?? 12) }; (c.staff ??= []).push(hired);
    c.news.push({ turn: s.turn, text: `${p.name} accepted your offer and joins as ${p.kind === 'manager' ? 'manager' : 'advisor'} for ${fmtMoney(winner.salary)} a month.` });
  }
}
/** Bonuses from the manager running a facility. Managers know their own kind of building best; elsewhere they are half as useful. */
export function mgrBonus(s: GameState, b: Building): { eff: number; prod: number; exp: number } {
  const m = s.companies.find(c => c.id === b.owner)?.staff?.find(x => x.assigned === b.id);
  if (!m) return { eff: 0, prod: 0, exp: 0 };
  const f = m.spec === b.type ? 1 : 0.5;
  return { eff: 0.015 * m.eff * f, prod: 0.02 * m.prod * f, exp: 0.02 * m.exp * f };
}
/** What the advisor tells you. Better advisors give more items. Advisors only see their own field. */
export function advice(s: GameState, c: Company): { topic: string; text: string; tone: 'good' | 'bad' | 'info'; building?: string }[] {
  const a = c.staff?.find(x => x.kind === 'advisor'); if (!a) return [];
  const out: { topic: string; text: string; tone: 'good' | 'bad' | 'info'; building?: string; w: number }[] = []; const T = ADVISOR_SPECS[a.spec];
  const mine = Object.values(s.buildings).filter(b => b.owner === c.id);
  const add = (text: string, tone: 'good' | 'bad' | 'info', w: number, building?: string) => out.push({ topic: T, text, tone, building, w });
  if (a.spec === 'market') {
    const ps = PRODUCT_LIST.filter(p => !p.research || isUnlocked(c, p.id)).map(p => ({ p, m: s.market[p.id] }));
    for (const { p, m } of ps) { const ch = m.idx / (m.prev ?? m.idx) - 1; if (ch > 0.03) add(`${p.name} prices are rising (${(ch * 100).toFixed(0)}% this month).`, 'good', 2 + ch * 20); else if (ch < -0.03) add(`${p.name} prices are falling (${(ch * 100).toFixed(0)}% this month) — avoid stocking up.`, 'bad', 2 - ch * 20); }
    const best = ps.filter(x => x.p.kind === 'consumer').sort((x, y) => y.m.demand * y.m.idx - x.m.demand * x.m.idx)[0]; if (best) add(`Demand is strongest for ${best.p.name.toLowerCase()}.`, 'info', 3);
    const unsold = mine.filter(b => b.type === 'factory' && b.product && b.stock.qty > capacity(b) * 1.5); for (const b of unsold) add(`${b.name} piles up unsold ${PRODUCTS[b.product!].name.toLowerCase()}: lower the price or use the world market.`, 'bad', 4, b.id);
  } else if (a.spec === 'finance') {
    for (const L of c.loans ?? []) { const left = L.startTurn + L.term - s.turn; if (left <= 3) add(`A loan of ${fmtMoney(L.principal)} falls due in ${Math.max(0, left)} months.`, 'bad', 5); }
    const rate = (c.loans ?? []).reduce((m, L) => Math.max(m, L.rate), 0); if (rate > 0.012) add(`You are paying ${(rate * 100).toFixed(1)}% a month on a loan. Refinance with a cheaper lender.`, 'bad', 3);
    const fair = equity(s, c) / (c.shares ?? TOTAL_SHARES); if (c.price && c.price < fair * 0.9) add('Your shares trade below book value — a good time to buy back.', 'good', 2); else if (c.price && c.price > fair * 1.6) add('Your shares are expensive relative to book value — a good time to issue.', 'info', 2);
    if (c.cash > 300_000 && !(c.loans ?? []).length) add('You hold plenty of idle cash. Invest it or pay a dividend.', 'info', 2);
    if (c.cash < 30_000) add('Cash is low: wages and loan payments may overdraw you.', 'bad', 4);
    for (const o of s.companies) if (o.id !== c.id && !o.bankrupt && o.price && o.priceHist && o.priceHist.length > 3 && o.price / o.priceHist[o.priceHist.length - 4] > 1.1) add(`${o.name} shares gained ${((o.price / o.priceHist[o.priceHist.length - 4] - 1) * 100).toFixed(0)}% in three months.`, 'info', 2);
  } else if (a.spec === 'production') {
    for (const b of mine) { if (!b.product || b.type === 'store' || b.building) continue; const e = efficiency(s, b); if (e < 0.8) { const why = b.condition < 60 ? 'its condition is poor — raise maintenance' : areaInfo(s, b).factor < 0.8 ? 'there is little ' + ({ pop: 'population', deposits: 'ore or oil', trees: 'forest', farmland: 'farmland' } as Record<string, string>)[areaInfo(s, b).kind] + ' around it' : b.wage < cityWage(s, b.city) * 0.95 ? 'wages are below the city average' : 'it is understaffed'; add(`${b.name} runs at ${(e * 100).toFixed(0)}%: ${why}.`, 'bad', 5 + (1 - e) * 5, b.id); } }
    for (const b of mine) if (b.type !== 'store' && b.type !== 'rd' && b.product && !(c.staff ?? []).some(m => m.assigned === b.id)) add(`${b.name} has no manager.`, 'info', 1, b.id);
    const best = mine.filter(b => b.hist && b.hist.length).sort((x, y) => y.hist![y.hist!.length - 1] - x.hist![x.hist!.length - 1])[0]; if (best) add(`${best.name} is your best earner (${fmtMoney(best.hist![best.hist!.length - 1])} last month).`, 'good', 2, best.id);
  } else {
    const live = s.companies.filter(o => o.id !== c.id && !o.bankrupt);
    const top = [...live].sort((x, y) => netWorth(s, y) - netWorth(s, x))[0]; if (top) add(`${top.name} leads the ranking with a net worth of ${fmtMoney(netWorth(s, top))}.`, 'info', 3);
    for (const o of live.slice(0, 6)) { const bs = Object.values(s.buildings).filter(b => b.owner === o.id && b.product); const set = [...new Set(bs.map(b => PRODUCTS[b.product!].name.toLowerCase()))]; if (set.length) add(`${o.name} focuses on ${set.slice(0, 3).join(', ')} (${bs.length} facilities, ${o.isAI ? 'AI' : 'player'}).`, 'info', 1); }
    const last = (o: Company) => o.history[o.history.length - 1]; for (const o of live) if (last(o) && last(o).profit > 0 && last(o).profit > (last(c)?.profit ?? 0) * 2 && last(o).profit > 20_000) add(`${o.name} earned ${fmtMoney(last(o).profit)} last month — more than double your result.`, 'bad', 3);
  }
  const n = 1 + Math.floor(a.skill / 3);
  return out.sort((x, y) => y.w - x.w).slice(0, n).map(({ w, ...r }) => r);
}

// ---------------------------------------------------------------- real estate: vacant facilities for sale
export const VACANT_MAX = 10, VACANT_LIFE = 8;
const VACANT_WEIGHTS: [BuildingType, number][] = [['factory', 30], ['store', 24], ['farm', 14], ['forest', 8], ['mine', 5], ['copper', 5], ['quarry', 5], ['rare', 3], ['oil', 6], ['rd', 5]];
const ORIGIN_TEXT = { closure: 'after the owner went out of business', bankrupt: 'from a liquidated company', estate: 'from an estate sale' };
/** Offer one facility for sale on a free tile. Costs 45-65% of a new building, but is worn. */
function spawnVacancy(s: GameState, quiet = false): boolean {
  if (!s.world) return false;
  let r = rnd(s) * VACANT_WEIGHTS.reduce((n, w) => n + w[1], 0); let type = VACANT_WEIGHTS[0][0];
  for (const [t, w] of VACANT_WEIGHTS) { if ((r -= w) < 0) { type = t; break; } }
  const def = BUILDINGS[type]; const rm = railMap(s); const tiles = s.world.tiles; const W = s.world.w;
  for (let k = 0; k < 800; k++) {
    const idx = Math.floor(rnd(s) * tiles.length); const t = tiles[idx] as Terrain;
    if (!def.terrain.includes(t) || rm?.on[idx] || s.lots[lotKey(idx)] || s.vacant?.some(v => v.idx === idx) || Object.values(s.buildings).some(b => b.idx === idx)) continue;
    const city = nearestCity(s.cities, idx), c = s.cities[city];
    if (!['forest', 'mine', 'copper', 'quarry', 'rare', 'oil', 'farm'].includes(type) && Math.hypot(c.x / WORLD_SCALE - (idx % W), c.y / WORLD_SCALE - Math.floor(idx / W)) > 14) continue;
    const land = lotPrice(s, idx); if (!land) continue;
    let product: ProductId | null = null;
    if (def.products) product = def.products[Math.floor(rnd(s) * def.products.length)];
    else if (type === 'factory') { const ps = PRODUCT_LIST.filter(p => p.kind !== 'raw' && !p.research); product = ps[Math.floor(rnd(s) * ps.length)].id; }
    else if (type === 'rd') product = 'bread';
    const origin = (['closure', 'closure', 'estate'] as const)[Math.floor(rnd(s) * 3)];
    const v: Vacancy = { id: 'v' + s.nextId++, type, city, idx, product, cond: Math.round(55 + rnd(s) * 35), land, build: Math.round(def.cost * (0.45 + rnd(s) * 0.2) / 100) * 100, listedTurn: s.turn, origin };
    (s.vacant ??= []).push(v);
    if (!quiet) s.news.push({ turn: s.turn, kind: 'info', tag: 'vacant', text: `For sale: ${/^[aeiou]/i.test(def.name) ? 'an' : 'a'} ${def.name.toLowerCase()}${product && type !== 'store' && type !== 'rd' ? ' (' + PRODUCTS[product].name.toLowerCase() + ')' : ''} in ${c.name}, ${ORIGIN_TEXT[origin]}. Asking ${fmtMoney(v.land + v.build)}, a ${Math.round((1 - (v.land + v.build) / (v.land + def.cost)) * 100)}% saving on building new.` });
    return true;
  }
  return false;
}
function spawnVacancies(s: GameState) {
  s.vacant = (s.vacant ?? []).filter(v => (v.perm || s.turn - v.listedTurn < VACANT_LIFE) && !s.lots[lotKey(v.idx)]);
  const r = rnd(s), n = r < 0.15 ? 0 : r < 0.55 ? 1 : 2;
  for (let i = 0; i < n && s.vacant.filter(v => !v.perm).length < VACANT_MAX; i++) spawnVacancy(s);
}

// ---------------------------------------------------------------- malls
/** Monthly: tenants pay their rent, leases renew at the mall's current rent, units without a branded product are evicted, orphaned units disappear. */
function collectRents(s: GameState) {
  for (const u of Object.values(s.buildings).filter(x => x.mall)) {
    const m = s.buildings[u.mall!]; const t = s.companies.find(x => x.id === u.owner)!;
    if (!m || t.bankrupt) { removeBuilding(s, u); continue; }
    if (m.building) continue; // the mall is not open yet
    const mo = s.companies.find(x => x.id === m.owner)!; const sl = u.slots[0];
    if (sl?.product && t.brand[sl.product] < MALL_MIN_BRAND / 2) {
      const msg = `${m.name} evicted your ${PRODUCTS[sl.product].name.toLowerCase()} shop: the brand became too weak for a branded unit.`;
      t.news.push({ turn: s.turn, text: msg }); if (mo.id !== t.id) mo.news.push({ turn: s.turn, text: `${t.name} lost its unit in ${m.name} (weak brand).` });
      removeBuilding(s, u); continue;
    }
    if (u.leaseEnd != null && s.turn >= u.leaseEnd) { u.rent = mo.id === t.id ? 0 : m.rent ?? 0; u.leaseEnd = s.turn + MALL_LEASE; }
    const rent = mo.id === t.id ? 0 : u.rent ?? 0; if (!rent) continue;
    t.ledger.maint += rent; mo.cash += rent; mo.ledger.revenue += rent; m.report.revenue += rent;
  }
}
export function mallInfos(s: GameState): MallInfo[] {
  return Object.values(s.buildings).filter(b => b.type === 'mall').map(m => ({
    id: m.id, owner: m.owner, name: m.name, city: m.city, idx: m.idx, rent: m.rent ?? 0, opensIn: m.building ?? 0, units: MALL_UNITS, cond: Math.round(m.condition),
    tenants: Object.values(s.buildings).filter(u => u.mall === m.id).map(u => ({ company: u.owner, product: u.slots[0]?.product ?? null, rent: u.owner === m.owner ? 0 : u.rent ?? 0, leaseEnd: u.leaseEnd ?? 0, building: u.id })),
  }));
}

// ---------------------------------------------------------------- city subsidies
export const SUBSIDY_LIFE = 10, SUBSIDY_MAX = 5;
const SUB_KINDS: BuildingType[] = ['factory', 'factory', 'store', 'store', 'rd', 'mall'];
/** An open offer that this construction would claim: the first of its kind in that city's area. */
export function openSubsidy(s: GameState, city: number, kind: BuildingType, product: ProductId | null): Subsidy | undefined {
  return (s.subsidies ?? []).find(x => x.city === city && x.kind === kind && (!x.product || x.product === product) && !hasKind(s, city, kind, x.product ?? null));
}
const hasKind = (s: GameState, city: number, kind: BuildingType, product: ProductId | null) => Object.values(s.buildings).some(b => b.city === city && b.type === kind && !b.mall && (!product || b.product === product));
function claimSubsidy(s: GameState, c: Company, x: Subsidy, grant: number) {
  s.subsidies = (s.subsidies ?? []).filter(o => o !== x); const city = s.cities[x.city], what = BUILDINGS[x.kind].name.toLowerCase() + (x.product ? ' for ' + PRODUCTS[x.product].name.toLowerCase() : '');
  let text: string;
  if (x.reward === 'land') text = `${city.name} pays ${Math.round(x.amount * 100)}% of the land for ${c.name}'s new ${what} (${fmtMoney(grant)}).`;
  else { c.taxBreak = { city: x.city, cut: x.amount, until: s.turn + x.months }; text = `${city.name} cuts ${c.name}'s taxes by ${Math.round(x.amount * 100)}% for ${x.months} months for opening the town's first ${what}.`; }
  s.news.push({ turn: s.turn, kind: 'good', tag: 'subsidy', text }); c.news.push({ turn: s.turn, text: 'Subsidy won: ' + text });
}
function spawnSubsidy(s: GameState, quiet = false): boolean {
  const open = s.subsidies ??= []; const free = s.cities.filter(c => !open.some(x => x.city === c.id));
  for (let k = 0; k < 20 && free.length; k++) {
    const city = free[Math.floor(rnd(s) * free.length)]; const kind = SUB_KINDS[Math.floor(rnd(s) * SUB_KINDS.length)];
    if (kind === 'mall' && city.town) continue;
    let product: ProductId | undefined;
    if (kind === 'factory') { const ps = PRODUCT_LIST.filter(p => p.kind !== 'raw' && !p.research && !hasKind(s, city.id, 'factory', p.id)); if (!ps.length) continue; product = ps[Math.floor(rnd(s) * ps.length)].id; }
    else if (hasKind(s, city.id, kind, null)) continue;
    const land = rnd(s) < 0.5;
    const x: Subsidy = { id: 's' + s.nextId++, city: city.id, kind, product, reward: land ? 'land' : 'tax', amount: land ? Math.round((0.4 + rnd(s) * 0.3) * 20) / 20 : Math.round((0.3 + rnd(s) * 0.3) * 20) / 20, months: 6 + Math.floor(rnd(s) * 13), listedTurn: s.turn, expires: s.turn + SUBSIDY_LIFE };
    open.push(x);
    if (!quiet) s.news.push({ turn: s.turn, kind: 'info', tag: 'subsidy', text: `${city.name} offers ${subsidyText(x)}` });
    return true;
  }
  return false;
}
export const subsidyText = (x: Subsidy) => `${x.reward === 'land' ? Math.round(x.amount * 100) + '% off the land' : Math.round(x.amount * 100) + '% less tax for ' + x.months + ' months'} to the first ${BUILDINGS[x.kind].name.toLowerCase()}${x.product ? ' for ' + PRODUCTS[x.product].name.toLowerCase() : ''} in its area.`;
function spawnSubsidies(s: GameState) {
  s.subsidies = (s.subsidies ?? []).filter(x => s.turn < x.expires && !hasKind(s, x.city, x.kind, x.product ?? null));
  if (s.subsidies.length < SUBSIDY_MAX && rnd(s) < 0.45) spawnSubsidy(s);
}

// ---------------------------------------------------------------- construction
/** A building does nothing while it is being built, and a mall unit waits for its mall to open. */
export const idle = (s: GameState, b: Building): boolean => !!b.building || (b.strikeUntil ?? -1) >= s.turn || (!!b.mall && !!s.buildings[b.mall]?.building);
function completeBuilding(s: GameState, b: Building) {
  const c = s.companies.find(x => x.id === b.owner); if (!c || c.bankrupt) return; const def = BUILDINGS[b.type];
  s.news.push({ turn: s.turn, kind: 'info', tag: 'opening', text: `${c.name} opens ${/^[aeiou]/i.test(def.name) ? 'an' : 'a'} ${def.name.toLowerCase()}${b.product && b.type !== 'store' && b.type !== 'rd' ? ' for ' + PRODUCTS[b.product].name.toLowerCase() : ''} in ${s.cities[b.city].name}.` });
  c.news.push({ turn: s.turn, text: `${b.name} is finished and starts operating.` });
  fillStaff(s, c.id, b);
  if (b.type === 'mall') for (const u of Object.values(s.buildings)) if (u.mall === b.id) { const t = s.companies.find(x => x.id === u.owner); if (t && !t.bankrupt) { fillStaff(s, t.id, u); if (t.id !== c.id) t.news.push({ turn: s.turn, text: `${b.name} has opened: your shop there starts trading.` }); } }
}

// ---------------------------------------------------------------- contracts
export const OFFER_WINDOW = 3; // months before a contract ends in which rivals may make an offer
/** A person on the job market (candidate) or a contract about to end (employee of any company). */
function bidTarget(s: GameState, id: string): { p: Person; employer?: Company } | null {
  const cand = (s.candidates ?? []).find(x => x.id === id); if (cand) return { p: cand };
  for (const c of s.companies) { const p = c.staff?.find(x => x.id === id); if (p && !c.bankrupt) return { p, employer: c }; }
  return null;
}
/** When a contract runs out it renews at the same salary, unless a rival bid more than the employer's own (counter-)offer: then the person moves. */
function resolveContracts(s: GameState) {
  for (const emp of s.companies) {
    if (emp.bankrupt) continue;
    for (const p of [...(emp.staff ?? [])]) {
      if (p.contractEnd == null) p.contractEnd = s.turn + (p.term ?? 12);
      if (s.turn < p.contractEnd) continue;
      const own = Math.max(p.salary, p.bids?.find(b => b.company === emp.id)?.salary ?? 0);
      const rivals = (p.bids ?? []).filter(b => b.company !== emp.id).sort((x, y) => y.salary - x.salary);
      let win: { company: string; salary: number } | undefined;
      for (const b of rivals) {
        if (b.salary <= own) break;
        const c = s.companies.find(x => x.id === b.company); if (!c || c.bankrupt) continue;
        if ((c.staff ?? []).filter(x => x.kind === p.kind).length >= MAX_STAFF[p.kind] || c.cash < b.salary * 2) continue; win = b; break;
      }
      for (const b of rivals) if (b !== win) { const c = s.companies.find(x => x.id === b.company); if (c && !c.bankrupt) c.news.push({ turn: s.turn, text: `${p.name} stayed with ${emp.name}.` }); }
      if (win) {
        const c = s.companies.find(x => x.id === win!.company)!;
        emp.staff = emp.staff!.filter(x => x !== p); c.staff ??= []; c.staff.push({ ...p, bids: undefined, assigned: null, salary: win.salary, hiredTurn: s.turn, contractEnd: s.turn + (p.term ?? 12) });
        emp.news.push({ turn: s.turn, text: `${p.name} left for ${c.name}, who offered ${fmtMoney(win.salary)} a month.` }); c.news.push({ turn: s.turn, text: `${p.name} accepted your offer and joins from ${emp.name} for ${fmtMoney(win.salary)} a month.` });
        s.news.push({ turn: s.turn, kind: 'info', tag: 'opening', text: `${c.name} lures ${p.kind === 'manager' ? 'a manager' : 'an advisor'}, ${p.name}, away from ${emp.name}.` });
      } else { p.salary = own; p.contractEnd = s.turn + (p.term ?? 12); p.bids = undefined; emp.news.push({ turn: s.turn, text: `${p.name}'s contract was renewed for ${p.term ?? 12} months at ${fmtMoney(own)} a month.` }); }
    }
  }
}
