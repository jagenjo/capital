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
  starter?: boolean;        // every new player company begins with a small working business (farm + bakery + shop) instead of only cash
}

/** One cell of a factory layout. line: manufactures `product`; import: buys `product` from `source`. */
export interface LayoutCell { m: ModuleType | null; product?: ProductId; source?: string; workers?: number; stock?: Stock; listPrice?: number | null; auto?: boolean; world?: boolean;
  rate?: number; effort?: number; // production line: output limit % (0-100) and quality effort % (50-150: more quality costs more ingredients and slows the line)
  made?: number; madeQ?: number; moved?: number; // last month: units a line made (and their quality); units an import cell bought, a warehouse stored, an export cell collected
} // warehouse: product + stock = the ONE good it holds
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
  produced: number; quality?: number; sold: number; revenue: number; purchases: number; wages: number; maint: number; note: string;
  soldLocal?: number; soldCo?: number; soldWorld?: number; // units sold: to the local market (shoppers), to other companies, to the world market (parts of `sold`)
}

export interface Building {
  strikeUntil?: number; // workers on strike: the building does nothing until this turn (inclusive)
  id: string; owner: string; type: BuildingType; city: number; idx: number; name: string;
  product: ProductId | null;
  lines: number; auto: number; size: number;
  workers: number; wage: number; maint: number; condition: number; target: number;
  stock: Stock;
  inputs: Partial<Record<ProductId, Stock>>;
  sources: Partial<Record<ProductId, string>>;
  listPrice: number | null;
  slots: StoreSlot[];
  super?: boolean;              // a supermarket: a store that carries only SUPER_PRODUCTS and sells to the people of its 5x5 area
  expand?: number[];            // mines / wells / farms / logging camps: extra tiles of the 5x5 square bought as expansions
  building?: number;            // months of construction still to go: the building does nothing until it is finished
  rent?: number;                // mall: asking rent per unit / mall unit: monthly rent being paid
  mall?: string; leaseEnd?: number; // mall unit (a small store inside someone's mall): the mall's building id, lease end turn
  grid?: number; // side of the layout grid (urban 2, suburb 3, other 4)
  layout?: LayoutCell[]; // factory facility grid (cells)
  links?: string[];      // connections between adjacent cells, 'a-b' with a<b
  invested: number;
  builtTurn: number;
  shipped?: number; world?: boolean; // units shipped to other cities this month
  hist?: number[]; // operating result of the last 12 months
  decor?: number; // a store's decoration level 0-100: it raises the brand of the products on its shelves every month and fades slowly
  prodHist?: { p: number; s: number; q?: number }[]; // units produced, units sold and the quality of what was made, the last 24 months
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
  term?: number; contractEnd?: number; // contract length in months; the turn it expires (staff only)
  myBid?: number; bidders?: number; // view only
  bids?: { company: string; salary: number }[]; // sealed bids on the job market; the highest wins when the turn ends
}
/** A ready-built facility for sale: cheaper than building from scratch, but worn. */
export interface Vacancy {
  id: string; type: BuildingType; city: number; idx: number; product: ProductId | null;
  cond: number; land: number; build: number; // condition %, price of the land and of the building
  listedTurn: number; origin: 'closure' | 'bankrupt' | 'estate'; perm?: boolean; // perm: never expires
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
  agenda?: Card[]; // this month's decision cards (answered before the turn ends, or the default option applies)
  mergedInto?: string; // set when a company holding more than half of its shares took it over
}

/** A private message between two companies. */
export interface Message { id: number; from: string; to: string; turn: number; text: string; seen?: boolean }
export interface Lot { owner: string; paid: number }
export interface NewsItem { turn: number; text: string; kind: 'info' | 'good' | 'bad'; tag?: 'opening' | 'product' | 'market' | 'vacant' | 'subsidy' | 'announce' | 'growth' }
export interface Effect { kind: string; until: number; city?: number; product?: ProductId; value: number }

/** A paid notice in the newspaper: bought in turn `turn`, printed in the issue of the next turn. */
export interface Article { id: number; company: string; turn: number; text: string }
export interface AdContract { id: string; owner: string; media: string; product: ProductId; fee: number; start: number; end: number }

export interface GameState {
  articles?: Article[]; // paid newspaper notices
  orders?: Order[]; // sealed orders for contested actions, resolved at the start of the next turn
  contracts?: Contract[]; // supply contracts (offers, active, and the recently finished or broken ones)
  adContracts?: AdContract[]; // running advertising contracts with media outlets
  messages?: Message[];
  subsidies?: Subsidy[]; // open city incentives
  vacant?: Vacancy[]; // facilities for sale
  candidates?: Person[]; // job market shared by all companies
  sold?: Record<string, 1>; // 'company:product' pairs already reported as 'starts selling'
  settings: Settings;
  turn: number;
  rng: number;
  nextId: number;
  cities: City[];
  world?: { v: number; rev?: number; w: number; h: number; tiles: string; qual?: string; rails?: { a: number; b: number; tiles: number[] }[] };
  dist?: number[][]; // travel distance between cities (roads/ferries)
  companies: Company[];
  buildings: Record<string, Building>;
  lots: Record<string, Lot>; // key `${city}:${idx}`
  market: Record<string, { idx: number; demand: number; prev?: number }>;
  sales?: { local: Record<string, Record<string, number>>; world: Record<string, Record<string, number>> }; // units sold last turn per product and company ('npc' = imports / background shops)
  salesHist?: Record<string, { l: number[]; w: number[]; d: number[] }>;
  served?: Record<string, number[]>; // per urban tile: units of each GROW_ALL product its shops sold it last month, then what it wanted (same order)
  tileScore?: Record<string, number>; // per urban tile: needs met last month, 0-100 // per product, last 36 turns: units sold locally / to the world / demanded by the cities
  worldSold?: Record<string, number>; // units each good sold to the world market last turn
  effects: Effect[];
  news: NewsItem[];
  interest: number; // monthly rate
  finished: boolean;
  winner?: string;
  endReason?: string;
}

export type Action =
  | { type: 'build'; idx: number; btype: BuildingType; product?: ProductId; grid?: number; bid?: number }
  | { type: 'sellBuilding'; id: string }
  | { type: 'releaseLot'; idx: number }
  | { type: 'buyExpansion'; id: string; idx: number; bid?: number }
  | { type: 'setProduct'; id: string; product: ProductId }
  | { type: 'setStaff'; id: string; workers: number; wage: number }
  | { type: 'setTarget'; id: string; pct: number }
  | { type: 'setMaint'; id: string; pct: number }
  | { type: 'setListPrice'; id: string; price: number | null }
  | { type: 'setWorldSell'; id: string; cell?: number; on: boolean }
  | { type: 'setSource'; id: string; product: ProductId; source: string }
  | { type: 'setModule'; id: string; cell: number; module: ModuleType | null }
  | { type: 'setCell'; id: string; cell: number; product?: ProductId | null; source?: string; price?: number | null; rate?: number; effort?: number; discard?: boolean }
  | { type: 'setLink'; id: string; a: number; b: number; on?: boolean; dir?: 'ab' | 'ba' | 'plain' | 'none' }
  | { type: 'setCellStaff'; id: string; cell: number; workers: number }
  | { type: 'addLine'; id: string }
  | { type: 'upgradeAuto'; id: string }
  | { type: 'upgradeSize'; id: string }
  | { type: 'decorate'; id: string; amount: number }
  | { type: 'setSlot'; id: string; slot: number; product: ProductId | null; price: number; order: number; source: string }
  | { type: 'adContract'; media: string; product: ProductId; months: number }
  | { type: 'cancelAd'; id: string }
  | { type: 'rename'; id: string; name: string }
  | { type: 'takeLoan'; lender: string; amount: number; term: number; collateral: string[] }
  | { type: 'repayLoan'; id: string; amount: number }
  | { type: 'buyShares'; company: string; qty: number; bid?: number }
  | { type: 'sellShares'; company: string; qty: number }
  | { type: 'issueShares'; qty: number }
  | { type: 'buybackShares'; qty: number }
  | { type: 'buyVacant'; id: string; bid?: number }
  | { type: 'setRent'; id: string; rent: number }
  | { type: 'rentUnit'; id: string; product: ProductId }
  | { type: 'sendMessage'; to: string; text: string }
  | { type: 'publishArticle'; text: string }
  | { type: 'readMessages'; from: string }
  | { type: 'bid'; id: string; salary: number }
  | { type: 'withdrawBid'; id: string }
  | { type: 'fire'; id: string }
  | { type: 'assign'; id: string; building: string | null }
  | { type: 'setPolicy'; dividend: number; invest: number; target: 'facilities' | 'rd' | 'debt' }
  | { type: 'cancelOrder'; id: string }
  | { type: 'answerCard'; id: string; option: string }
  | { type: 'proposeContract'; to: string; role: 'sell' | 'buy'; product: ProductId; qty: number; price: number; months: number; penalty: number; building: string }
  | { type: 'answerContract'; id: string; accept: boolean; building?: string }
  | { type: 'cancelContract'; id: string };

/** A sealed order: an action several companies may want (a lot, a facility for sale, shares). Resolved at the turn's start: the highest bid wins. */
export interface Order { id: string; company: string; turn: number; key: string; bid: number; action: Action; label: string }
/** A decision card: a situation with a few choices; unanswered cards take the default option when the month is played. */
export interface CardOption { id: string; label: string; hint: string }
export interface Card { id: string; kind: string; turn: number; title: string; text: string; options: CardOption[]; def: string; choice?: string; ctx: Record<string, string | number> }
/** A supply contract: the seller delivers `qty` units a month from one facility at a fixed price for `months` months; every unit short costs `penalty`.
 *  buyer is a company id or 'npc' (a wholesale customer in `city`). An offer becomes active when the other side accepts. */
export interface Contract {
  id: string; status: 'offer' | 'active' | 'done' | 'broken'; proposer: string; to: string; // to: the company that must accept ('npc' contracts start active)
  seller: string; buyer: string; product: ProductId; qty: number; price: number; months: number; penalty: number;
  from?: string; dest?: string; city?: number; // seller's facility, buyer's receiving facility, npc buyer's city
  delivered: number; lastDelivered?: number; turn: number;
  term?: number; ended?: number; brokenBy?: string; // original length; turn it finished ('done') or was broken, and by whom
}

/** A buyer of a facility's goods: a building that took it as the source of a shelf / import cell / supply, or a supply contract. */
export interface Customer { id: string; name: string; owner: string; type?: BuildingType; city: number; product: ProductId; how: 'source' | 'contract'; qty?: number }

export interface MallInfo { opensIn: number; id: string; owner: string; name: string; city: number; idx: number; rent: number; units: number; cond: number; tenants: { company: string; product: ProductId | null; rent: number; leaseEnd: number; building: string }[] }
export interface Listing { building: string; company: string; city: number; product: ProductId; price: number; qty: number; q: number }

// What the client receives
export interface View {
  gameId: string; gameName: string; status: string;
  turn: number; date: string; settings: Settings; nextTurnAt: number | null; serverNow: number; paused: boolean;
  cities: City[];
  worldId: string;
  worldRev: number;
  customers: Record<string, Customer[]>; // per facility: who it supplies (shops, factories, farms that chose it as a source; supply contracts). Only links that involve you.
  tileScore: Record<string, number>; // needs met per urban tile last month (0-100), for the map layer // grows when the city tiles change: reload the world map
  dist: number[][];
  me: Company & { netWorth: number; maxDebt: number; overdraftLimit: number };
  buildings: Building[];             // own buildings (full)
  others: { building?: number; id: string; owner: string; type: BuildingType; city: number; idx: number; name: string; product: ProductId | null; super?: boolean; products?: ProductId[]; sells?: { product: ProductId; price: number; q: number; qty?: number }[]; shelf?: { product: ProductId; price: number; q: number; qty: number }[] }[];
  companies: { id: string; name: string; color: string; portrait: number; isAI: boolean; netWorth: number; price: number; prevPrice: number; priceHist: number[]; shares: number; float: number; held: number; lastDps: number; holders: { id: string; qty: number }[]; buildings: number; ready: boolean; bankrupt: boolean; online: boolean }[];
  lots: Record<string, Lot>;
  market: Record<string, { idx: number; demand: number; importPrice: number; retail: number; worldSold: number; prev: number }>;
  listings: Listing[];
  salesHist: Record<string, { l: number[]; w: number[]; d: number[] }>;
  sales: { local: Record<string, Record<string, number>>; world: Record<string, Record<string, number>> };
  cityWages: number[];
  cityLabor: { used: number; pool: number }[];
  news: NewsItem[];
  finished: boolean; winner?: string; endReason?: string;
  articles: Article[]; adContracts: AdContract[]; mediaUsed: Record<string, number>; competitors: (Omit<Person, 'bids'> & { company: string; monthsLeft: number; offerable: boolean })[]; messages: Message[]; subsidies: Subsidy[]; malls: MallInfo[]; vacant: Vacancy[]; candidates: (Omit<Person, 'bids'> & { myBid?: number; bidders: number })[]; advice: { topic: string; text: string; tone: 'good' | 'bad' | 'info'; building?: string }[];
  rankings: { id: string; name: string; netWorth: number }[];
  orders: Order[]; contracts: Contract[];
}
