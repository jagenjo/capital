// Static game data: products, building types, terrain. Shared by server engine and client UI.

export type ProductId =
  | 'grain' | 'livestock' | 'cotton' | 'corn' | 'vegetables' | 'fruits' | 'canned' | 'sugar' | 'beverages' | 'alcohol' | 'machinery' | 'ultrafood' | 'fabric' | 'shoes' | 'timber' | 'ore' | 'copper' | 'stone' | 'rare' | 'chemicals' | 'hygiene' | 'cleaning' | 'dairy' | 'pastry' | 'cmaterials' | 'buildings' | 'oil'
  | 'steel' | 'components' | 'plastics' | 'electronics'
  | 'bread' | 'meat' | 'furniture' | 'fuel' | 'clothing' | 'appliances' | 'computers' | 'cars'
  | 'phones' | 'tvs' | 'pharma' | 'robotics'; // phones, tvs, pharma, robotics, computers and cars are hi-tech: a company must research them (R&D) before it can manufacture them

export interface ProductDef {
  id: ProductId;
  name: string;
  kind: 'raw' | 'intermediate' | 'consumer';
  recipe: Partial<Record<ProductId, number>>; // inputs per output unit
  cap: number;          // units per line per month
  workers: number;      // workers per line
  rawPrice?: number;    // base price for raw goods
  demandPerK?: number;  // consumer demand: units per 1000 people per month
  spoil: number;        // monthly spoilage fraction of stock
  photo?: string;       // source picture of the product itself (only products that have one); everything is drawn from the atlas, see ATLAS
  unit: string;
  research?: number;    // hi-tech: research points a company needs (R&D building) before it may manufacture this
  after?: ProductId;    // ...and this product must already be unlocked
  // computed
  basePrice: number;
  depth: number;
}

export const BASE_WAGE = 2400;

type RawDef = Omit<ProductDef, 'basePrice' | 'depth'>;
const defs: RawDef[] = [
  { id: 'grain', name: 'Grain', kind: 'raw', recipe: {}, cap: 300, workers: 6, rawPrice: 110, spoil: 0.03, unit: 't' },
  { id: 'corn', name: 'Corn', kind: 'raw', recipe: {}, cap: 320, workers: 6, rawPrice: 95, spoil: 0.03, unit: 't' },
  { id: 'vegetables', name: 'Vegetables', kind: 'raw', recipe: {}, cap: 300, workers: 7, rawPrice: 85, spoil: 0.12, unit: 't' }, // fresh: spoils fast
  { id: 'cotton', name: 'Cotton', kind: 'raw', recipe: {}, cap: 250, workers: 6, rawPrice: 150, spoil: 0.01, unit: 't' },
  { id: 'livestock', name: 'Livestock', kind: 'raw', recipe: {}, cap: 100, workers: 6, rawPrice: 400, spoil: 0.04, unit: 'head' },
  { id: 'timber', name: 'Timber', kind: 'raw', recipe: {}, cap: 400, workers: 6, rawPrice: 90, spoil: 0, unit: 'm³' },
  { id: 'ore', name: 'Iron ore', kind: 'raw', recipe: {}, cap: 600, workers: 8, rawPrice: 70, spoil: 0, unit: 't' },
  { id: 'copper', name: 'Copper ore', kind: 'raw', recipe: {}, cap: 400, workers: 8, rawPrice: 140, spoil: 0, unit: 't' },
  { id: 'stone', name: 'Stone', kind: 'raw', recipe: {}, cap: 500, workers: 8, rawPrice: 55, spoil: 0, unit: 't' },
  { id: 'rare', name: 'Rare ores', kind: 'raw', recipe: {}, cap: 250, workers: 10, rawPrice: 260, spoil: 0, unit: 't' },
  { id: 'oil', name: 'Crude oil', kind: 'raw', recipe: {}, cap: 800, workers: 8, rawPrice: 60, spoil: 0, unit: 'bbl' },

  { id: 'steel', name: 'Steel', kind: 'intermediate', recipe: { ore: 2 }, cap: 200, workers: 12, spoil: 0, photo: 'method/steel.jpg', unit: 't' },
  { id: 'components', name: 'Components', kind: 'intermediate', recipe: { copper: 1.5 }, cap: 200, workers: 10, spoil: 0, photo: 'method/elecomp.jpg', unit: 'lot' },
  { id: 'cmaterials', name: 'Construction materials', kind: 'intermediate', recipe: { timber: 1, stone: 2 }, cap: 250, workers: 10, spoil: 0, unit: 't' },
  { id: 'chemicals', name: 'Chemicals', kind: 'intermediate', recipe: { rare: 1 }, cap: 200, workers: 12, spoil: 0, unit: 't' },
  { id: 'sugar', name: 'Sugar', kind: 'intermediate', recipe: { corn: 2 }, cap: 250, workers: 8, spoil: 0, unit: 't' },
  { id: 'fabric', name: 'Fabric', kind: 'intermediate', recipe: { cotton: 1.5 }, cap: 250, workers: 10, spoil: 0, unit: 't' },
  { id: 'plastics', name: 'Plastics', kind: 'intermediate', recipe: { oil: 1.5 }, cap: 250, workers: 10, spoil: 0, unit: 't' },
  { id: 'electronics', name: 'Electronics', kind: 'intermediate', recipe: { components: 1, plastics: 1 }, cap: 150, workers: 12, spoil: 0, unit: 'lot' },

  { id: 'bread', name: 'Bread', kind: 'consumer', recipe: { grain: 1 }, cap: 300, workers: 8, demandPerK: 5.0, spoil: 0.25, photo: 'method/bread.jpg', unit: 't' },
  { id: 'dairy', name: 'Dairy products', kind: 'consumer', recipe: { livestock: 1 }, cap: 200, workers: 8, demandPerK: 2.6, spoil: 0.15, unit: 't' },
  { id: 'pastry', name: 'Pastry & cakes', kind: 'consumer', recipe: { dairy: 1, grain: 1, sugar: 0.5 }, cap: 200, workers: 10, demandPerK: 1.8, spoil: 0.2, photo: 'method/cookie.jpg', unit: 't' },
  { id: 'fruits', name: 'Fruits', kind: 'raw', recipe: {}, cap: 280, workers: 7, rawPrice: 110, spoil: 0.12, unit: 't' }, // fresh: spoils fast
  { id: 'canned', name: 'Canned food', kind: 'consumer', recipe: { vegetables: 1, livestock: 1 }, cap: 250, workers: 9, demandPerK: 1.5, spoil: 0.01, unit: 't' },
  { id: 'beverages', name: 'Beverages', kind: 'consumer', recipe: { sugar: 1, fruits: 1 }, cap: 300, workers: 8, demandPerK: 3.2, spoil: 0.05, photo: 'method/cola.jpg', unit: 'kl' },
  { id: 'alcohol', name: 'Alcoholic drinks', kind: 'consumer', recipe: { sugar: 1, timber: 1 }, cap: 160, workers: 10, demandPerK: 1.4, spoil: 0.01, photo: 'method/wine.jpg', unit: 'kl' },
  { id: 'ultrafood', name: 'Ultra-processed food', kind: 'consumer', recipe: { dairy: 1, chemicals: 1, meat: 1, sugar: 1 }, cap: 180, workers: 12, demandPerK: 1.6, spoil: 0.03, photo: 'method/icecream.jpg', unit: 't' },
  { id: 'meat', name: 'Packaged meat', kind: 'consumer', recipe: { livestock: 1 }, cap: 150, workers: 8, demandPerK: 2.4, spoil: 0.2, unit: 't' },
  { id: 'furniture', name: 'Furniture', kind: 'consumer', recipe: { timber: 2 }, cap: 120, workers: 10, demandPerK: 1.2, spoil: 0, unit: 'set' },
  { id: 'fuel', name: 'Fuel', kind: 'consumer', recipe: { oil: 1 }, cap: 400, workers: 8, demandPerK: 6.0, spoil: 0.01, unit: 'kbbl' },
  { id: 'clothing', name: 'Clothing', kind: 'consumer', recipe: { fabric: 2 }, cap: 300, workers: 12, demandPerK: 2.0, spoil: 0, unit: 'lot' },
  { id: 'appliances', name: 'Appliances', kind: 'consumer', recipe: { steel: 1, plastics: 1 }, cap: 100, workers: 12, demandPerK: 1.0, spoil: 0, unit: 'unit' },
  { id: 'computers', name: 'Computers', kind: 'consumer', recipe: { electronics: 2, plastics: 1 }, cap: 60, workers: 14, demandPerK: 0.6, spoil: 0, photo: 'method/computer.jpg', unit: 'unit', research: 90 },
  { id: 'machinery', name: 'Industrial machinery', kind: 'consumer', recipe: { steel: 1, chemicals: 1, plastics: 1, components: 1 }, cap: 60, workers: 16, demandPerK: 0.25, spoil: 0, unit: 'unit' },
  { id: 'buildings', name: 'Buildings', kind: 'consumer', recipe: { cmaterials: 2, steel: 1 }, cap: 30, workers: 16, demandPerK: 0.25, spoil: 0, unit: 'unit' },
  { id: 'hygiene', name: 'Hygiene products', kind: 'consumer', recipe: { chemicals: 1 }, cap: 250, workers: 10, demandPerK: 3.0, spoil: 0.02, unit: 'lot' },
  { id: 'cleaning', name: 'Cleaning products', kind: 'consumer', recipe: { chemicals: 1, plastics: 1 }, cap: 250, workers: 10, demandPerK: 2.2, spoil: 0.01, unit: 'lot' },
  { id: 'shoes', name: 'Shoes', kind: 'consumer', recipe: { fabric: 1, plastics: 1 }, cap: 150, workers: 12, demandPerK: 1.6, spoil: 0, unit: 'lot' },
  { id: 'cars', name: 'Cars', kind: 'consumer', recipe: { steel: 4, plastics: 2, electronics: 1 }, cap: 40, workers: 18, demandPerK: 0.3, spoil: 0, unit: 'car', research: 140 },
  // hi-tech goods: locked until researched
  { id: 'phones', name: 'Mobile phones', kind: 'consumer', recipe: { electronics: 1, plastics: 1 }, cap: 120, workers: 14, demandPerK: 0.9, spoil: 0, unit: 'lot', research: 80 },
  { id: 'tvs', name: 'Televisions', kind: 'consumer', recipe: { electronics: 1, steel: 0.5, plastics: 1 }, cap: 80, workers: 12, demandPerK: 0.7, spoil: 0, unit: 'unit', research: 70 },
  { id: 'pharma', name: 'Pharmaceuticals', kind: 'consumer', recipe: { oil: 1, plastics: 1, chemicals: 1, machinery: 1 }, cap: 100, workers: 16, demandPerK: 0.5, spoil: 0.05, unit: 'lot', research: 120 },
  { id: 'robotics', name: 'Robotics', kind: 'intermediate', recipe: { steel: 2, electronics: 2 }, cap: 50, workers: 16, spoil: 0, unit: 'unit', research: 100 },
];

/** The picture atlas of all products (client/public/assets/atlas/products.png): a grid of equal cells without padding, one fixed slot per product.
 *  A product's slot is its index in ATLAS_ORDER: NEW PRODUCTS GO AT THE END, never in the middle. Free slots are left empty for them.
 *  The atlas image is now drawn by hand: NAME_ONLY lists the products whose cell is still just a framed name (remove a product from it once its cell has a picture).
 *  `npm run atlas` rebuilds a generated atlas from the `photo` fields and would overwrite the hand-made image, so it needs --force. */
export const ATLAS = { cols: 8, rows: 8, cellW: 150, cellH: 120, file: 'atlas/products.png' } as const;
export const NAME_ONLY: ProductId[] = ['machinery', 'buildings', 'hygiene', 'cleaning', 'cars', 'phones', 'tvs', 'pharma', 'robotics', 'vegetables', 'canned', 'fruits'];
export const ATLAS_ORDER: ProductId[] = ['grain', 'corn', 'cotton', 'livestock', 'timber', 'ore', 'copper', 'stone', 'rare', 'oil',
  'steel', 'components', 'cmaterials', 'chemicals', 'sugar', 'fabric', 'plastics', 'electronics',
  'bread', 'dairy', 'pastry', 'beverages', 'alcohol', 'ultrafood', 'meat', 'furniture', 'fuel', 'clothing', 'appliances', 'computers', 'machinery', 'buildings', 'hygiene', 'cleaning', 'shoes', 'cars',
  'phones', 'tvs', 'pharma', 'robotics', 'vegetables', 'canned', 'fruits']; // new products go at the END

export const PRODUCTS: Record<ProductId, ProductDef> = {} as any;
export const PRODUCT_LIST: ProductDef[] = [];
function build(id: ProductId): ProductDef {
  if (PRODUCTS[id]) return PRODUCTS[id];
  const d = defs.find(x => x.id === id)!;
  let basePrice = d.rawPrice ?? 0, depth = 0;
  if (d.kind !== 'raw') {
    let inputs = 0;
    for (const [k, q] of Object.entries(d.recipe)) { const p = build(k as ProductId); inputs += p.basePrice * q!; depth = Math.max(depth, p.depth + 1); }
    const labour = (d.workers * BASE_WAGE) / d.cap;
    basePrice = Math.round((inputs + labour * 1.7) * 100) / 100;
    if (basePrice > 100) basePrice = Math.round(basePrice);
  }
  return (PRODUCTS[id] = { ...d, basePrice, depth });
}
for (const d of defs) PRODUCT_LIST.push(build(d.id));
export const CONSUMER_PRODUCTS = PRODUCT_LIST.filter(p => p.kind === 'consumer');

export type BuildingType = 'farm' | 'forest' | 'mine' | 'copper' | 'quarry' | 'rare' | 'oil' | 'factory' | 'store' | 'supermarket' | 'rd' | 'mall';
// World tile types: d deep sea, a shallow sea, g grass, f farmland, t forest, m mountain,
// o oil field, e ore deposit, r road, u downtown, s suburb, p port dock.
export type Terrain = 'd' | 'a' | 'g' | 'f' | 't' | 'm' | 'o' | 'e' | 'c' | 'x' | 'r' | 'u' | 'l' | 's' | 'w' | 'p' | 'h' | 'i';
export const WORLD_W = 400, WORLD_H = 240;
export const WORLD_SCALE = 2.5; // tile -> legacy map units used for travel distances

export interface BuildingDef {
  type: BuildingType;
  name: string;
  cost: number;
  terrain: Terrain[];
  products?: ProductId[]; // allowed product choices
  maintPct: number;       // monthly maintenance as % of invested value
  color: string;
  letter: string;
  photo: string;
  desc: string;
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  farm: { type: 'farm', name: 'Farm', cost: 150000, terrain: ['f'], products: ['grain', 'corn', 'vegetables', 'fruits', 'livestock', 'cotton'], maintPct: 0.8, color: '#9cba4a', letter: 'F', photo: 'pict/f_farm.jpg', desc: 'Grows grain, corn or cotton, or raises livestock, on farmland.' },
  forest: { type: 'forest', name: 'Logging camp', cost: 130000, terrain: ['t'], products: ['timber'], maintPct: 0.8, color: '#3f8f4f', letter: 'L', photo: 'pict/f_fore.jpg', desc: 'Harvests timber in forests.' },
  mine: { type: 'mine', name: 'Iron mine', cost: 250000, terrain: ['e'], products: ['ore'], maintPct: 1.0, color: '#8d7b6a', letter: 'M', photo: 'pict/f_mine.jpg', desc: 'Digs iron ore out of the hills.' },
  rare: { type: 'rare', name: 'Rare ore mine', cost: 320000, terrain: ['x'], products: ['rare'], maintPct: 1.0, color: '#8e5ab8', letter: 'R', photo: 'pict/f_mine.jpg', desc: 'Digs rare ores out of the mountains.' },
  quarry: { type: 'quarry', name: 'Quarry', cost: 220000, terrain: ['m'], products: ['stone'], maintPct: 1.0, color: '#9aa3ad', letter: 'Q', photo: 'pict/f_mine.jpg', desc: 'Cuts stone out of the rock: on any mountain.' },
  copper: { type: 'copper', name: 'Copper mine', cost: 250000, terrain: ['c'], products: ['copper'], maintPct: 1.0, color: '#b87333', letter: 'C', photo: 'pict/f_mine.jpg', desc: 'Digs copper ore out of the hills.' },
  oil: { type: 'oil', name: 'Oil well', cost: 300000, terrain: ['o'], products: ['oil'], maintPct: 1.0, color: '#2c2c2c', letter: 'O', photo: 'pict/f_oil.jpg', desc: 'Pumps crude oil.' },
  factory: { type: 'factory', name: 'Factory', cost: 400000, terrain: ['g', 't', 's', 'w', 'u', 'l'], maintPct: 1.0, color: '#c0504d', letter: 'X', photo: 'pict/f_fact.jpg', desc: 'Turns inputs into intermediate or consumer goods.' },
  supermarket: { type: 'supermarket', name: 'Supermarket', cost: 600000, terrain: ['u', 'l', 's', 'w'], maintPct: 0.9, color: '#2f9e8f', letter: 'M', photo: 'pict/f_reta.jpg', desc: 'A big food and household store: dairy, bread, meat, pastry, beverages, alcoholic drinks, cleaning and hygiene products. Sells to the people living in the 5×5 area around it.' },
  store: { type: 'store', name: 'Retail store', cost: 250000, terrain: ['u', 'l', 's', 'w'], maintPct: 0.9, color: '#4a7fc0', letter: 'S', photo: 'pict/f_reta.jpg', desc: 'Sells consumer goods to the city population.' },
  mall: { type: 'mall', name: 'Shopping mall', cost: 1500000, terrain: ['u', 'l', 's'], maintPct: 0.8, color: '#b0508c', letter: 'C', photo: 'pict/f_reta.jpg', desc: 'A shopping centre with 8 units that you rent out to other companies (or use yourself). Tenants sell one branded product each and enjoy extra foot traffic.' },
  rd: { type: 'rd', name: 'R&D lab', cost: 350000, terrain: ['u', 'l', 's', 'g'], maintPct: 0.7, color: '#8a5fb5', letter: 'R', photo: 'pict/f_rd.jpg', desc: 'Researches better quality for one product.' },
};
/** The facility picture atlas (client/public/assets/atlas/facilities.png), laid out like the product one: a slot is the index in FACILITY_ORDER (new types go at the END).
 *  Types in FACILITY_NAME_ONLY have no picture of their own yet and show a framed name. `npm run atlas -- facilities --force` regenerates it from `photo` (overwrites hand-made art). */
export const FACILITY_ATLAS = { cols: 8, rows: 8, cellW: 150, cellH: 120, file: 'atlas/facilities.png' } as const;
export const FACILITY_ORDER: BuildingType[] = ['farm', 'forest', 'mine', 'copper', 'quarry', 'rare', 'oil', 'factory', 'store', 'supermarket', 'rd', 'mall'];
export const FACILITY_NAME_ONLY: BuildingType[] = ['copper', 'quarry', 'rare', 'supermarket', 'mall'];

/** Definition of a placed building: supermarkets are stores flagged `super`. */
export const defOf = (b: { type: BuildingType; super?: boolean }) => BUILDINGS[b.super ? 'supermarket' : b.type];
export const RAW_FOR_BUILDING: Record<string, ProductId[]> = { farm: ['grain', 'corn', 'vegetables', 'fruits', 'livestock', 'cotton'], forest: ['timber'], mine: ['ore'], copper: ['copper'], quarry: ['stone'], rare: ['rare'], oil: ['oil'] };

export const TERRAIN_INFO: Record<Terrain, { name: string; color: string; price: number }> = {
  d: { name: 'Deep sea', color: '#1d4f8a', price: 0 },
  a: { name: 'Shallow sea', color: '#3b7bbf', price: 0 },
  g: { name: 'Grassland', color: '#8fbf5f', price: 15000 },
  f: { name: 'Farmland', color: '#d6c568', price: 12000 },
  t: { name: 'Forest', color: '#3f8a4a', price: 18000 },
  m: { name: 'Mountain', color: '#8a8178', price: 20000 },
  x: { name: 'Rare ore deposit', color: '#8e5ab8', price: 45000 },
  e: { name: 'Iron deposit', color: '#b0653a', price: 35000 },
  c: { name: 'Copper deposit', color: '#3fb5a0', price: 35000 },
  o: { name: 'Oil field', color: '#4a3b4f', price: 40000 },
  r: { name: 'Road', color: '#a99a7a', price: 0 },
  u: { name: 'Downtown', color: '#7d7d86', price: 120000 },
  l: { name: 'Luxury downtown', color: '#b59a4a', price: 220000 },
  s: { name: 'Suburb', color: '#a9b49a', price: 60000 },
  w: { name: 'Town', color: '#c8b88c', price: 45000 },
  p: { name: 'Port', color: '#7a5a3a', price: 0 },
  i: { name: 'Railroad', color: '#2b2b30', price: 0 },
  h: { name: 'Town hall', color: '#d9c98a', price: 0 },
};

export const MAX_LINES = 8;
export const MAX_AUTO = 5;
/** Hiring above the required headcount still helps: each extra worker counts OVERSTAFF_BONUS of a normal one, up to OVERSTAFF_CAP × the requirement. */
export const OVERSTAFF_CAP = 2, OVERSTAFF_BONUS = 0.5;
export const MAX_STORE_SIZE = 5;
export const STORE_SLOTS = 6;
/** The six goods a supermarket carries (one shelf each). */
export const SUPER_PRODUCTS: ProductId[] = ['bread', 'dairy', 'meat', 'pastry', 'beverages', 'alcohol', 'ultrafood', 'canned', 'cleaning', 'hygiene'];
export const IMPORT_MARKUP = 1.35;
export const IMPORT_QUALITY = 35;
export const NPC_SHARE_MARKUP = 1.12;
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const COMPANY_COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#2a9d8f', '#f032e6', '#9a6324', '#808000', '#000075', '#e6a800', '#008080'];

// ---- Factory facility layout (grid of modules)
export type ModuleType = 'line' | 'robot' | 'warehouse' | 'import' | 'brand' | 'rd' | 'qa' | 'export';
export const FAC_GRID = 3;
export interface ModuleDef { type: ModuleType; name: string; cost: number; max: number; color: string; letter: string; adjacent: boolean; desc: string }
export const MODULES: Record<ModuleType, ModuleDef> = {
  line: { type: 'line', name: 'Production line', cost: 240000, max: MAX_LINES, color: '#c0504d', letter: 'P', adjacent: false, desc: 'Manufactures its product from the inputs delivered by linked cells. Link it to import cells or to other lines that make its inputs.' },
  robot: { type: 'robot', name: 'Robotics', cost: 160000, max: MAX_AUTO, color: '#6b7a8f', letter: 'A', adjacent: true, desc: 'Each robot linked to a line: -8% labour needed, +6% output. Unlinked robots do nothing.' },
  warehouse: { type: 'warehouse', name: 'Warehouse', cost: 60000, max: 4, color: '#a08a5a', letter: 'W', adjacent: false, desc: 'Linked to a line making the final product: +50% storage each and -20% spoilage (up to 3 count). Holds ONE chosen product: linked to an import cell of that product it stockpiles it with spare buying capacity and feeds it back when imports run dry.' },
  import: { type: 'import', name: 'Import / purchasing', cost: 60000, max: 6, color: '#3f8fb5', letter: 'I', adjacent: false, desc: 'Buys ONE product from a harbour or a factory and hands it to every linked line. Click the border between two cells to link them.' },
  brand: { type: 'brand', name: 'Branding studio', cost: 70000, max: 4, color: '#d98c00', letter: 'B', adjacent: false, desc: 'Must be linked to a line. Each studio adds +2 brand awareness per month for this product (benefits your stores).' },
  rd: { type: 'rd', name: 'R&D bench', cost: 120000, max: 4, color: '#8a5fb5', letter: 'R', adjacent: false, desc: 'Must be linked to a line. Each bench adds research on this product every month, no scientists needed.' },
  qa: { type: 'qa', name: 'Quality control', cost: 90000, max: 3, color: '#2a9d8f', letter: 'Q', adjacent: true, desc: 'Each unit linked to a line: +3 product quality.' },
  export: { type: 'export', name: 'Export / dispatch', cost: 80000, max: 3, color: '#4a8f3f', letter: 'X', adjacent: false, desc: 'Holds ONE product reaching it from a linked production line or import cell. Your other facilities can take it as a source; with "sell to everyone" other companies can buy it too.' },
};

// ---- Finance: lenders and the credit they offer. Every loan becomes a contract (see Loan in types.ts).
export interface Lender {
  id: string; name: string; blurb: string;
  type: 'amortizing' | 'bullet';   // amortizing: equal principal every month + interest; bullet: interest only, whole principal due at the deadline
  terms: number[];                 // contract lengths in months you may choose from
  rate: number; securedRate: number; // monthly interest, unsecured / with collateral
  base: number; nwFrac: number;    // unsecured limit = base + nwFrac x net worth
  ltv: number;                     // extra credit per $ of pledged collateral value
  collateral: 'none' | 'optional' | 'required';
  min: number;
}
export const LENDERS: Lender[] = [
  { id: 'fnb', name: 'First National Bank', blurb: 'Plain, sensible business loans. Cheaper when you pledge facilities.', type: 'amortizing', terms: [12, 24, 36, 60], rate: 0.0060, securedRate: 0.0042, base: 200_000, nwFrac: 0.35, ltv: 0.65, collateral: 'optional', min: 50_000 },
  { id: 'cu', name: "Merchants' Credit Union", blurb: 'Short loans for working capital. Quick, but a bit dearer.', type: 'amortizing', terms: [6, 12, 24], rate: 0.0085, securedRate: 0.0065, base: 100_000, nwFrac: 0.2, ltv: 0.5, collateral: 'optional', min: 20_000 },
  { id: 'dev', name: 'Development Bank', blurb: 'Very cheap long-term money, but only against collateral.', type: 'amortizing', terms: [36, 60, 120], rate: 0.0030, securedRate: 0.0030, base: 0, nwFrac: 0, ltv: 0.8, collateral: 'required', min: 200_000 },
  { id: 'vc', name: 'Venture Capital Partners', blurb: 'Big cheques, interest only, everything back at the deadline.', type: 'bullet', terms: [12, 24], rate: 0.0110, securedRate: 0.0085, base: 500_000, nwFrac: 0.5, ltv: 0.5, collateral: 'optional', min: 250_000 },
  { id: 'shark', name: 'Quick Cash Ltd', blurb: 'Cash today, no questions asked. Ruinous rates, back within weeks.', type: 'bullet', terms: [1, 3], rate: 0.0280, securedRate: 0.0280, base: 80_000, nwFrac: 0, ltv: 0, collateral: 'none', min: 10_000 },
];

export const MALL_UNITS = 8, MALL_MIN_BRAND = 8, MALL_FITOUT = 40000, MALL_TRAFFIC = 1.35, MALL_BRAND_BOOST = 2, MALL_LEASE = 12, MALL_PER_CITY = 2;

/** Months of construction before a new building operates (ready-built vacancies are instant). */
/** Media outlets a company can sign advertising contracts with. fee = monthly price (before term discount),
 *  lev = how many dollars of ordinary ad budget each dollar of the fee is worth, slots = advertisers it can carry at once. */
export interface MediaDef { id: string; name: string; kind: 'newspaper' | 'radio' | 'tv'; fee: number; lev: number; slots: number; blurb: string }
export const MEDIA: MediaDef[] = [
  { id: 'courier', name: 'Metro Courier', kind: 'newspaper', fee: 1500, lev: 1.25, slots: 6, blurb: 'Free daily paper. Cheap, local readers.' },
  { id: 'ledger', name: 'The Daily Ledger', kind: 'newspaper', fee: 3000, lev: 1.4, slots: 4, blurb: 'The business paper everyone reads.' },
  { id: 'talk', name: 'Talk Radio 99', kind: 'radio', fee: 4500, lev: 1.55, slots: 4, blurb: 'Commuters and call-in shows.' },
  { id: 'fm', name: 'Radio Capital FM', kind: 'radio', fee: 8000, lev: 1.8, slots: 3, blurb: 'Hit music, huge audience.' },
  { id: 'tvlocal', name: 'Local TV Network', kind: 'tv', fee: 12000, lev: 2.0, slots: 3, blurb: 'Regional evening slots.' },
  { id: 'tv5', name: 'Channel 5', kind: 'tv', fee: 25000, lev: 2.6, slots: 2, blurb: 'Prime-time national television.' },
];
export const MEDIA_TERMS = [3, 6, 12]; export const MEDIA_DISCOUNT: Record<number, number> = { 3: 0, 6: 0.05, 12: 0.12 };
export const ARTICLE_FEE = 5000; // paying the newspaper to print a notice from your company
export const ARTICLE_MAX = 400;   // characters
export const MEDIA_CANCEL_MONTHS = 2; // cancelling early costs this many months of fee

/** Operating supplies some facilities burn while they work (units per unit produced): farms run tractors on fuel. Without them they work by hand at 40% output. */
export const SUPPLIES: Partial<Record<BuildingType, Partial<Record<ProductId, number>>>> = { farm: { fuel: 0.05 } };
export const SUPPLY_HAND = 0.4;
/** Store decoration: money spent adds decoration points (DECOR_COST per point, per size step of the store); the level fades DECOR_FADE a month and, at 100, adds DECOR_BRAND brand points a month to every product on the shelves. */
export const DECOR_COST = 2500, DECOR_FADE = 0.04, DECOR_BRAND = 2.4, DECOR_ATTRACT = 0.3; // at 100 decoration a shop attracts 30% more customers
/** Land in cities costs LOT_PER_PERSON dollars per inhabitant of the tile (twice the people, twice the price); building anywhere pays BUILD_TAX of land + construction to the city. */
export const LOT_PER_PERSON = 12, LOT_MIN = 4000, BUILD_TAX = 0.04;
export const BUILD_TURNS: Record<BuildingType, number> = { farm: 1, forest: 1, mine: 2, copper: 2, quarry: 2, rare: 2, oil: 2, factory: 1, store: 1, supermarket: 1, rd: 1, mall: 3 };

/** The people portraits (client/public/assets/atlas/people.png): one atlas of equal square cells, portrait n at slot n (numbering from 0; new portraits go in the free slots, raise
 *  PORTRAIT_COUNT when you add some). Build it from assets/person/NN.png with `npm run peopleatlas`; the page people.html shows every cell. */
export const PORTRAIT_ATLAS = { cols: 12, rows: 8, cell: 60, file: 'atlas/people.png' } as const;
export const PORTRAIT_COUNT = 72;
/** The tile pictures shown in the tile panel (files in assets/pict) and the tile atlas (client/public/assets/atlas/terrain.png), laid out like the product atlas:
 *  a slot is the index in TERRAIN_ORDER (new tile types go at the END). Tile types in TERRAIN_NAME_ONLY show a framed name instead of a picture.
 *  `npm run atlas -- terrain --force` regenerates it from TERRAIN_PHOTO (overwrites hand-made art). */
export const TERRAIN_PHOTO: Record<Terrain, string> = {
  u: 'urban.jpg', l: 'urban2.jpg', h: 'urban.jpg', s: 'suburb.jpg', w: 'suburb2.jpg', g: 'l_grass.jpg', f: 'f_farm.jpg', t: 'f_fore.jpg', m: 'l_hill2.jpg', e: 'f_mine.jpg', c: 'f_mine.jpg', x: 'f_mine.jpg', o: 'f_oil.jpg',
  a: 'l_sea.jpg', d: 'l_sea2.jpg', r: 'l_grass2.jpg', p: 'f_sea2.jpg', i: 'l_grass2.jpg',
};
export const TERRAIN_ATLAS = { cols: 8, rows: 8, cellW: 150, cellH: 120, file: 'atlas/terrain.png' } as const;
export const TERRAIN_ORDER: Terrain[] = ['d', 'a', 'g', 'f', 't', 'm', 'o', 'e', 'c', 'x', 'l', 'u', 'r', 's', 'w', 'p', 'h', 'i']; // road = slot 12 (col 5, row 2): the highway photo
export const TERRAIN_NAME_ONLY: Terrain[] = ['i'];
