import type { BuildingType, ProductId, ModuleType } from './data.js';

export interface Settings {
  name: string;
  startCash: number;
  startYear: number;
  maxMonths: number;        // game ends after this many turns
  targetNetWorth: number;   // first company reaching this wins (0 = disabled)
  aiCompanies: number;
  aiSkill: number;          // 0.5 (easy) .. 1.5 (hard)
  cityCount: number;
  maxPlayers: number;
  turnIntervalHours: number; // server plays a turn automatically this often
  advanceWhenReady: boolean; // play the turn as soon as all human players are ready
  seed: number;
  events: boolean;
}

/** One cell of a factory layout. line: manufactures `product`; import: buys `product` from `source`. */
export interface LayoutCell { m: ModuleType | null; product?: ProductId; source?: string; workers?: number; stock?: Stock; listPrice?: number | null; auto?: boolean; world?: boolean } // warehouse: product + stock = the ONE good it holds
export interface Stock { qty: number; q: number }

/** One of the 4 goods a harbour has in stock. Price = import price x mult. Replaced when sold out or after 12 months. */
export interface HarbourGood { product: ProductId; qty: number; mult: number; since: number }
export interface City {
  id: number; name: string; x: number; y: number;
  pop: number; wealth: number; wageIdx: number; priceIdx: number;
  port?: boolean;
  harbour?: HarbourGood[];
  radius: number; // approximate city size in tiles
}

export interface StoreSlot {
  product: ProductId | null;
  price: number;
  order: number;
  source: string; // 'auto' | building id
  stock: Stock;
  sold: number; revenue: number; lost: number; // last month
}

export interface BuildingReport {
  produced: number; sold: number; revenue: number; purchases: number; wages: number; maint: number; note: string;
}

export interface Building {
  id: string; owner: string; type: BuildingType; city: number; idx: number; name: string;
  product: ProductId | null;
  lines: number; auto: number; size: number;
  workers: number; wage: number; maint: number; condition: number; target: number;
  stock: Stock;
  inputs: Partial<Record<ProductId, Stock>>;
  sources: Partial<Record<ProductId, string>>;
  listPrice: number | null;
  slots: StoreSlot[];
  layout?: LayoutCell[]; // factory facility grid (cells)
  links?: string[];      // connections between adjacent cells, 'a-b' with a<b
  invested: number;
  builtTurn: number;
  shipped?: number; world?: boolean; // units shipped to other cities this month
  hist?: number[]; // operating result of the last 12 months
  report: BuildingReport;
}

export interface Ledger {
  revenue: number; purchases: number; transport: number; wages: number; maint: number; ads: number; interest: number; tax: number; profit: number;
}

export interface HistoryPoint { turn: number; cash: number; netWorth: number; revenue: number; profit: number; debt: number }

export interface Company {
  id: string; name: string; color: string; portrait: number;
  isAI: boolean; playerId?: string; aiFocus?: ProductId;
  cash: number; debt: number;
  tech: Record<ProductId, number>;
  brand: Record<ProductId, number>;
  ads: Partial<Record<ProductId, number>>;
  ledger: Ledger;
  history: HistoryPoint[];
  ready: boolean; bankrupt: boolean; negMonths: number; lossCarry: number;
  news: { turn: number; text: string }[];
}

export interface Lot { owner: string; paid: number }
export interface NewsItem { turn: number; text: string; kind: 'info' | 'good' | 'bad' }
export interface Effect { kind: string; until: number; city?: number; product?: ProductId; value: number }

export interface GameState {
  settings: Settings;
  turn: number;
  rng: number;
  nextId: number;
  cities: City[];
  world?: { v: number; w: number; h: number; tiles: string; rails?: { a: number; b: number; tiles: number[] }[] };
  dist?: number[][]; // travel distance between cities (roads/ferries)
  companies: Company[];
  buildings: Record<string, Building>;
  lots: Record<string, Lot>; // key `${city}:${idx}`
  market: Record<string, { idx: number; demand: number }>;
  effects: Effect[];
  news: NewsItem[];
  interest: number; // monthly rate
  finished: boolean;
  winner?: string;
  endReason?: string;
}

export type Action =
  | { type: 'build'; idx: number; btype: BuildingType; product?: ProductId }
  | { type: 'sellBuilding'; id: string }
  | { type: 'releaseLot'; idx: number }
  | { type: 'setProduct'; id: string; product: ProductId }
  | { type: 'setStaff'; id: string; workers: number; wage: number }
  | { type: 'setTarget'; id: string; pct: number }
  | { type: 'setMaint'; id: string; pct: number }
  | { type: 'setListPrice'; id: string; price: number | null }
  | { type: 'setWorldSell'; id: string; cell?: number; on: boolean }
  | { type: 'setSource'; id: string; product: ProductId; source: string }
  | { type: 'setModule'; id: string; cell: number; module: ModuleType | null }
  | { type: 'setCell'; id: string; cell: number; product?: ProductId | null; source?: string; price?: number | null }
  | { type: 'setLink'; id: string; a: number; b: number; on: boolean }
  | { type: 'setCellStaff'; id: string; cell: number; workers: number }
  | { type: 'addLine'; id: string }
  | { type: 'upgradeAuto'; id: string }
  | { type: 'upgradeSize'; id: string }
  | { type: 'setSlot'; id: string; slot: number; product: ProductId | null; price: number; order: number; source: string }
  | { type: 'setAds'; product: ProductId; budget: number }
  | { type: 'rename'; id: string; name: string }
  | { type: 'borrow'; amount: number }
  | { type: 'repay'; amount: number };

export interface Listing { building: string; company: string; city: number; product: ProductId; price: number; qty: number; q: number }

// What the client receives
export interface View {
  gameId: string; gameName: string; status: string;
  turn: number; date: string; settings: Settings; nextTurnAt: number | null; serverNow: number; paused: boolean;
  cities: City[];
  worldId: string;
  dist: number[][];
  me: Company & { netWorth: number; maxDebt: number; overdraftLimit: number };
  buildings: Building[];             // own buildings (full)
  others: { id: string; owner: string; type: BuildingType; city: number; idx: number; name: string; product: ProductId | null }[];
  companies: { id: string; name: string; color: string; portrait: number; isAI: boolean; netWorth: number; buildings: number; ready: boolean; bankrupt: boolean; online: boolean }[];
  lots: Record<string, Lot>;
  market: Record<string, { idx: number; demand: number; importPrice: number; retail: number }>;
  listings: Listing[];
  cityWages: number[];
  cityLabor: { used: number; pool: number }[];
  news: NewsItem[];
  finished: boolean; winner?: string; endReason?: string;
  rankings: { id: string; name: string; netWorth: number }[];
}
