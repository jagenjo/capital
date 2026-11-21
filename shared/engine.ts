// Game engine: pure functions over GameState. One call to processTurn() = one month.
import {
  PRODUCTS, PRODUCT_LIST, BUILDINGS, LENDERS, type Lender, TERRAIN_INFO, MAX_LINES, MAX_AUTO, MAX_STORE_SIZE, STORE_SLOTS, BASE_WAGE,
  MALL_UNITS, MALL_MIN_BRAND, MALL_FITOUT, MALL_TRAFFIC, MALL_BRAND_BOOST, MALL_LEASE, MALL_PER_CITY, IMPORT_MARKUP, IMPORT_QUALITY, NPC_SHARE_MARKUP, MONTH_NAMES, COMPANY_COLORS, MODULES, FAC_GRID, WORLD_SCALE, WORLD_W, OVERSTAFF_CAP, OVERSTAFF_BONUS,
  type ModuleType,
  type ProductId, type BuildingType, type Terrain,
} from './data.js';
import { buildWorld, nearestCity } from './world.js';
import type { GameState, Settings, City, Company, Building, StoreSlot, Stock, Action, Listing, Ledger, LayoutCell, HarbourGood, Loan, Person, Vacancy, MallInfo, Subsidy } from './types.js';

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
  seed: Math.floor(Math.random() * 1e9), events: true,
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
  buildWorld(s);
  refreshHarbours(s);
  refreshCandidates(s, true);
  for (let i = 0; i < 6; i++) spawnVacancy(s, true);
  for (let i = 0; i < 4; i++) spawnSubsidy(s, true);
  for (const p of PRODUCT_LIST) s.market[p.id] = { idx: 1, demand: 1 };
  s.news.push({ turn: 0, text: `Welcome to ${settings.name}. The economy is open for business.`, kind: 'info' });
  for (let i = 0; i < settings.aiCompanies; i++) addCompany(s, { name: AI_NAMES[i % AI_NAMES.length], isAI: true });
  return s;
}

export function addCompany(s: GameState, o: { name: string; isAI?: boolean; playerId?: string; color?: string; portrait?: number }): Company {
  const tech = {} as Record<ProductId, number>, brand = {} as Record<ProductId, number>;
  for (const p of PRODUCT_LIST) { tech[p.id] = 15; brand[p.id] = 0; }
  const used = new Set(s.companies.map(c => c.color));
  const c: Company = {
    id: 'c' + s.nextId++, name: o.name, color: o.color ?? COMPANY_COLORS.find(x => !used.has(x)) ?? '#888',
    portrait: o.portrait ?? Math.floor(rnd(s) * 72), isAI: !!o.isAI, playerId: o.playerId,
    cash: s.settings.startCash, debt: 0, tech, brand, ads: {}, ledger: emptyLedger(), history: [], ready: !!o.isAI,
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
  const c = s.cities[nearestCity(s.cities, idx)];
  const f = t === 'u' || t === 's' ? c.priceIdx * (0.7 + (c.pop / 500000) * 0.5) : 0.85 * (0.9 + c.priceIdx * 0.1);
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
export const transportPerUnit = (s: GameState, p: ProductId, a: number, b: number) => PRODUCTS[p].basePrice * 0.0002 * dist(s, a, b);

// ---- railways: buildings within RAIL_REACH tiles of a track are on that rail network; shipping between two buildings of the same network is cheaper and bigger
export const RAIL_REACH = 3, RAIL_COST_MUL = 0.5, RAIL_SHIP_MUL = 2.5, SHIP_BASE = 1.2;
type RailMap = { on: Uint8Array; comp: Int16Array };
const railCache = new WeakMap<object, RailMap>();
export function railMap(s: { world?: { w: number; h: number; rails?: { a: number; b: number; tiles: number[] }[] } }): RailMap | null {
  const w = s.world; if (!w?.rails?.length) return null; let m = railCache.get(w); if (m) return m;
  const n = w.w * w.h; m = { on: new Uint8Array(n), comp: new Int16Array(n).fill(-1) };
  const uf: number[] = []; const root = (i: number): number => { uf[i] ??= i; return uf[i] === i ? i : (uf[i] = root(uf[i])); };
  for (const r of w.rails) uf[root(r.a)] = root(r.b);
  for (const r of w.rails) { const c = root(r.a); for (const t of r.tiles) { m.on[t] = 1; m.comp[t] = c; } }
  for (const r of w.rails) { const c = root(r.a); for (const t of r.tiles) { const tx = t % w.w, ty = (t / w.w) | 0;
    for (let dy = -RAIL_REACH; dy <= RAIL_REACH; dy++) for (let dx = -RAIL_REACH; dx <= RAIL_REACH; dx++) { const x = tx + dx, y = ty + dy; if (x >= 0 && y >= 0 && x < w.w && y < w.h && m.comp[y * w.w + x] < 0) m.comp[y * w.w + x] = c; } } }
  railCache.set(w, m); return m;
}
// ---- per-tile figures: population, transport availability (0-100), build price
type TileCtx = { cities: City[]; world?: { w: number; h: number; tiles: string; rails?: { a: number; b: number; tiles: number[] }[] } };
const URBAN_W: Record<string, number> = { u: 3, s: 1 }, RURAL_POP: Record<string, number> = { f: 40, g: 12, t: 5, b: 8 };
const popCache = new WeakMap<object, number[]>();
function urbanSums(s: TileCtx): number[] {
  const w = s.world!; let m = popCache.get(w); if (m) return m; m = s.cities.map(() => 0);
  for (let i = 0; i < w.tiles.length; i++) { const k = URBAN_W[w.tiles[i]]; if (k) m[nearestCity(s.cities, i)] += k; }
  popCache.set(w, m); return m;
}
/** Inhabitants on a tile: a city's population is spread over its downtown (x3) and suburb tiles; farmland and grass hold a few. */
export function tilePop(s: TileCtx, idx: number): number {
  const t = terrainAt(s, idx), k = URBAN_W[t];
  if (!k) return RURAL_POP[t] ?? 0;
  const c = nearestCity(s.cities, idx); return Math.round(s.cities[c].pop * k / Math.max(1, urbanSums(s)[c]));
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
const FG = FAC_GRID;
export const adj4 = (i: number): number[] => {
  const x = i % FG, y = Math.floor(i / FG), out: number[] = [];
  if (x > 0) out.push(i - 1); if (x < FG - 1) out.push(i + 1); if (y > 0) out.push(i - FG); if (y < FG - 1) out.push(i + FG);
  return out;
};
export const adj8 = (i: number): number[] => {
  const x = i % FG, y = Math.floor(i / FG), out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < FG && ny < FG) out.push(ny * FG + nx); }
  return out;
};
export const linkKey = (a: number, b: number) => (a < b ? a + '-' + b : b + '-' + a);
export const isLinked = (b: Building, i: number, j: number) => !!b.links?.includes(linkKey(i, j));

/** Workers a facility cell needs to run at full strength. */
const MODULE_WORKERS: Record<ModuleType, number> = { line: 0, robot: 1, warehouse: 1, import: 1, brand: 2, rd: 3, qa: 1, export: 1 };
export const linkable = (x: string | null, y: string | null): boolean => !!x && !!y && (x === 'line' || y === 'line' || (x === 'warehouse' && y === 'import') || (x === 'import' && y === 'warehouse') || (x === 'export' && y === 'import') || (x === 'import' && y === 'export'));
const placedRobots = (b: Building) => (b.layout ?? []).reduce((n, c, i) => n + (c.m === 'robot' && adj8(i).some(j => b.layout![j].m === 'line' && isLinked(b, i, j)) ? 1 : 0), 0);
export function cellNeed(b: Building, i: number): number {
  const c = b.layout?.[i]; if (!c || !c.m) return 0;
  if (c.m === 'line') return Math.max(1, Math.ceil(PRODUCTS[c.product ?? b.product!].workers * (1 - 0.08 * placedRobots(b))));
  return MODULE_WORKERS[c.m];
}
/** Strength of a crew: w/need below the requirement; above it each extra worker adds OVERSTAFF_BONUS (max 1 + (CAP-1)*BONUS). */
export const staffFactor = (w: number, need: number): number => !need ? 1 : w <= need ? w / need : 1 + (Math.min(w, need * OVERSTAFF_CAP) - need) / need * OVERSTAFF_BONUS;
/** Most workers a headcount `need` may hold. */
export const staffCap = (need: number): number => Math.ceil(need * OVERSTAFF_CAP);
/** Warehouse cells linked to cell i that hold product p. */
const whFor = (b: Building, i: number, p: ProductId): number[] => adj8(i).filter(j => b.layout![j].m === 'warehouse' && b.layout![j].product === p && isLinked(b, i, j));
/** How much a warehouse can hold of its one product. */
export const whCap = (b: Building, i: number): number => { const c = b.layout?.[i]; return c?.m === 'warehouse' && c.product ? PRODUCTS[c.product].cap * 2 * Math.max(1, b.lines) * staffRatio(b, i) : 0; };
/** How much an export cell can hold of its one product. */
export const exportCap = (b: Building, i: number): number => { const c = b.layout?.[i]; return c?.m === 'export' && c.product ? PRODUCTS[c.product].cap * 2 * Math.max(1, b.lines) * staffRatio(b, i) : 0; };
/** 0..1.5: how well a cell is staffed. */
export const staffRatio = (b: Building, i: number): number => staffFactor(b.layout![i].workers ?? 0, cellNeed(b, i));

export function moduleStats(b: Building): ModStats & { final: number } {
  const st = { lines: 0, final: 0, robots: 0, warehouse: 0, imports: 0, brand: 0, rd: 0, qa: 0, idle: [] as number[] };
  const L = b.layout; if (!L) return st;
  const linkedTo = (i: number, f: (j: number) => boolean) => adj8(i).some(j => isLinked(b, i, j) && L[j].m && f(j));
  const toLine = (i: number) => linkedTo(i, j => L[j].m === 'line');
  L.forEach((cell, i) => {
    const m = cell.m; if (!m) return; const r = staffRatio(b, i); // module effects are scaled by how well the cell is staffed
    if (m === 'line') { st.lines++; if (cell.product === b.product) st.final++; }
    else if (m === 'import') st.imports++;
    else if (m === 'export') { if (!linkedTo(i, j => L[j].m === 'line' || L[j].m === 'import')) st.idle.push(i); }
    else if (m === 'warehouse') { if (linkedTo(i, j => L[j].m === 'line' && L[j].product === b.product)) st.warehouse += r; else if (!linkedTo(i, j => L[j].m === 'import')) st.idle.push(i); }
    else if (!toLine(i)) st.idle.push(i); // robots, QA, branding and R&D only work when linked to a production line
    else if (m === 'brand') st.brand += r;
    else if (m === 'rd') st.rd += r;
    else if (m === 'robot') st.robots += r;
    else if (m === 'qa') st.qa += r;
  });
  return st;
}
/** Products a cell could handle judging by what it is linked to: import = inputs the linked lines still need; warehouse = what linked imports bring; export = what linked lines make or imports bring. */
export function cellCandidates(b: Building, i: number): ProductId[] {
  const L = b.layout!; const c = L[i]; const lk = (k: number) => adj8(k).filter(j => L[j].m && isLinked(b, k, j));
  const out = new Set<ProductId>();
  if (c.m === 'import') {
    for (const l of lk(i)) { if (L[l].m !== 'line' || !L[l].product) continue;
      const have = new Set<ProductId>(); for (const j of lk(l)) if (j !== i && L[j].product && (L[j].m === 'import' || L[j].m === 'line')) have.add(L[j].product!);
      for (const Y of Object.keys(PRODUCTS[L[l].product!].recipe) as ProductId[]) if (!have.has(Y)) out.add(Y); }
  } else if (c.m === 'warehouse' || c.m === 'export') {
    for (const j of lk(i)) { const m = L[j].m, p = L[j].product; if (!p) continue; if (m === 'import' || (c.m === 'export' && m === 'line')) out.add(p); }
  }
  return [...out];
}
/** Cells without a manual product take the one their links imply, when there is exactly one option. */
function inferProducts(b: Building) {
  const L = b.layout!;
  const apply = (i: number) => {
    const c = L[i]; if (c.product && !c.auto) return; const cands = cellCandidates(b, i);
    const np = cands.length === 1 ? cands[0] : c.auto && c.product && cands.includes(c.product) ? c.product : undefined;
    if (np !== c.product) { if (c.m === 'import') c.source = ''; else c.stock = undefined; }
    c.product = np; c.auto = true;
  };
  L.forEach((c, i) => { if (c.m === 'import') apply(i); });
  L.forEach((c, i) => { if (c.m === 'warehouse' || c.m === 'export') apply(i); });
}
export function syncLayout(b: Building) {
  if (b.type !== 'factory' || !b.layout) return;
  b.links = (b.links ?? []).filter(k => { const [x, y] = k.split('-').map(Number); return b.layout![x]?.m && b.layout![y]?.m; });
  inferProducts(b);
  const st = moduleStats(b); b.lines = Math.max(1, st.final); b.auto = Math.round(st.robots * 100) / 100;
  b.links = (b.links ?? []).filter(k => { const [x, y] = k.split('-').map(Number); return b.layout![x]?.m && b.layout![y]?.m; });
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
  if (b.type !== 'factory' || (b.layout && b.layout.length === FG * FG)) return;
  const L: LayoutCell[] = Array.from({ length: FG * FG }, () => ({ m: null }));
  const center = Math.floor(FG * FG / 2); b.links = [];
  L[center] = { m: 'line', product: b.product! };
  const inputs = Object.keys(PRODUCTS[b.product!].recipe) as ProductId[];
  [center - FG, center - 1, center + 1, center + FG].forEach((cell, k) => { if (inputs[k]) { L[cell] = { m: 'import', product: inputs[k], source: '' }; b.links!.push(linkKey(center, cell)); } });
  b.layout = L; syncLayout(b);
}
/** After retooling: line cells that made the old product make the new one; import cells are re-assigned to the new recipe inputs. */
function retoolLayout(b: Building, oldP: ProductId, newP: ProductId) {
  ensureLayout(b); const L = b.layout!;
  for (const c of L) if (c.m === 'line' && c.product === oldP) c.product = newP;
  const inputs = Object.keys(PRODUCTS[newP].recipe) as ProductId[]; let k = 0;
  for (const c of L) if (c.m === 'import') { c.product = inputs[k++]; c.source = ''; }
  for (const c of L) if (c.m === 'warehouse') { c.product = undefined; c.stock = undefined; }
  syncLayout(b);
}
export function layoutIssues(b: Building, cities?: { port?: boolean; harbour?: HarbourGood[] }[]): string[] {
  if (b.type !== 'factory') return []; ensureLayout(b); const L = b.layout!, out: string[] = [];
  const lines = L.map((c, i) => (c.m === 'line' ? i : -1)).filter(i => i >= 0);
  if (!lines.some(i => L[i].product === b.product)) out.push('No production line makes ' + PRODUCTS[b.product!].name);
  for (const i of lines) {
    const X = L[i].product; if (!X) { out.push('A production line has no product'); continue; }
    for (const Y of Object.keys(PRODUCTS[X].recipe) as ProductId[]) {
      const ok = adj8(i).filter(j => isLinked(b, i, j)).some(j => (L[j].m === 'import' && L[j].product === Y && !!L[j].source && (!cities || !L[j].source!.startsWith('harbour:') || !!harbourStocks(cities, L[j].source!, Y))) || (L[j].m === 'line' && L[j].product === Y));
      if (!ok) out.push(PRODUCTS[X].name + ' line: no linked supply of ' + PRODUCTS[Y].name);
    }
  }
  L.forEach((c, i) => { if (c.m !== 'warehouse') return; const imps = adj8(i).filter(j => L[j].m === 'import' && isLinked(b, i, j)); if (!c.product) { if (imps.length) out.push('Warehouse #' + (i + 1) + ' holds no product (pick one)'); } else if (imps.length && !imps.some(j => L[j].product === c.product)) out.push('Warehouse #' + (i + 1) + ' stores ' + PRODUCTS[c.product].name + ' but no linked import cell brings it'); });
  L.forEach((c, i) => { if (c.m !== 'export') return; if (!c.product) { out.push('Export cell #' + (i + 1) + ' holds no product (pick one)'); return; } if (!adj8(i).some(j => isLinked(b, i, j) && ((L[j].m === 'line' || L[j].m === 'import') && L[j].product === c.product))) out.push('Export cell #' + (i + 1) + ': no linked line or import cell brings ' + PRODUCTS[c.product].name); });
  for (const c of L) if (c.m === 'import') { if (!c.product) out.push('An import cell has no product'); else if (!c.source) out.push('Import cell for ' + PRODUCTS[c.product].name + ' has no source'); else if (cities && c.source.startsWith('harbour:') && !harbourStocks(cities, c.source, c.product)) out.push('The harbour no longer stocks ' + PRODUCTS[c.product].name + ' (pick another source)'); }
  return out;
}
const factoryExtra = (b: Building) => b.type === 'factory' ? moduleStats(b) : null;

export function requiredWorkers(b: Building): number {
  if (b.type === 'rd') return Math.max(1, b.workers);
  if (b.type === 'mall') return 0;
  if (b.type === 'store') return 2 + b.size * 2;
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
  return staff * moraleFactor(s, b) * (0.6 + 0.4 * b.condition / 100) * (1 + mgrBonus(s, b).eff);
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

export function listings(s: GameState): Listing[] {
  const out: Listing[] = [];
  for (const b of Object.values(s.buildings)) if (b.product && b.listPrice != null && b.stock.qty > 0.5 && b.type !== 'store')
    out.push({ building: b.id, company: b.owner, city: b.city, product: b.product, price: b.listPrice, qty: Math.floor(b.stock.qty), q: Math.round(b.stock.q) });
  for (const b of Object.values(s.buildings)) b.layout?.forEach((c, i) => { if (c.m === 'export' && c.product && c.listPrice != null && (c.stock?.qty ?? 0) > 0.5) out.push({ building: b.id + '#' + i, company: b.owner, city: b.city, product: c.product, price: c.listPrice, qty: Math.floor(c.stock!.qty), q: Math.round(c.stock!.q) }); });
  return out;
}

// ---------------------------------------------------------------- actions
type Res = { ok: true; info?: string } | { error: string };
const err = (e: string): Res => ({ error: e });
const OK: Res = { ok: true };

function newBuilding(s: GameState, c: Company, type: BuildingType, city: number, idx: number, product: ProductId | null): Building {
  const def = BUILDINGS[type];
  const cw = cityWage(s, city);
  const b: Building = {
    id: 'b' + s.nextId++, owner: c.id, type, city, idx, name: `${def.name} ${s.cities[city].name}`, product,
    lines: 1, auto: 0, size: 1, workers: 0, wage: type === 'rd' ? Math.round(cw * 1.5) : cw, maint: 100, condition: 100, target: 100,
    stock: emptyStock(), inputs: {}, sources: {}, listPrice: product && type !== 'store' && type !== 'rd' ? round2(PRODUCTS[product].basePrice * s.market[product].idx) : null,
    slots: [], invested: def.cost, builtTurn: s.turn, report: emptyReport(),
  };
  if (type === 'factory') ensureLayout(b);
  if (type === 'mall') { b.rent = 10000; b.workers = 0; }
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
      const total = Math.max(0, landCost + def.cost - grant);
      if (!canPay(total)) return err(`Not enough cash (need ${fmtMoney(total)})`);
      pay(total);
      if (!lot) s.lots[k] = { owner: cid, paid: landCost };
      const b = newBuilding(s, c, a.btype, cityId, a.idx, product);
      if (a.btype === 'store') b.slots[0].product = null;
      s.buildings[b.id] = b;
      s.news.push({ turn: s.turn, kind: 'info', tag: 'opening', text: `${c.name} opens ${/^[aeiou]/i.test(def.name) ? 'an' : 'a'} ${def.name.toLowerCase()}${product && a.btype !== 'store' ? ' for ' + PRODUCTS[product].name.toLowerCase() : ''} in ${s.cities[cityId].name}.` });
      if (sub) claimSubsidy(s, c, sub, grant);
      fillStaff(s, cid, b);
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
      c.cash += Math.round(lot.paid * 0.9); delete s.lots[k]; return OK;
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
    case 'setSource': return err('Choose the source on the import cells of the factory layout');
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
      b.links = (b.links ?? []).filter(k => !k.split('-').map(Number).includes(a.cell)); // a changed cell loses its connections
      syncLayout(b); fillStaff(s, cid, b); return OK;
    }
    case 'setCell': {
      const b = own(a.id); if (!b || b.type !== 'factory') return err('Only factories have a facility layout');
      ensureLayout(b); const L = b.layout!;
      if (!Number.isInteger(a.cell) || a.cell < 0 || a.cell >= L.length) return err('Bad cell');
      const cell = L[a.cell];
      if (cell.m === 'line') {
        if (a.product !== undefined) {
          if (!a.product || !PRODUCTS[a.product] || PRODUCTS[a.product].kind === 'raw') return err('Production lines manufacture goods, not raw materials');
          if (!isUnlocked(c, a.product)) return err(PRODUCTS[a.product].name + ' is hi-tech: research it first');
          cell.product = a.product;
        }
      } else if (cell.m === 'export') {
        if (a.product !== undefined) { if (a.product && !PRODUCTS[a.product]) return err('Unknown product'); if (a.product !== cell.product) cell.stock = undefined; cell.product = a.product ?? undefined; cell.auto = a.product == null; }
        if (a.price !== undefined) cell.listPrice = a.price == null ? null : Math.max(0.01, round2(num(a.price, 0.01, 1e6)));
      } else if (cell.m === 'warehouse') {
        if (a.product !== undefined) { if (a.product && !PRODUCTS[a.product]) return err('Unknown product'); if (a.product !== cell.product) cell.stock = undefined; cell.product = a.product ?? undefined; cell.auto = a.product == null; }
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
      ensureLayout(b); const L = b.layout!;
      if (!(L[a.a] && L[a.b]) || !adj8(a.a).includes(a.b)) return err('Only neighbouring cells (including diagonals) can be linked');
      if (!linkable(L[a.a].m, L[a.b].m)) return err('Links connect production lines with any other cell, or warehouses with import cells');
      const k = linkKey(a.a, a.b); const set = new Set(b.links ?? []);
      if (a.on) set.add(k); else set.delete(k);
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
      if (a.product && b.slots.some((o, i) => i !== a.slot && o.product === a.product)) return err('Product already on another shelf');
      if (a.product && a.source && (a.source !== sl.source || a.product !== sl.product)) { const e2 = sourceError(s, cid, a.product, a.source); if (e2) return err(e2); }
      if (sl.product !== a.product) { sl.stock = emptyStock(); sl.sold = sl.revenue = sl.lost = 0; }
      sl.product = a.product; sl.price = round2(num(a.price, 0.01, 1e8)); sl.order = Math.round(num(a.order, 0, 100000)); sl.source = a.source;
      return OK;
    }
    case 'setAds': { c.ads[a.product] = Math.round(num(a.budget, 0, 1_000_000)); return OK; }
    case 'rename': { const b = own(a.id); if (!b) return err('Not your building'); b.name = String(a.name).slice(0, 40) || b.name; return OK; }
    case 'buyShares': case 'sellShares': {
      const t = s.companies.find(x => x.id === a.company); if (!t || t.bankrupt) return err('No such listed company'); if (t.id === c.id) return err('Use issue / buy back for your own shares');
      ensureEquity(t); ensureEquity(c); const q = Math.floor(num(a.qty, 0, 1e9)); if (q < 1) return err('Enter a number of shares');
      const imp = SHARE_IMPACT * q / t.shares!;
      if (a.type === 'buyShares') {
        if (q > t.float!) return err('Only ' + Math.floor(t.float!).toLocaleString('en-US') + ' shares of ' + t.name + ' are for sale');
        const px = t.price! * (1 + imp), cost = Math.round(q * px * (1 + SHARE_SPREAD)); if (c.cash < cost) return err('Need ' + fmtMoney(cost));
        c.cash -= cost; t.float! -= q; c.portfolio![t.id] = (c.portfolio![t.id] ?? 0) + q; t.price = px;
      } else {
        const have = c.portfolio![t.id] ?? 0; if (q > have) return err('You only hold ' + Math.floor(have).toLocaleString('en-US') + ' shares');
        const px = Math.max(0.01, t.price! * (1 - imp)); c.cash += Math.round(q * px * (1 - SHARE_SPREAD)); t.float! += q; c.portfolio![t.id] = have - q; if (c.portfolio![t.id] <= 0) delete c.portfolio![t.id]; t.price = px;
      }
      return OK;
    }
    case 'issueShares': case 'buybackShares': {
      ensureEquity(c); const q = Math.floor(num(a.qty, 0, 1e9)); if (q < 1) return err('Enter a number of shares'); const imp = SHARE_IMPACT * q / c.shares!;
      if (a.type === 'issueShares') {
        if (treasury(s, c) - q < MIN_OWN * c.shares!) return err('You must keep at least ' + Math.round(MIN_OWN * 100) + '% of your own shares (you can sell ' + Math.max(0, Math.floor(treasury(s, c) - MIN_OWN * c.shares!)).toLocaleString('en-US') + ' more)');
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
      const u = newBuilding(s, c, 'store', m.city, m.idx, null); u.mall = m.id; u.rent = m.owner === cid ? 0 : m.rent ?? 10000; u.leaseEnd = s.turn + MALL_LEASE; u.invested = MALL_FITOUT; u.size = 1; u.slots.length = 1;
      u.name = `${p.name} shop · ${m.name}`; u.slots[0] = { ...u.slots[0], product: a.product, price: round2(retailRef(s, m.city, a.product)), order: 0, source: '' };
      s.buildings[u.id] = u; fillStaff(s, cid, u);
      if (m.owner !== cid) s.news.push({ turn: s.turn, kind: 'info', tag: 'opening', text: `${c.name} rents a unit in ${m.name} (${s.cities[m.city].name}) to sell ${p.name.toLowerCase()}.` });
      return { ok: true, info: u.id };
    }
    case 'hire': {
      const pool = (s.candidates ??= []); const i = pool.findIndex(x => x.id === a.id); if (i < 0) return err('That candidate is no longer available');
      const p = pool[i]; const staff = (c.staff ??= []); const n = staff.filter(x => x.kind === p.kind).length;
      if (n >= MAX_STAFF[p.kind]) return err('You can employ at most ' + MAX_STAFF[p.kind] + (p.kind === 'manager' ? ' managers' : ' advisor') + '. Fire someone first.');
      if (c.cash < p.salary * 2) return err('Keep at least two months of salary in cash to hire ' + p.name);
      pool.splice(i, 1); p.hiredTurn = s.turn; p.assigned = null; staff.push(p); return OK;
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
  if (source.startsWith('harbour:')) {
    const hc = s.cities[+source.slice(8)]; const gd = harbourStocks(s.cities, source, product); if (!hc || !gd) return { qty: 0, q: 0 };
    const price = harbourGoodPrice(s, gd);
    rail = railLink(s, cityTile(s, hc), bt); const trMul = rail ? RAIL_COST_MUL : 1;
    cd = { good: gd, price, landed: price + transportPerUnit(s, product, hc.id, buyer.city) * trMul, avail: gd.qty, q: IMPORT_QUALITY, internal: false };
  } else {
    const [bid, ci] = source.split('#'); const b = s.buildings[bid]; const ec = ci !== undefined ? b?.layout?.[+ci] : undefined;
    if (!b || b.id === buyer.id) return { qty: 0, q: 0 };
    if (ci !== undefined) { if (!ec || ec.m !== 'export' || ec.product !== product || !ec.stock || ec.stock.qty < 0.5) return { qty: 0, q: 0 }; }
    else if (b.product !== product || b.stock.qty < 0.5) return { qty: 0, q: 0 };
    const internal = b.owner === buyer.owner; const lp = ec ? ec.listPrice : b.listPrice; if (!internal && lp == null) return { qty: 0, q: 0 };
    const price = internal ? 0 : lp!; const stk = ec ? ec.stock! : b.stock;
    rail = railLink(s, b.idx, bt); const trMul = rail ? RAIL_COST_MUL : 1;
    const ship = b.city === buyer.city ? Infinity : Math.max(capacity(b), ec ? exportCap(b, +ci) : 0) * (rail ? RAIL_SHIP_MUL : SHIP_BASE) - (b.shipped ?? 0);
    cd = { b, cell: ec, price, landed: price + transportPerUnit(s, product, b.city, buyer.city) * trMul, avail: Math.min(stk.qty, Math.max(0, ship)), q: stk.q, internal };
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
    if (!cd.internal) { seller.cash += total; seller.ledger.revenue += total; cd.b.report.revenue += total; cd.b.report.sold += n; }
  }
  return { qty: n, q: cd.q };
}
function addStock(st: Stock, qty: number, q: number) {
  if (qty <= 0) return; const t = st.qty + qty; st.q = (st.qty * st.q + qty * q) / t; st.qty = t;
}

// ---------------------------------------------------------------- turn
export function processTurn(s: GameState) {
  if (s.finished) return;
  const live = s.companies.filter(c => !c.bankrupt);
  for (const b of Object.values(s.buildings)) b.shipped = 0;
  for (const c of live) { c.ledger = emptyLedger(); c.news = c.news.filter(n => n.turn > s.turn - 12); }
  if (!s.world) buildWorld(s);
  for (const b of Object.values(s.buildings)) { b.report = emptyReport(); ensureLayout(b); syncLayout(b); }

  updateMarket(s);
  refreshHarbours(s);
  refreshCandidates(s);
  spawnVacancies(s);
  spawnSubsidies(s);
  for (const c of live) if (c.isAI) aiTurn(s, c);

  // production tiers: raw first, then deeper recipes
  const producers = Object.values(s.buildings).filter(b => b.product && b.type !== 'store' && b.type !== 'rd' && !s.companies.find(c => c.id === b.owner)!.bankrupt);
  shuffle(s, producers).sort((a, b) => PRODUCTS[a.product!].depth - PRODUCTS[b.product!].depth);
  for (const b of producers) produce(s, b);

  // stores buy
  for (const b of shuffle(s, Object.values(s.buildings).filter(b => b.type === 'store'))) storeBuy(s, b);

  // retail
  retail(s);
  sellWorld(s);

  // R&D
  for (const b of Object.values(s.buildings)) if (b.type === 'rd' && b.product) {
    const c = s.companies.find(x => x.id === b.owner)!;
    const pts = b.workers * 0.15 * moraleFactor(s, b) * (0.6 + 0.4 * b.condition / 100);
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
  for (const city of s.cities) {
    const growth = 0.002 + 0.001 * (city.wealth - 1);
    city.pop = Math.round(city.pop * (1 + growth));
    city.wealth = round2(clamp(city.wealth + rr(s, -0.01, 0.012) * (city.wealth > 1.4 ? 0.2 : 1), 0.6, 1.8));
  }
  s.turn++;
  for (const c of live) c.ready = c.isAI;
  checkEnd(s);
}

function sellWorld(s: GameState) {
  const used: Partial<Record<ProductId, number>> = {};
  const sell = (b: Building, p: ProductId, st: Stock) => {
    const co = s.companies.find(x => x.id === b.owner)!; if (co.bankrupt) return;
    const vol = worldVolume(p), u = used[p] ?? 0, n = Math.min(st.qty, vol - u); if (n < 0.5) return;
    const pr = (x: number) => worldPrice(s, p) * (1 - WORLD_DROP * x / vol);
    const total = n * (pr(u) + pr(u + n)) / 2 * (0.6 + 0.4 * st.q / 100);
    st.qty -= n; used[p] = u + n; co.cash += total; co.ledger.revenue += total; b.report.revenue += total; b.report.sold += n;
    b.report.note += ` Sold ${Math.round(n)} ${PRODUCTS[p].name} to the world market for ${fmtMoney(Math.round(total))}.`;
  };
  for (const b of shuffle(s, Object.values(s.buildings))) {
    if (b.type === 'store' || b.type === 'rd') continue;
    if (b.world && b.product) sell(b, b.product, b.stock);
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
  L.forEach((cell, i) => { if (cell.m === 'line' && cell.product) capLeft.set(i, PRODUCTS[cell.product].cap * (1 + 0.06 * b.auto) * eff * staffRatio(b, i)); });
  const impLeft = new Map<number, number>();
  L.forEach((cell, i) => { if (cell.m === 'import' && cell.product) impLeft.set(i, PRODUCTS[cell.product].cap * 3 * staffRatio(b, i)); });
  const neigh = (i: number) => adj8(i).filter(j => isLinked(b, i, j));
  const notes = new Set<string>();
  const make = (i: number, wanted: number, path: Set<number>): { qty: number; q: number } => {
    const X = L[i].product!; const left = capLeft.get(i) ?? 0;
    let units = Math.min(wanted, left); if (units <= 1e-6) return { qty: 0, q: 0 };
    const recipe = Object.entries(PRODUCTS[X].recipe) as [ProductId, number][]; let qs = 0;
    for (const [Y, per] of recipe) {
      const need = units * per; let have = 0, qsum = 0;
      for (const j of neigh(i)) {
        if (have >= need - 1e-6) break; const cell = L[j];
        if (cell.m === 'import' && cell.product === Y) {
          for (const w of whFor(b, j, Y)) { const sp = L[w].stock; if (sp && sp.qty > 1e-6 && have < need - 1e-6) { const t = Math.min(need - have, sp.qty); sp.qty -= t; have += t; qsum += t * sp.q; } }
          if (have >= need - 1e-6) continue;
          const room = impLeft.get(j) ?? 0; if (room <= 1e-6) { notes.add('Import cell #' + (j + 1) + ' (' + PRODUCTS[Y].name + ') is not staffed enough.'); continue; } const r = acquire(s, b, Y, Math.min(need - have, room), cell.source ?? ''); impLeft.set(j, room - r.qty); have += r.qty; qsum += r.qty * r.q; }
        else if (cell.m === 'line' && cell.product === Y && !path.has(j)) { const np = new Set(path); np.add(j); const r = make(j, need - have, np); have += r.qty; qsum += r.qty * r.q; }
      }
      if (have < need - 1e-6) notes.add(PRODUCTS[X].name + ' line short of ' + PRODUCTS[Y].name + '.');
      units = Math.min(units, have / per); qs += have > 0 ? qsum / have : 0;
    }
    units = Math.max(0, units); capLeft.set(i, left - units);
    const inputQ = recipe.length ? qs / recipe.length : 60;
    return { qty: units, q: clamp(0.6 * (25 + 0.75 * c.tech[X]) + 0.4 * inputQ + 3 * fx.qa, 5, 100) };
  };
  let total = 0, qsum = 0;
  L.forEach((cell, i) => {
    if (cell.m !== 'line' || cell.product !== final) return;
    const want = Math.min((capLeft.get(i) ?? 0) * (b.target / 100), room - total); if (want <= 1e-6) return;
    const r = make(i, want, new Set([i])); total += r.qty; qsum += r.qty * r.q;
  });
  addStock(b.stock, total, total > 0 ? qsum / total : 50);
  b.report.produced = Math.round(total * 10) / 10;
  // warehouses stockpile imported inputs with the import capacity left over this month
  L.forEach((cell, i) => {
    if (cell.m !== 'import' || !cell.product) return; const Y = cell.product;
    for (const w of whFor(b, i, Y)) {
      const st = (L[w].stock ??= emptyStock()); const left2 = impLeft.get(i) ?? 0; const want = Math.min(left2, whCap(b, w) - st.qty); if (want <= 1e-6) continue;
      const r = acquire(s, b, Y, want, cell.source ?? ''); addStock(st, r.qty, r.q); impLeft.set(i, left2 - r.qty);
    }
  });
  // export cells collect their product from linked lines (spare capacity) and import cells (spare buying capacity)
  L.forEach((cell, e) => {
    if (cell.m !== 'export' || !cell.product) return; const P = cell.product; const st = (cell.stock ??= emptyStock());
    for (const i of adj8(e)) {
      if (!isLinked(b, e, i) || L[i].product !== P) continue; const roomE = exportCap(b, e) - st.qty; if (roomE <= 1e-6) break;
      if (L[i].m === 'line') { const want = Math.min(capLeft.get(i) ?? 0, roomE); if (want > 1e-6) { const r = make(i, want, new Set([i])); addStock(st, r.qty, r.q); } }
      else if (L[i].m === 'import') { const left = impLeft.get(i) ?? 0; const want = Math.min(left, roomE); if (want > 1e-6) { const r = acquire(s, b, P, want, L[i].source ?? ''); addStock(st, r.qty, r.q); impLeft.set(i, left - r.qty); } }
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
  for (const c of b.layout ?? []) if ((c.m === 'warehouse' || c.m === 'export') && c.stock && c.product) c.stock.qty *= 1 - PRODUCTS[c.product].spoil * 0.5;
  const eff = efficiency(s, b) * seasonFactor(s, b) * (1 + mgrBonus(s, b).prod);
  const storage = PRODUCTS[b.product!].cap * b.lines * 2.5 * (1 + 0.5 * (fx?.warehouse ?? 0));
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
  if (eff < 0.95) note += `Efficiency ${(eff * 100).toFixed(0)}% (staff ${b.workers}/${requiredWorkers(b)}, cond ${b.condition.toFixed(0)}%). `;
  const q = clamp(0.6 * (25 + 0.75 * c.tech[b.product!]) + 0.4 * inputQ + 3 * (fx?.qa ?? 0), 5, 100);
  addStock(b.stock, max, q);
  b.report.produced = Math.round(max * 10) / 10; b.report.note = note.trim();
}

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

function retail(s: GameState) {
  const season = (p: ProductId) => p === 'fuel' ? 1 + 0.1 * Math.sin((s.turn % 12) / 12 * 2 * Math.PI) : 1;
  for (const city of s.cities) {
    const stores = Object.values(s.buildings).filter(b => b.type === 'store' && b.city === city.id && !s.companies.find(c => c.id === b.owner)!.bankrupt);
    const terr = (idx: number) => ({ u: 1.25, s: 1.0 } as Record<string, number>)[terrainAt(s, idx)] ?? 0.7;
    for (const p of PRODUCT_LIST) {
      if (p.kind !== 'consumer') continue;
      const refP = retailRef(s, city.id, p.id);
      const lux = p.basePrice > 500 ? 1.5 : 0.5;
      const D = (city.pop / 1000) * p.demandPerK! * Math.pow(city.wealth, lux) * s.market[p.id].demand * season(p.id);
      type E = { sl?: StoreSlot; b?: Building; price: number; attr: number; cap: number; sold: number };
      const es: E[] = [];
      for (const b of stores) {
        const sl = b.slots.find(x => x.product === p.id); if (!sl) continue;
        const c = s.companies.find(x => x.id === b.owner)!;
        const staffEff = staffFactor(b.workers, requiredWorkers(b)) * moraleFactor(s, b);
        sl.sold = sl.revenue = sl.lost = 0;
        if (sl.stock.qty < 0.5 || sl.price <= 0) continue;
        const brand = c.brand[p.id];
        const mallB = b.mall ? MALL_TRAFFIC * (0.8 + 0.2 * (s.buildings[b.mall]?.condition ?? 100) / 100) : 1;
        const attr = Math.pow(refP / sl.price, 2.2) * Math.pow(0.4 + sl.stock.q / 80, 1.3) * (1 + brand / (b.mall ? 60 / MALL_BRAND_BOOST : 60)) * terr(b.idx) * mallB * (0.5 + 0.5 * staffEff);
        es.push({ sl, b, price: sl.price, attr, cap: Math.min(sl.stock.qty, slotCapacity(b, p.id) * Math.max(0.1, staffEff) * 1.3), sold: 0 });
      }
      const npc: E = { price: refP * NPC_SHARE_MARKUP, attr: Math.pow(1 / NPC_SHARE_MARKUP, 2.2) * Math.pow(0.4 + 40 / 80, 1.3) * 1.15, cap: Infinity, sold: 0 };
      const all = [...es, npc];
      const sumA = all.reduce((x, e) => x + e.attr, 0);
      const avgP = all.reduce((x, e) => x + e.price * e.attr, 0) / sumA;
      let remaining = D * clamp(Math.pow(refP / avgP, 1.2), 0.25, 1.8);
      let active = [...all];
      for (let pass = 0; pass < 5 && remaining > 0.01 && active.length; pass++) {
        const tot = active.reduce((x, e) => x + e.attr, 0); let used = 0; const next: E[] = [];
        for (const e of active) {
          const want = remaining * e.attr / tot; const take = Math.min(want, e.cap - e.sold);
          e.sold += take; used += take; if (e.cap - e.sold > 0.01) next.push(e);
        }
        remaining -= used; active = next;
      }
      for (const e of es) {
        const sl = e.sl!, b = e.b!, c = s.companies.find(x => x.id === b.owner)!;
        const n = Math.min(e.sold, sl.stock.qty); sl.stock.qty -= n;
        sl.sold = Math.round(n * 10) / 10; sl.revenue = n * sl.price; sl.lost = Math.max(0, Math.round(remaining > 0 ? remaining / Math.max(1, es.length) : 0));
        if (n >= 0.5 && sl.product) { const k = c.id + ':' + sl.product; s.sold ??= {}; if (!s.sold[k]) { s.sold[k] = 1; s.news.push({ turn: s.turn, kind: 'good', tag: 'product', text: `${c.name} starts selling ${PRODUCTS[sl.product].name.toLowerCase()} in ${s.cities[b.city].name}.` }); } }
        c.cash += sl.revenue; c.ledger.revenue += sl.revenue; b.report.revenue += sl.revenue; b.report.sold += n; b.report.produced += 0;
      }
    }
  }
  for (const b of Object.values(s.buildings)) if (b.type === 'store') b.report.note = b.slots.filter(x => x.product).map(x => `${PRODUCTS[x.product!].name}: sold ${x.sold}`).join(' · ');
}

function closeBooks(s: GameState, c: Company) {
  const L = c.ledger;
  for (const b of Object.values(s.buildings)) {
    if (b.owner !== c.id) continue;
    const def = BUILDINGS[b.type];
    const mb = mgrBonus(s, b); const wages = Math.round(b.workers * b.wage * (1 - mb.exp)); const maint = Math.round(b.invested * def.maintPct / 100 * b.maint / 100 * (1 - mb.exp));
    L.wages += wages; L.maint += maint; b.report.wages = wages; b.report.maint = maint + (b.mall ? b.rent ?? 0 : 0);
    b.hist = [...(b.hist ?? []), Math.round(b.report.revenue - b.report.purchases - wages - maint)].slice(-12);
    b.condition = clamp(b.condition + (b.maint / 100) * 2.5 - 2, 0, 100);
    const wr = b.wage / cityWage(s, b.city);
    if (wr < 0.9 && b.workers > 0) { const quit = Math.floor(b.workers * (0.9 - wr) * 0.6 + rnd(s)); if (quit > 0) { if (b.type === 'factory' && b.layout) removeWorkers(b, quit); else b.workers = Math.max(0, b.workers - quit); b.report.note += ` ${quit} workers quit over low pay.`; } }
  }
  for (const m of c.staff ?? []) L.wages += m.salary;
  for (const [p, budget] of Object.entries(c.ads) as [ProductId, number][]) L.ads += budget;
  for (const p of PRODUCT_LIST) c.brand[p.id] = Math.min(100, c.brand[p.id] * 0.92 + 0.8 * Math.sqrt((c.ads[p.id] ?? 0) / 100));
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
function tryBuild(s: GameState, c: Company, btype: BuildingType, product: ProductId, cityPref?: number): Building | null {
  const def = BUILDINGS[btype];
  const cities = shuffle(s, s.cities.map(x => x.id)); if (cityPref != null) cities.unshift(cityPref);
  for (const city of cities) {
    const idx = freeLot(s, city, def.terrain, btype === 'store'); if (idx < 0) continue;
    const r = applyAction(s, c.id, { type: 'build', idx, btype, product });
    if ('ok' in r) return s.buildings[r.info!];
  }
  return null;
}
/** AI helper: pick the cheapest landed source (own factory, a rival factory that sells to everyone, or a harbour import). */
function bestSource(s: GameState, buyer: Building, product: ProductId): string {
  let best = '', bc = Infinity;
  for (const o of Object.values(s.buildings)) {
    if (o.product !== product || o.type === 'store' || o.type === 'rd' || o.id === buyer.id) continue;
    const internal = o.owner === buyer.owner; if (!internal && o.listPrice == null) continue;
    const cost = (internal ? 0 : o.listPrice!) + transportPerUnit(s, product, o.city, buyer.city) * (railLink(s, o.idx, buyer.idx) ? RAIL_COST_MUL : 1);
    if (cost < bc) { bc = cost; best = o.id; }
  }
  for (const city of s.cities) { const gd = harbourStocks(s.cities, harbourId(city.id), product); if (!gd) continue; const cost = harbourGoodPrice(s, gd) + transportPerUnit(s, product, city.id, buyer.city) * (railLink(s, cityTile(s, city), buyer.idx) ? RAIL_COST_MUL : 1); if (cost < bc) { bc = cost; best = harbourId(city.id); } }
  return best;
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
        sl.source = bestSource(s, b, sl.product!);
      }
    } else if (b.product && b.type !== 'rd') {
      const base = PRODUCTS[b.product].basePrice * s.market[b.product].idx;
      b.listPrice = round2(base * (1.02 + (b.stock.qty > capacity(b) * 1.5 ? -0.08 : 0.04)));
      if (b.type === 'factory') { ensureLayout(b); for (const cell of b.layout!) if (cell.m === 'import' && cell.product) cell.source = bestSource(s, b, cell.product); }
    }
  }
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
    const btype: BuildingType = def.kind === 'raw' ? (p === 'timber' ? 'forest' : p === 'ore' ? 'mine' : p === 'oil' ? 'oil' : 'farm') : 'factory';
    if (tryBuild(s, c, btype, p, mine[0]?.city)) return;
  }
  // store in a city we don't serve yet
  const served = new Set(mine.filter(b => b.type === 'store').map(b => b.city));
  const target = s.cities.filter(x => !served.has(x.id)).sort((a, b) => b.pop - a.pop)[0];
  if (target) { const st = tryBuild(s, c, 'store', c.aiFocus!, target.id); if (st) { st.slots[0] = { ...st.slots[0], product: c.aiFocus!, price: retailRef(s, st.city, c.aiFocus!), order: 100, source: '' }; return; } }
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
      for (const corner of [0, 2, 6, 8]) {
        if (L[corner].m) continue;
        const nb = adj4(corner).filter(j => L[j].m === 'import');
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
const MGR_SPECS: BuildingType[] = ['farm', 'forest', 'mine', 'oil', 'factory', 'store', 'rd'];
function makePerson(s: GameState, kind: 'manager' | 'advisor'): Person {
  const stat = () => clamp(Math.round(2 + rnd(s) * rnd(s) * 8 + rnd(s) * 2), 1, 10); // mostly mediocre, rarely brilliant
  const p: Person = {
    id: 'p' + s.nextId++, name: FIRST[Math.floor(rnd(s) * FIRST.length)] + ' ' + LAST[Math.floor(rnd(s) * LAST.length)], portrait: Math.floor(rnd(s) * 72),
    age: 26 + Math.floor(rnd(s) * 36), kind, spec: '', eff: 0, prod: 0, exp: 0, skill: 0, salary: 0,
  };
  if (kind === 'manager') {
    p.spec = MGR_SPECS[Math.floor(rnd(s) * MGR_SPECS.length)]; p.eff = stat(); p.prod = stat(); p.exp = stat();
    p.salary = Math.round((1500 + (p.eff + p.prod + p.exp) * 330) / 50) * 50;
  } else {
    const k = Object.keys(ADVISOR_SPECS); p.spec = k[Math.floor(rnd(s) * k.length)]; p.skill = stat(); p.salary = Math.round((2000 + p.skill * 900) / 50) * 50;
  }
  return p;
}
/** Keep the job market stocked: some candidates leave, new ones appear. */
export function refreshCandidates(s: GameState, initial = false) {
  let pool = (s.candidates ??= []);
  if (!initial) s.candidates = pool = pool.filter(() => rnd(s) > 0.3);
  while (pool.filter(x => x.kind === 'manager').length < 7) pool.push(makePerson(s, 'manager'));
  while (pool.filter(x => x.kind === 'advisor').length < 4) pool.push(makePerson(s, 'advisor'));
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
    for (const b of mine) { if (!b.product || b.type === 'store') continue; const e = efficiency(s, b); if (e < 0.8) { const why = b.condition < 60 ? 'its condition is poor — raise maintenance' : b.wage < cityWage(s, b.city) * 0.95 ? 'wages are below the city average' : 'it is understaffed'; add(`${b.name} runs at ${(e * 100).toFixed(0)}%: ${why}.`, 'bad', 5 + (1 - e) * 5, b.id); } }
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
const VACANT_WEIGHTS: [BuildingType, number][] = [['factory', 30], ['store', 24], ['farm', 14], ['forest', 8], ['mine', 8], ['oil', 6], ['rd', 5]];
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
    if (!['forest', 'mine', 'oil', 'farm'].includes(type) && Math.hypot(c.x / WORLD_SCALE - (idx % W), c.y / WORLD_SCALE - Math.floor(idx / W)) > 14) continue;
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
  s.vacant = (s.vacant ?? []).filter(v => s.turn - v.listedTurn < VACANT_LIFE && !s.lots[lotKey(v.idx)]);
  const r = rnd(s), n = r < 0.15 ? 0 : r < 0.55 ? 1 : 2;
  for (let i = 0; i < n && s.vacant.length < VACANT_MAX; i++) spawnVacancy(s);
}

// ---------------------------------------------------------------- malls
/** Monthly: tenants pay their rent, leases renew at the mall's current rent, units without a branded product are evicted, orphaned units disappear. */
function collectRents(s: GameState) {
  for (const u of Object.values(s.buildings).filter(x => x.mall)) {
    const m = s.buildings[u.mall!]; const t = s.companies.find(x => x.id === u.owner)!;
    if (!m || t.bankrupt) { removeBuilding(s, u); continue; }
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
    id: m.id, owner: m.owner, name: m.name, city: m.city, idx: m.idx, rent: m.rent ?? 0, units: MALL_UNITS, cond: Math.round(m.condition),
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
