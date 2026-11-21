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
  town?: boolean; // small settlement: suburb tiles only, no downtown, no port, no railway
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
  rent?: number;                // mall: asking rent per unit / mall unit: monthly rent being paid
  mall?: string; leaseEnd?: number; // mall unit (a small store inside someone's mall): the mall's building id, lease end turn
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

/** A loan contract: an obligation with a monthly payment, a deadline and optional collateral. */
export interface Loan {
  id: string; lender: string;
  original: number; principal: number;  // principal = still owed
  rate: number;                           // monthly interest, fixed when signed
  type: 'amortizing' | 'bullet'; term: number; elapsed: number; startTurn: number; // due on turn startTurn + term
  installment: number;                    // principal repaid each month (amortizing)
  collateral: string[];                   // building ids pledged to the lender
  late: number; defaulted?: boolean;      // missed payments in a row; 3 = foreclosure
}
/** What a company does with its profit when the fiscal year closes (December). Whatever is not paid out or invested stays as cash. */
export interface Policy { dividend: number; invest: number; target: 'facilities' | 'rd' | 'debt' } // dividend / invest = % of the year's profit
/** A person on the job market. Managers run one facility each; advisors give insights. */
export interface Person {
  id: string; name: string; portrait: number; age: number; kind: 'manager' | 'advisor';
  spec: string;       // manager: building type they know best; advisor: 'market' | 'finance' | 'production' | 'intel'
  eff: number; prod: number; exp: number; // manager stats 1-10: efficiency, productivity, expense control
  skill: number;      // advisor skill 1-10 (more and better insights)
  salary: number;     // per month
  assigned?: string | null; hiredTurn?: number;
}
/** A ready-built facility for sale: cheaper than building from scratch, but worn. */
export interface Vacancy {
  id: string; type: BuildingType; city: number; idx: number; product: ProductId | null;
  cond: number; land: number; build: number; // condition %, price of the land and of the building
  listedTurn: number; origin: 'closure' | 'bankrupt' | 'estate';
}
/** A city's offer to the first company that sets up a kind of business in its area. */
export interface Subsidy {
  id: string; city: number; kind: BuildingType; product?: ProductId;
  reward: 'land' | 'tax'; amount: number;  // land: share of the land price paid by the city; tax: share of the company tax waived
  months: number;                           // tax: how long the break lasts
  listedTurn: number; expires: number;
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
  loans?: Loan[];
  // stock market: `shares` exist in total; `float` is held by the market, the rest by the company itself (treasury) and investors (their `portfolio`)
  shares?: number; float?: number; price?: number; priceHist?: number[]; portfolio?: Record<string, number>; policy?: Policy; lastDps?: number; lastYear?: { profit: number; dividends: number; invested: number; target: string };
  staff?: Person[];
  taxBreak?: { city: number; cut: number; until: number }; // company tax reduced while it has a building in that city
  research?: Partial<Record<ProductId, number>>; // R&D points spent unlocking hi-tech products
}

export interface Lot { owner: string; paid: number }
export interface NewsItem { turn: number; text: string; kind: 'info' | 'good' | 'bad'; tag?: 'opening' | 'product' | 'market' | 'vacant' | 'subsidy' }
export interface Effect { kind: string; until: number; city?: number; product?: ProductId; value: number }

export interface GameState {
  subsidies?: Subsidy[]; // open city incentives
  vacant?: Vacancy[]; // facilities for sale
  candidates?: Person[]; // job market shared by all companies
  sold?: Record<string, 1>; // 'company:product' pairs already reported as 'starts selling'
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
  market: Record<string, { idx: number; demand: number; prev?: number }>;
  worldSold?: Record<string, number>; // units each good sold to the world market last turn
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
  | { type: 'takeLoan'; lender: string; amount: number; term: number; collateral: string[] }
  | { type: 'repayLoan'; id: string; amount: number }
  | { type: 'buyShares'; company: string; qty: number }
  | { type: 'sellShares'; company: string; qty: number }
  | { type: 'issueShares'; qty: number }
  | { type: 'buybackShares'; qty: number }
  | { type: 'buyVacant'; id: string }
  | { type: 'setRent'; id: string; rent: number }
  | { type: 'rentUnit'; id: string; product: ProductId }
  | { type: 'hire'; id: string }
  | { type: 'fire'; id: string }
  | { type: 'assign'; id: string; building: string | null }
  | { type: 'setPolicy'; dividend: number; invest: number; target: 'facilities' | 'rd' | 'debt' };

export interface MallInfo { id: string; owner: string; name: string; city: number; idx: number; rent: number; units: number; cond: number; tenants: { company: string; product: ProductId | null; rent: number; leaseEnd: number; building: string }[] }
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
  companies: { id: string; name: string; color: string; portrait: number; isAI: boolean; netWorth: number; price: number; prevPrice: number; priceHist: number[]; shares: number; float: number; held: number; lastDps: number; holders: { id: string; qty: number }[]; buildings: number; ready: boolean; bankrupt: boolean; online: boolean }[];
  lots: Record<string, Lot>;
  market: Record<string, { idx: number; demand: number; importPrice: number; retail: number; worldSold: number; prev: number }>;
  listings: Listing[];
  cityWages: number[];
  cityLabor: { used: number; pool: number }[];
  news: NewsItem[];
  finished: boolean; winner?: string; endReason?: string;
  subsidies: Subsidy[]; malls: MallInfo[]; vacant: Vacancy[]; candidates: Person[]; advice: { topic: string; text: string; tone: 'good' | 'bad' | 'info'; building?: string }[];
  rankings: { id: string; name: string; netWorth: number }[];
}
