// Dev page (/tiles.html): renders every map tile exactly as the game draws it, at 64 px per tile,
// so the graphics can be exported (see art/tilesheet.png) and redrawn.
import { BUILDINGS, TERRAIN_INFO, MODULES, type Terrain } from '../../shared/data.js';
import { drawTile, drawRail, resIcon, COL } from './worldmap.js';

// Strict atlas: every cell is exactly Z x Z px, laid out on a COLS-wide grid with no gaps or margins; each group starts on a new grid row.
const Z = 64, COLS = 8;

type Draw = (g: CanvasRenderingContext2D, x: number, y: number) => void;
type Row = { title: string; note?: string; items: Draw[]; names?: string[] };
const rows: Row[] = [];

const variants = [[3, 7], [14, 2], [25, 31], [8, 19], [40, 11], [5, 5]];
const terrainRows: [string, string, string][] = [
  ['d', 'Deep sea', ''], ['a', 'Shallow sea', ''], ['b', 'Beach', ''], ['g', 'Grassland', ''], ['f', 'Farmland', ''], ['t', 'Forest', ''],
  ['h', 'Hills', 'scenery, not buildable'], ['m', 'Mountain', 'scenery, not buildable'], ['n', 'Snow peaks', 'scenery, not buildable'],
  ['o', 'Oil field', 'resource: oil well'], ['e', 'Ore deposit', 'resource: iron mine'],
  ['u', 'Downtown', 'city core'], ['s', 'Suburb', 'city outskirts'], ['p', 'Port / harbour', 'pier + boat'],
];
for (const [ch, name, note] of terrainRows) {
  rows.push({ title: name + '  [' + ch + ']', note: note || 'variants vary by tile position', items: variants.map(([vx, vy]) => (g, px, py) => drawTile(g, ch, vx, vy, px, py, Z, () => 'g')) });
}

// roads: every connection shape. Neighbours N,E,S,W given as a 4-char mask.
const roadShapes: [string, string][] = [['....', 'isolated'], ['.E.W', 'horizontal'], ['N.S.', 'vertical'], ['NE..', 'corner N-E'], ['.ES.', 'corner E-S'], ['..SW', 'corner S-W'], ['N..W', 'corner N-W'],
  ['NES.', 'T east'], ['.ESW', 'T south'], ['N.SW', 'T west'], ['NE.W', 'T north'], ['NESW', 'crossing'], ['N...', 'dead end N'], ['.E..', 'dead end E'], ['..S.', 'dead end S'], ['...W', 'dead end W']];
rows.push({ title: 'Roads [r]', note: 'connect to road, city and port tiles', items: [] });
for (const [mask, label] of roadShapes) {
  rows[rows.length - 1].items.push((g, px, py) => {
    const x = 10, y = 10;
    const at = (ax: number, ay: number) => ((ax === x && ay === y - 1 && mask[0] === 'N') || (ax === x + 1 && ay === y && mask[1] === 'E') || (ax === x && ay === y + 1 && mask[2] === 'S') || (ax === x - 1 && ay === y && mask[3] === 'W') ? 'r' : 'g');
    drawTile(g, 'r', x, y, px, py, Z, at);
    void label;
  });
}
// split the 16 road shapes over rows of COLS
{
  const all = rows.pop()!; const per = COLS;
  for (let i = 0; i < all.items.length; i += per) rows.push({ title: i === 0 ? all.title : '', note: i === 0 ? all.note : '', items: all.items.slice(i, i + per) });
}

// railways: same 16 connection shapes, drawn over grass
rows.push({ title: 'Railways (overlay)', note: 'drawn over any terrain; connect to neighbouring rail tiles', items: [] });
for (const [mask] of roadShapes) {
  rows[rows.length - 1].items.push((g, px, py) => {
    const x = 10, y = 10; g.fillStyle = COL.g; g.fillRect(px, py, Z, Z);
    const on = (ax: number, ay: number) => (ax === x && ay === y) || (ax === x && ay === y - 1 && mask[0] === 'N') || (ax === x + 1 && ay === y && mask[1] === 'E') || (ax === x && ay === y + 1 && mask[2] === 'S') || (ax === x - 1 && ay === y && mask[3] === 'W');
    drawRail(g, x, y, px, py, Z, on);
  });
}
{ const all = rows.pop()!; const names = roadShapes.map(r => r[1]); for (let i = 0; i < all.items.length; i += COLS) rows.push({ title: i === 0 ? all.title : '', note: i === 0 ? all.note : '', items: all.items.slice(i, i + COLS), names: names.slice(i, i + COLS) }); }

// resource icons at the sizes used on the minimap / zoomed-out / zoomed-in
const resRow = (ch: string, title: string, note: string): Row => ({ title, note, items: [12, 20, 32, 48].map(size => (g: CanvasRenderingContext2D, px: number, py: number) => { g.fillStyle = ch === 'o' ? COL.g : COL.h; g.fillRect(px, py, Z, Z); resIcon(g, ch, px + Z / 2, py + Z / 2, size); }) });
rows.push(resRow('o', 'Oil icon', 'sizes 12 / 20 / 32 / 48 px (minimap, zoomed out, zoomed in)'));
rows.push(resRow('e', 'Ore icon', 'same sizes'));

// building markers (as shown on the zoom view) with company-colour outline
rows.push({ title: 'Building markers', note: 'type colour + letter, outline = company colour', items: Object.values(BUILDINGS).map((b): Draw => (g, px, py) => {
  g.fillStyle = COL.g; g.fillRect(px, py, Z, Z);
  g.fillStyle = b.color; g.fillRect(px + Z * 0.15, py + Z * 0.15, Z * 0.7, Z * 0.7); g.strokeStyle = '#e6194b'; g.lineWidth = Math.max(2, Z * 0.1); g.strokeRect(px + Z * 0.15, py + Z * 0.15, Z * 0.7, Z * 0.7);
  g.fillStyle = '#fff'; g.font = 'bold ' + Math.round(Z * 0.5) + 'px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(b.letter, px + Z / 2, py + Z / 2 + 1);
}).slice(0, 7) });
rows.push({ title: 'Lot ownership', note: 'owned lot outline, selected / hover frame', items: [
  (g, px, py) => { g.fillStyle = COL.g; g.fillRect(px, py, Z, Z); g.strokeStyle = '#3cb44b'; g.lineWidth = Math.max(1.5, Z * 0.1); g.strokeRect(px + 1, py + 1, Z - 2, Z - 2); },
  (g, px, py) => { g.fillStyle = COL.g; g.fillRect(px, py, Z, Z); g.strokeStyle = '#ffd400'; g.lineWidth = 3; g.strokeRect(px + 1, py + 1, Z - 2, Z - 2); },
  (g, px, py) => { g.fillStyle = COL.g; g.fillRect(px, py, Z, Z); g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 2; g.strokeRect(px + 1, py + 1, Z - 2, Z - 2); },
] });

// module colours of the factory layout designer
rows.push({ title: 'Layout modules', note: 'factory facility designer cells', items: Object.values(MODULES).map((m): Draw => (g, px, py) => {
  g.fillStyle = '#ded9c8'; g.fillRect(px, py, Z, Z); g.fillStyle = m.color; g.fillRect(px + 4, py + 4, Z - 8, Z - 8);
  g.fillStyle = '#fff'; g.font = 'bold 24px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(m.letter, px + Z / 2, py + Z / 2 - 6);
  g.font = '9px system-ui'; g.fillText(m.name.slice(0, 11), px + Z / 2, py + Z - 10);
}).slice(0, 7) });

// ---- palette swatches (minimap pixel colours) as grid cells too
{
  const keys = [...(Object.keys(TERRAIN_INFO) as Terrain[]), 'rail'];
  for (let i = 0; i < keys.length; i += COLS) rows.push({ title: i === 0 ? 'Minimap pixel colours' : '', note: i === 0 ? '1 px per tile in the world image' : '', names: keys.slice(i, i + COLS), items: keys.slice(i, i + COLS).map((k): Draw => (g, px, py) => { g.fillStyle = k === 'rail' ? '#1e1e22' : COL[k] ?? '#f0f'; g.fillRect(px, py, Z, Z); }) });
}

// ---- render: pure grid, no labels inside the image (see the index in window.atlasIndex)
const W = COLS * Z, H = rows.length * Z;
const cv = document.createElement('canvas'); cv.id = 'sheet'; cv.width = W; cv.height = H; document.body.append(cv);
const g = cv.getContext('2d')!;
g.fillStyle = '#2b2b2b'; g.fillRect(0, 0, W, H);
const index: { row: number; col: number; group: string; note: string; name: string }[] = []; let group = '', gnote = '';
rows.forEach((r, ri) => {
  if (r.title) { group = r.title; gnote = r.note ?? ''; }
  r.items.forEach((draw, i) => { const px = i * Z, py = ri * Z; g.save(); g.beginPath(); g.rect(px, py, Z, Z); g.clip(); draw(g, px, py); g.restore(); index.push({ row: ri, col: i, group, note: gnote, name: r.names?.[i] ?? '' }); });
});
(window as unknown as { atlasIndex: unknown }).atlasIndex = { tile: Z, cols: COLS, rows: rows.length, width: W, height: H, cells: index };
