// Static game data: products, building types, terrain. Shared by server engine and client UI.

export type ProductId =
  | 'grain' | 'livestock' | 'timber' | 'ore' | 'oil'
  | 'steel' | 'plastics' | 'electronics'
  | 'bread' | 'meat' | 'furniture' | 'fuel' | 'clothing' | 'appliances' | 'computers' | 'cars';

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
  photo: string;        // asset path
  unit: string;
  // computed
  basePrice: number;
  depth: number;
}

export const BASE_WAGE = 2400;

type RawDef = Omit<ProductDef, 'basePrice' | 'depth'>;
const defs: RawDef[] = [
  { id: 'grain', name: 'Grain', kind: 'raw', recipe: {}, cap: 300, workers: 6, rawPrice: 110, spoil: 0.03, photo: 'pict/f_farm.jpg', unit: 't' },
  { id: 'livestock', name: 'Livestock', kind: 'raw', recipe: {}, cap: 100, workers: 6, rawPrice: 400, spoil: 0.04, photo: 'pict/j_farmcr.jpg', unit: 'head' },
  { id: 'timber', name: 'Timber', kind: 'raw', recipe: {}, cap: 400, workers: 6, rawPrice: 90, spoil: 0, photo: 'pict/f_fore.jpg', unit: 'm³' },
  { id: 'ore', name: 'Iron ore', kind: 'raw', recipe: {}, cap: 600, workers: 8, rawPrice: 70, spoil: 0, photo: 'pict/f_mine.jpg', unit: 't' },
  { id: 'oil', name: 'Crude oil', kind: 'raw', recipe: {}, cap: 800, workers: 8, rawPrice: 60, spoil: 0, photo: 'pict/f_oil.jpg', unit: 'bbl' },

  { id: 'steel', name: 'Steel', kind: 'intermediate', recipe: { ore: 2 }, cap: 200, workers: 12, spoil: 0, photo: 'method/steel.jpg', unit: 't' },
  { id: 'plastics', name: 'Plastics', kind: 'intermediate', recipe: { oil: 1.5 }, cap: 250, workers: 10, spoil: 0, photo: 'method/paper.jpg', unit: 't' },
  { id: 'electronics', name: 'Electronics', kind: 'intermediate', recipe: { steel: 1, plastics: 1 }, cap: 150, workers: 12, spoil: 0, photo: 'method/elecomp.jpg', unit: 'lot' },

  { id: 'bread', name: 'Bread', kind: 'consumer', recipe: { grain: 1 }, cap: 300, workers: 8, demandPerK: 5.0, spoil: 0.25, photo: 'method/bread.jpg', unit: 't' },
  { id: 'meat', name: 'Packaged meat', kind: 'consumer', recipe: { livestock: 1 }, cap: 150, workers: 8, demandPerK: 2.4, spoil: 0.2, photo: 'pict/f_fact.jpg', unit: 't' },
  { id: 'furniture', name: 'Furniture', kind: 'consumer', recipe: { timber: 2 }, cap: 120, workers: 10, demandPerK: 1.2, spoil: 0, photo: 'pict/j_mft.jpg', unit: 'set' },
  { id: 'fuel', name: 'Fuel', kind: 'consumer', recipe: { oil: 1 }, cap: 400, workers: 8, demandPerK: 6.0, spoil: 0.01, photo: 'pict/j_oil.jpg', unit: 'kbbl' },
  { id: 'clothing', name: 'Clothing', kind: 'consumer', recipe: { plastics: 2 }, cap: 300, workers: 12, demandPerK: 2.0, spoil: 0, photo: 'pict/f_reta.jpg', unit: 'lot' },
  { id: 'appliances', name: 'Appliances', kind: 'consumer', recipe: { steel: 1, plastics: 1 }, cap: 100, workers: 12, demandPerK: 1.0, spoil: 0, photo: 'pict/j_inv.jpg', unit: 'unit' },
  { id: 'computers', name: 'Computers', kind: 'consumer', recipe: { electronics: 2, plastics: 1 }, cap: 60, workers: 14, demandPerK: 0.6, spoil: 0, photo: 'method/computer.jpg', unit: 'unit' },
  { id: 'cars', name: 'Cars', kind: 'consumer', recipe: { steel: 4, plastics: 2, electronics: 1 }, cap: 40, workers: 18, demandPerK: 0.3, spoil: 0, photo: 'pict/j_pur.jpg', unit: 'car' },
];

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

export type BuildingType = 'farm' | 'forest' | 'mine' | 'oil' | 'factory' | 'store' | 'rd';
// World tile types: d deep sea, a shallow sea, b beach, g grass, f farmland, t forest, h hills, m mountain, n snow,
// o oil field, e ore deposit, r road, u downtown, s suburb, p port dock.
export type Terrain = 'd' | 'a' | 'b' | 'g' | 'f' | 't' | 'h' | 'm' | 'n' | 'o' | 'e' | 'r' | 'u' | 's' | 'p';
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
  farm: { type: 'farm', name: 'Farm', cost: 150000, terrain: ['f'], products: ['grain', 'livestock'], maintPct: 0.8, color: '#9cba4a', letter: 'F', photo: 'pict/f_farm.jpg', desc: 'Grows grain or raises livestock on farmland.' },
  forest: { type: 'forest', name: 'Logging camp', cost: 130000, terrain: ['t'], products: ['timber'], maintPct: 0.8, color: '#3f8f4f', letter: 'L', photo: 'pict/f_fore.jpg', desc: 'Harvests timber in forests.' },
  mine: { type: 'mine', name: 'Iron mine', cost: 250000, terrain: ['e'], products: ['ore'], maintPct: 1.0, color: '#8d7b6a', letter: 'M', photo: 'pict/f_mine.jpg', desc: 'Digs iron ore out of the hills.' },
  oil: { type: 'oil', name: 'Oil well', cost: 300000, terrain: ['o'], products: ['oil'], maintPct: 1.0, color: '#2c2c2c', letter: 'O', photo: 'pict/f_oil.jpg', desc: 'Pumps crude oil.' },
  factory: { type: 'factory', name: 'Factory', cost: 400000, terrain: ['g', 's', 'u', 'b'], maintPct: 1.0, color: '#c0504d', letter: 'X', photo: 'pict/f_fact.jpg', desc: 'Turns inputs into intermediate or consumer goods.' },
  store: { type: 'store', name: 'Retail store', cost: 250000, terrain: ['u', 's'], maintPct: 0.9, color: '#4a7fc0', letter: 'S', photo: 'pict/f_reta.jpg', desc: 'Sells consumer goods to the city population.' },
  rd: { type: 'rd', name: 'R&D lab', cost: 350000, terrain: ['u', 's', 'g'], maintPct: 0.7, color: '#8a5fb5', letter: 'R', photo: 'pict/f_rd.jpg', desc: 'Researches better quality for one product.' },
};
export const RAW_FOR_BUILDING: Record<string, ProductId[]> = { farm: ['grain', 'livestock'], forest: ['timber'], mine: ['ore'], oil: ['oil'] };

export const TERRAIN_INFO: Record<Terrain, { name: string; color: string; price: number }> = {
  d: { name: 'Deep sea', color: '#1d4f8a', price: 0 },
  a: { name: 'Shallow sea', color: '#3b7bbf', price: 0 },
  b: { name: 'Beach', color: '#e2d6a0', price: 20000 },
  g: { name: 'Grassland', color: '#8fbf5f', price: 15000 },
  f: { name: 'Farmland', color: '#d6c568', price: 12000 },
  t: { name: 'Forest', color: '#3f8a4a', price: 18000 },
  h: { name: 'Hills', color: '#9c8566', price: 0 },
  m: { name: 'Mountain', color: '#8a8178', price: 0 },
  e: { name: 'Ore deposit', color: '#b0653a', price: 35000 },
  n: { name: 'Snow peaks', color: '#f4f4f6', price: 0 },
  o: { name: 'Oil field', color: '#4a3b4f', price: 40000 },
  r: { name: 'Road', color: '#a99a7a', price: 0 },
  u: { name: 'Downtown', color: '#7d7d86', price: 120000 },
  s: { name: 'Suburb', color: '#a9b49a', price: 60000 },
  p: { name: 'Port', color: '#7a5a3a', price: 0 },
};

export const MAX_LINES = 8;
export const MAX_AUTO = 5;
/** Hiring above the required headcount still helps: each extra worker counts OVERSTAFF_BONUS of a normal one, up to OVERSTAFF_CAP × the requirement. */
export const OVERSTAFF_CAP = 2, OVERSTAFF_BONUS = 0.5;
export const MAX_STORE_SIZE = 5;
export const STORE_SLOTS = 6;
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
