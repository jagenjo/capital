// World tilemap views (Canvas2D):
//  * minimap: the whole world as a 1-pixel-per-tile image, with the current viewport rectangle
//  * main view: zoomable/pannable detailed tiles; when zoomed far out it blits the 1px-per-tile image instead of drawing tiles
import { tr } from './i18n.js';
import { BUILDINGS, defOf, TERRAIN_INFO, WORLD_SCALE, type Terrain } from '../../shared/data.js';
import { AREA_R, areaR, shopReach, tilePollution, factoryPollution, cityTile, haulRoute, haulPath, costField, HAUL_RAIL, HAUL_ROAD, HAUL_FIELD, HAUL_FOREST, HAUL_MOUNTAIN, HAUL_SEA, HAUL_SWITCH, lotPrice, terrainAt, railMap, tilePop, tileTransport, tileQuality, QUALITY_NAME, tileHaul } from '../../shared/engine.js';
import { nearestCity } from '../../shared/world.js';
import { h, num, money } from './util.js';
import { S, companyOf } from './state.js';

export const COL: Record<string, string> = { d: '#1d4f8a', a: '#3b7bbf', g: '#8fbf5f', f: '#d6c568', t: '#3f8a4a', m: '#8a8178', o: '#4a3b4f', e: '#b0653a', c: '#3fb5a0', x: '#8e5ab8', r: '#6b5640', u: '#8e8e99', l: '#b59a4a', w: '#c8b88c', i: '#2b2b30', s: '#b8bca8', p: '#7a5a3a', h: '#d9c98a' };
let W = 900, H = 620;              // zoom view canvas size (set by the layout)
export function setViewSize(w: number, h: number) { W = Math.max(300, Math.floor(w)); H = Math.max(200, Math.floor(h)); }
const IMG_ZOOM = 4.5;              // below this px/tile the 1px image is drawn instead of individual tiles
const DETAIL_ZOOM = 9;             // above this, tile decorations are drawn
const hash = (x: number, y: number, k = 0) => (((x * 73856093) ^ (y * 19349663) ^ (k * 83492791)) >>> 0) % 1000 / 1000;

const cam = { x: 0, y: 0, z: 12, init: false };

const SVG = (body: string) => '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">' + body + '</svg>';
// ---- value layers: population / transport availability / build price, shown as a heat map over the world (toggled with the buttons in the zoom view)
type Layer = '' | 'fert' | 'poll' | 'pop' | 'transport' | 'price' | 'needs';
let layer: Layer = '';
// what the map draws (Show menu)
const SHOW_OPTS: [string, string][] = [['terrain', 'Terrain'], ['rails', 'Railways'], ['lots', 'Owned lots'], ['buildings', 'Buildings'], ['cities', 'City names'], ['forsale', 'Facilities for sale']];
const show: Record<string, boolean> = (() => { const d: Record<string, boolean> = {}; for (const [k] of SHOW_OPTS) d[k] = true; try { Object.assign(d, JSON.parse(localStorage.getItem('capital.show') ?? '{}')); } catch { /* defaults */ } return d; })();
const LAYERS: { id: Layer; label: string; title: string; rgb: [number, number, number] }[] = [
  { id: 'poll', label: 'Pollution', title: 'Pollution from cities, factories and roads (blights farmland)', rgb: [150, 110, 40] },
  { id: 'fert', label: 'Fertility', title: 'Fertility (farmland, forest density, suburb services)', rgb: [60, 180, 75] },
  { id: 'pop', label: 'Population', title: 'Population per tile', rgb: [214, 40, 40] }, { id: 'transport', label: 'Transportability', title: 'Transport availability (roads, ports, rails)', rgb: [20, 150, 230] }, { id: 'price', label: 'Price', title: 'Price to build here', rgb: [150, 60, 200] },
  { id: 'needs', label: 'Needs met', title: 'City tiles: how well their needs were met last month (goods sold to them by shops that reach them, clean air, city wealth)', rgb: [230, 150, 20] }];
let ovCache: { key: string; cv: HTMLCanvasElement; max: number } | null = null;
export const tileCtx = () => { const v = S.view!; if (emCache?.turn !== v.turn) emCache = { turn: v.turn, em: [...v.buildings, ...v.others].filter(b => !b.building).map(b => ({ idx: b.idx, w: factoryPollution(b.type, b.product) })).filter(e => e.w > 0) }; return { cities: v.cities, world: S.world!, emitters: emCache.em, turn: v.turn }; };
let emCache: { turn: number; em: { idx: number; w: number }[] } | null = null;
const layerValue = (l: Layer, idx: number): number => { if (l === 'needs') return S.view!.tileScore?.[idx] != null ? Math.max(1, S.view!.tileScore[idx]) : 0; const c = tileCtx(); if (l === 'poll') return Math.round(tilePollution(c, idx) * 100); if (l === 'fert') { const q = tileQuality(c, idx); return q == null ? 0 : Math.max(1, Math.round(q * 100)); } return l === 'pop' ? tilePop(c, idx) : l === 'transport' ? tileTransport(c, idx) : l === 'price' ? (railMap(c)?.on[idx] ? 0 : lotPrice(c, idx)) : 0; };
function overlayImage(): { cv: HTMLCanvasElement; max: number } | null {
  const wd = S.world, v = S.view; if (!wd || !v || !layer) return null;
  const key = layer + ':' + v.turn + ':' + wd.id + ':' + v.worldRev + ':' + v.buildings.length + ':' + v.others.length; if (ovCache?.key === key) return ovCache;
  const vals = new Float32Array(wd.w * wd.h); let max = 1; for (let i = 0; i < vals.length; i++) { vals[i] = layerValue(layer, i); if (vals[i] > max) max = vals[i]; }
  const cv = document.createElement('canvas'); cv.width = wd.w; cv.height = wd.h; const g = cv.getContext('2d')!; const img = g.createImageData(wd.w, wd.h);
  const rgb = LAYERS.find(l => l.id === layer)!.rgb;
  for (let i = 0; i < vals.length; i++) { const x = vals[i]; if (x <= 0) continue; const t = layer === 'transport' || layer === 'fert' || layer === 'poll' || layer === 'needs' ? x / 100 : Math.sqrt(x / max); const o = i * 4; img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = Math.round(25 + 200 * t); }
  g.putImageData(img, 0, 0); ovCache = { key, cv, max }; return ovCache;
}
let mainRedraw: () => void = () => {}, miniRedraw: () => void = () => {};

// ---------------------------------------------------------------- world image (1 pixel per tile)
export function makeWorldImage(w: number, h_: number, tiles: string, rails: { tiles: number[] }[] = []): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h_;
  const g = cv.getContext('2d')!; const img = g.createImageData(w, h_); const rgb: Record<string, number[]> = {};
  for (const [k, c] of Object.entries(COL)) rgb[k] = [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  for (let y = 0; y < h_; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, c = rgb[tiles[i]] ?? [255, 0, 255], sh = 1 - hash(x, y) * 0.1, o = i * 4;
    img.data[o] = c[0] * sh; img.data[o + 1] = c[1] * sh; img.data[o + 2] = c[2] * sh; img.data[o + 3] = 255;
  }
  for (const r of rails) for (const t of r.tiles) { const o = t * 4; img.data[o] = 30; img.data[o + 1] = 30; img.data[o + 2] = 34; }
  g.putImageData(img, 0, 0); return cv;
}

export function findResources(tiles: string): number[] {
  const out: number[] = []; for (let i = 0; i < tiles.length; i++) if (tiles[i] === 'o' || tiles[i] === 'e' || tiles[i] === 'c' || tiles[i] === 'x') out.push(i); return out;
}
/** Resource icon: oil = black drop disc with yellow ring, ore = orange diamond. Centered at cx,cy with the given size. */
export function resIcon(g: CanvasRenderingContext2D, ch: string, cx: number, cy: number, size: number) {
  const r = size / 2; g.lineWidth = Math.max(1, size * 0.14);
  if (ch === 'o') { g.fillStyle = '#111'; g.strokeStyle = '#ffd400'; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#ffd400'; g.beginPath(); g.arc(cx, cy, r * 0.35, 0, 7); g.fill(); }
  else { g.fillStyle = '#ff9a3c'; g.strokeStyle = '#3a1d0a'; g.beginPath(); g.moveTo(cx, cy - r); g.lineTo(cx + r, cy); g.lineTo(cx, cy + r); g.lineTo(cx - r, cy); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#fff2d0'; g.fillRect(cx - r * 0.2, cy - r * 0.45, r * 0.25, r * 0.25); }
}

// ---------------------------------------------------------------- camera helpers
function clampCam() {
  const wd = S.world!; const vw = W / cam.z, vh = H / cam.z;
  cam.x = vw >= wd.w ? (wd.w - vw) / 2 : Math.max(-2, Math.min(wd.w - vw + 2, cam.x));
  cam.y = vh >= wd.h ? (wd.h - vh) / 2 : Math.max(-2, Math.min(wd.h - vh + 2, cam.y));
}
/** The last clicked tile and the map position (zoom view) are remembered per game in this browser, and come back when you rejoin. */
const MAP_KEY = (id: string) => 'capital.map.' + id;
export function saveMapState() {
  if (!S.gameId || !S.world || !cam.init) return;
  try { localStorage.setItem(MAP_KEY(S.gameId), JSON.stringify({ x: +cam.x.toFixed(2), y: +cam.y.toFixed(2), z: +cam.z.toFixed(2), sel: S.sel, building: S.buildingId, city: S.city })); } catch { /* storage full or off: not important */ }
}
export function restoreMapState(gameId: string): { sel: number | null; building: string | null; city: number | null } {
  try {
    const m = JSON.parse(localStorage.getItem(MAP_KEY(gameId)) ?? 'null'); if (!m || !Number.isFinite(m.x) || !Number.isFinite(m.y) || !Number.isFinite(m.z)) return { sel: null, building: null, city: null };
    cam.x = m.x; cam.y = m.y; cam.z = Math.max(1, Math.min(64, m.z)); cam.init = true; // the camera is clamped to the map once it is drawn
    return { sel: Number.isInteger(m.sel) ? m.sel : null, building: typeof m.building === 'string' ? m.building : null, city: Number.isInteger(m.city) ? m.city : null };
  } catch { return { sel: null, building: null, city: null }; }
}
window.addEventListener('pagehide', saveMapState); window.addEventListener('beforeunload', saveMapState);
export function focusTile(idx: number, zoom = 0) {
  const wd = S.world; if (!wd) return; if (zoom) cam.z = zoom;
  cam.x = (idx % wd.w) + 0.5 - W / cam.z / 2; cam.y = Math.floor(idx / wd.w) + 0.5 - H / cam.z / 2; clampCam();
}
/** Tile of a city's town hall (null when it has none). */
export function cityHallTile(id: number): number | null {
  const wd = S.world, v = S.view; if (!wd || !v) return null; const c = v.cities[id]; const cx = Math.floor(c.x / WORLD_SCALE), cy = Math.floor(c.y / WORLD_SCALE); let best: number | null = null, bd = 1e9;
  for (let i = 0; i < wd.tiles.length; i++) if (wd.tiles[i] === 'h') { const d = Math.hypot((i % wd.w) - cx, Math.floor(i / wd.w) - cy); if (d < bd) { bd = d; best = i; } }
  return best;
}
export function focusCity(id: number) {
  const c = S.view!.cities[id]; const wd = S.world!;
  focusTile(Math.floor(c.y / WORLD_SCALE) * wd.w + Math.floor(c.x / WORLD_SCALE), Math.max(cam.z, 13));
}
const minZoom = () => Math.min(W / S.world!.w, H / S.world!.h) * 0.95;

// ---------------------------------------------------------------- panels
const ICONS = {
  zoomIn: SVG('<circle cx="6.5" cy="6.5" r="4.5"/><path d="M10 10l4.5 4.5M4.5 6.5h4M6.5 4.5v4"/>'),
  zoomOut: SVG('<circle cx="6.5" cy="6.5" r="4.5"/><path d="M10 10l4.5 4.5M4.5 6.5h4"/>'),
  center: SVG('<circle cx="8" cy="8" r="4"/><path d="M8 1v3M8 12v3M1 8h3M12 8h3"/>'),
  world: SVG('<circle cx="8" cy="8" r="6.5"/><ellipse cx="8" cy="8" rx="3" ry="6.5"/><path d="M1.5 8h13"/>'),
};
function iconBtn(svg: string, title: string, onclick: () => void) { const b = h('button', { class: 'ibtn', title, onclick }); b.innerHTML = svg; return b; }

/** Map canvases are never stretched by CSS: the CSS size is exactly the logical size, the backing store is that times the device pixel ratio (sharp on hi-dpi / browser zoom). */
function sizeCanvas<T extends HTMLCanvasElement>(cv: T, w: number, h_: number): T {
  const d = Math.max(1, window.devicePixelRatio || 1); cv.width = Math.round(w * d); cv.height = Math.round(h_ * d);
  cv.style.width = w + 'px'; cv.style.height = h_ + 'px'; cv.style.maxWidth = 'none'; cv.style.flex = 'none'; cv.dataset.lw = String(w); cv.dataset.lh = String(h_); return cv;
}
const lw = (cv: HTMLCanvasElement) => +(cv.dataset.lw ?? cv.width), lh = (cv: HTMLCanvasElement) => +(cv.dataset.lh ?? cv.height);
const miniGeom = (cv: HTMLCanvasElement) => { const wd = S.world!; const k = Math.min(lw(cv) / wd.w, lh(cv) / wd.h); return { k, ox: (lw(cv) - wd.w * k) / 2, oy: (lh(cv) - wd.h * k) / 2 }; };

/** Builds the two framed canvases: world view (minimap) and zoom view, each exactly the given pixel size. */
export function worldPanels(miniW: number, miniH: number): { mini: HTMLElement; main: HTMLElement } {
  const v = S.view!; const wd = S.world;
  if (!wd) return { mini: h('div', { class: 'frame' }, 'Loading world…'), main: h('div', { class: 'frame' }, 'Loading world…') };
  if (!cam.init) {
    const mine = v.buildings[0]; const big = v.cities.reduce((b, c) => c.pop > v.cities[b].pop ? c.id : b, 0);
    cam.init = true; cam.z = 13;
    if (mine) focusTile(mine.idx); else focusCity(big);
  }
  clampCam();

  // ---- zoom view
  const cv = sizeCanvas(h('canvas', { style: 'cursor:grab;display:block' }), W, H);
  const info = h('div', { class: 'mapinfo' }, '');
  let hoverIdx = -1, pending = false;
  mainRedraw = () => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; drawMain(cv, hoverIdx); drawMini(mini); }); };
  const toTile = (e: MouseEvent) => { const r = cv.getBoundingClientRect(); const mx = (e.clientX - r.left) * W / r.width, my = (e.clientY - r.top) * H / r.height; return { mx, my, tx: cam.x + mx / cam.z, ty: cam.y + my / cam.z }; };
  cv.addEventListener('wheel', e => {
    e.preventDefault(); const { mx, my, tx, ty } = toTile(e);
    cam.z = Math.max(minZoom(), Math.min(64, cam.z * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
    cam.x = tx - mx / cam.z; cam.y = ty - my / cam.z; clampCam(); mainRedraw();
  }, { passive: false });
  let drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false }; cv.style.cursor = 'grabbing'; });
  cv.addEventListener('pointermove', e => {
    if (drag) {
      const r = cv.getBoundingClientRect(); const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      cam.x = drag.cx - dx * (W / r.width) / cam.z; cam.y = drag.cy - dy * (H / r.height) / cam.z; clampCam();
    }
    const { tx, ty } = toTile(e); const x = Math.floor(tx), y = Math.floor(ty);
    const ni = x >= 0 && y >= 0 && x < wd.w && y < wd.h ? y * wd.w + x : -1;
    if (ni >= 0) showInfo(info, ni); info.style.display = ni >= 0 ? 'flex' : 'none';
    hoverIdx = ni; mainRedraw();
  });
  cv.addEventListener('pointerleave', () => { hoverIdx = -1; info.style.display = 'none'; mainRedraw(); });
  cv.addEventListener('pointerup', e => {
    const d = drag; drag = null; cv.style.cursor = 'grab'; if (d?.moved) saveMapState(); if (!d || d.moved) return;
    const { tx, ty } = toTile(e); const x = Math.floor(tx), y = Math.floor(ty);
    if (x < 0 || y < 0 || x >= wd.w || y >= wd.h) return;
    const idx = y * wd.w + x; S.sel = idx; S.city = nearestCity(v.cities, idx);
    const b = v.buildings.find(b => b.idx === idx); S.buildingId = b ? b.id : null; S.render(); saveMapState();
  });
  const zoomBy = (f: number) => { const cx = cam.x + W / cam.z / 2, cy = cam.y + H / cam.z / 2; cam.z = Math.max(minZoom(), Math.min(64, cam.z * f)); cam.x = cx - W / cam.z / 2; cam.y = cy - H / cam.z / 2; clampCam(); mainRedraw(); };
  const toolbar = h('div', { class: 'maptools' },
    iconBtn(ICONS.zoomIn, 'Zoom in', () => zoomBy(1.4)), iconBtn(ICONS.zoomOut, 'Zoom out', () => zoomBy(1 / 1.4)),
    iconBtn(ICONS.center, 'Center on selection', () => { if (S.sel != null) focusTile(S.sel); else focusCity(S.city); mainRedraw(); }),
    iconBtn(ICONS.world, 'Show the whole world', () => { cam.z = minZoom(); cam.x = 0; cam.y = 0; clampCam(); mainRedraw(); }),
    h('select', { class: 'layersel', title: 'Map view', onchange: (e: Event) => { layer = (e.target as HTMLSelectElement).value as Layer; mainRedraw(); miniRedraw(); } },
      h('option', { value: '', selected: !layer }, tr('Terrain')), ...LAYERS.map(l => h('option', { value: l.id, selected: layer === l.id }, tr(l.label)))));
  const menu = h('div', { class: 'showmenu', style: 'display:none' }, SHOW_OPTS.map(([k, label]) => h('label', null, h('input', { type: 'checkbox', checked: show[k], onchange: (e: Event) => { show[k] = (e.target as HTMLInputElement).checked; localStorage.setItem('capital.show', JSON.stringify(show)); mainRedraw(); } }), ' ' + label)));
  const showBtn = h('button', { class: 'ibtn showbtn', title: 'Show / hide map elements', onclick: () => { menu.style.display = menu.style.display === 'none' ? 'block' : 'none'; } }, 'Show ▾');
  toolbar.append(h('div', { style: 'position:relative' }, showBtn, menu));
  const main = h('div', { class: 'frame', style: 'position:relative;width:' + W + 'px;height:' + H + 'px' }, cv, toolbar, info);

  // ---- world view (minimap, 1 pixel per tile image)
  const mini = sizeCanvas(h('canvas', { style: 'cursor:crosshair;display:block' }), Math.floor(miniW), Math.floor(miniH));
  let mdown = false;
  const miniTo = (e: PointerEvent) => { const r = mini.getBoundingClientRect(); const { k, ox, oy } = miniGeom(mini); const px = (e.clientX - r.left) * lw(mini) / r.width, py = (e.clientY - r.top) * lh(mini) / r.height; cam.x = (px - ox) / k - W / cam.z / 2; cam.y = (py - oy) / k - H / cam.z / 2; clampCam(); mainRedraw(); };
  mini.addEventListener('pointerdown', e => { mdown = true; mini.setPointerCapture(e.pointerId); miniTo(e); });
  mini.addEventListener('pointermove', e => { if (mdown) miniTo(e); });
  mini.addEventListener('pointerup', () => { mdown = false; });
  miniRedraw = () => drawMini(mini);
  const miniPanel = h('div', { class: 'frame', style: 'width:' + Math.floor(miniW) + 'px;height:' + Math.floor(miniH) + 'px' }, mini);
  mainRedraw();
  return { mini: miniPanel, main };
}

/** Hover info as fixed fields (label over value), so every datum always sits in the same place. */
function tileFields(idx: number): [string, string][] {
  const v = S.view!, wd = S.world!; const t = terrainAt({ world: wd }, idx) as Terrain; const x = idx % wd.w, y = Math.floor(idx / wd.w);
  const lot = v.lots[String(idx)]; const b = [...v.buildings.filter(x => !x.mall), ...v.others].find(o => o.idx === idx);
  const rm = railMap({ world: wd }); const tc = tileCtx();
  const price = TERRAIN_INFO[t].price && !rm?.on[idx] ? money(lotPrice(tc, idx)) : '';
  const ql = tileQuality(tc, idx); const hc = tileHaul(tc, idx);
  return [['Terrain', TERRAIN_INFO[t].name + (rm?.on[idx] ? ' + 🚆' : '')], [ql == null ? 'Quality' : QUALITY_NAME[t], ql == null ? '–' : Math.round(ql * 100) + '%'],
    ['Population', num(tilePop(tc, idx))], ['Transport', tileTransport(tc, idx) + '/100'], ['Pollution', Math.round(tilePollution(tc, idx) * 100) + '%'], ['Haul cost', hc.step ? String(hc.step) : '–'], ['City', v.cities[hc.city].name],
    [lot ? 'Owner' : 'Price', lot ? companyOf(lot.owner)?.name ?? '?' : price || '–'], ['Facility', b ? b.name : '–']];
}
function showInfo(info: HTMLElement, idx: number) {
  info.replaceChildren(...tileFields(idx).map(([k, val]) => h('div', { class: 'mf' }, h('small', null, k), h('b', null, val))));
}

// ---------------------------------------------------------------- drawing
function drawMini(cv: HTMLCanvasElement) {
  const v = S.view; const wd = S.world; if (!v || !wd) return; const g = cv.getContext('2d')!; const { k, ox, oy } = miniGeom(cv);
  g.setTransform(Math.max(1, window.devicePixelRatio || 1), 0, 0, Math.max(1, window.devicePixelRatio || 1), 0, 0); g.fillStyle = COL.d; g.fillRect(0, 0, lw(cv), lh(cv));
  g.imageSmoothingEnabled = false; if (layer) { g.fillStyle = '#1b1f27'; g.fillRect(0, 0, lw(cv), lh(cv)); } else g.drawImage(wd.img, 0, 0, wd.w, wd.h, ox, oy, wd.w * k, wd.h * k);
  const mov = overlayImage(); if (mov) g.drawImage(mov.cv, 0, 0, wd.w, wd.h, ox, oy, wd.w * k, wd.h * k);
  const X = (tx: number) => ox + tx * k, Y = (ty: number) => oy + ty * k;
  for (const b of show.buildings ? [...v.buildings.filter(x => !x.mall), ...v.others] : []) { g.fillStyle = companyOf(b.owner)?.color ?? '#000'; const s = Math.max(3, k * 1.6); g.fillRect(X(b.idx % wd.w + 0.5) - s / 2, Y(Math.floor(b.idx / wd.w) + 0.5) - s / 2, s, s); }
  g.font = 'bold 10px system-ui'; g.textAlign = 'center'; g.lineJoin = 'round';
  for (const c of v.cities) { const x = X(c.x / WORLD_SCALE), y = Y(c.y / WORLD_SCALE); g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(c.name, x, y - 7); g.fillStyle = '#fff'; g.fillText(c.name, x, y - 7); }
  g.strokeStyle = '#ffd400'; g.lineWidth = 1.5; g.strokeRect(X(cam.x), Y(cam.y), W / cam.z * k, H / cam.z * k);
}

/** Draws one tile (terrain + decorations) with its top-left corner at (sx, sy), z pixels per tile. x,y are the tile coordinates (they seed the variations); at() tells the neighbours (used by roads). */
export function drawTile(g: CanvasRenderingContext2D, ch: string, x: number, y: number, sx: number, sy: number, z: number, at: (x: number, y: number) => string) {
  const detail = z >= DETAIL_ZOOM, zs = Math.ceil(z) + 0.5; const hv = hash(x, y);
  g.fillStyle = ch === 'r' ? (detail ? COL.g : COL.r) : ch === 'p' && detail ? COL.a : COL[ch]; g.fillRect(sx, sy, zs, zs);
  g.fillStyle = 'rgba(0,0,0,' + (hv * 0.09).toFixed(3) + ')'; g.fillRect(sx, sy, zs, zs);
  if (!detail) return;
  switch (ch) {
    case 'd': case 'a': if (hv > 0.7) { g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(sx + z * 0.2, sy + z * 0.5); g.quadraticCurveTo(sx + z * 0.35, sy + z * 0.3, sx + z * 0.5, sy + z * 0.5); g.quadraticCurveTo(sx + z * 0.65, sy + z * 0.7, sx + z * 0.8, sy + z * 0.5); g.stroke(); } break;
    case 'f': g.strokeStyle = 'rgba(120,90,20,.45)'; g.lineWidth = Math.max(1, z * 0.08); for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(sx, sy + z * k / 4); g.lineTo(sx + z, sy + z * k / 4); g.stroke(); } break;
    case 't': g.fillStyle = '#245a2f'; for (let k = 0; k < 2; k++) { g.beginPath(); g.arc(sx + z * (0.3 + 0.4 * hash(x, y, k + 1)), sy + z * (0.35 + 0.35 * hash(x, y, k + 3)), z * 0.24, 0, 7); g.fill(); } break;
    case 'g': if (hv > 0.6) { g.fillStyle = 'rgba(40,110,40,.4)'; g.fillRect(sx + z * hv * 0.6, sy + z * 0.5, Math.max(1, z * 0.08), z * 0.2); } break;
    case 'm': g.fillStyle = '#6a625a'; g.beginPath(); g.moveTo(sx + z * 0.5, sy + z * 0.12); g.lineTo(sx + z * 0.95, sy + z * 0.9); g.lineTo(sx + z * 0.05, sy + z * 0.9); g.fill(); g.fillStyle = '#e8e8ec'; g.beginPath(); g.moveTo(sx + z * 0.5, sy + z * 0.12); g.lineTo(sx + z * 0.62, sy + z * 0.38); g.lineTo(sx + z * 0.38, sy + z * 0.38); g.fill(); break;
    case 'e': case 'c': case 'x': g.fillStyle = '#5d4a3a'; g.beginPath(); g.moveTo(sx + z * 0.1, sy + z * 0.9); g.lineTo(sx + z * 0.3, sy + z * 0.35); g.lineTo(sx + z * 0.55, sy + z * 0.55); g.lineTo(sx + z * 0.72, sy + z * 0.25); g.lineTo(sx + z * 0.92, sy + z * 0.9); g.fill(); g.fillStyle = ch === 'c' ? '#3ff0d0' : ch === 'x' ? '#e0a8ff' : '#ff9a3c'; g.fillRect(sx + z * 0.32, sy + z * 0.62, z * 0.14, z * 0.12); g.fillRect(sx + z * 0.62, sy + z * 0.55, z * 0.12, z * 0.12); g.fillRect(sx + z * 0.5, sy + z * 0.78, z * 0.1, z * 0.1); break;
    case 'o': g.strokeStyle = '#111'; g.lineWidth = Math.max(1, z * 0.07); g.beginPath(); g.moveTo(sx + z * 0.3, sy + z * 0.85); g.lineTo(sx + z * 0.5, sy + z * 0.2); g.lineTo(sx + z * 0.7, sy + z * 0.85); g.moveTo(sx + z * 0.38, sy + z * 0.6); g.lineTo(sx + z * 0.62, sy + z * 0.6); g.stroke(); g.fillStyle = '#000'; g.beginPath(); g.arc(sx + z * 0.2, sy + z * 0.8, z * 0.1, 0, 7); g.fill(); break;
    case 'r': {
      g.strokeStyle = '#5b4b3a'; g.lineCap = 'round'; g.lineWidth = Math.max(2, z * 0.34); const cx = sx + z / 2, cy = sy + z / 2;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy); g.stroke();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if ('rulpshwi'.includes(at(x + dx, y + dy))) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + dx * z / 2, cy + dy * z / 2); g.stroke(); }
      g.strokeStyle = '#d8c9a0'; g.lineWidth = Math.max(1, z * 0.08); g.setLineDash([z * 0.15, z * 0.15]);
      for (const [dx, dy] of [[1, 0], [0, 1]]) if ('rulpshwi'.includes(at(x + dx, y + dy)) || 'rulpshwi'.includes(at(x - dx, y - dy))) { g.beginPath(); g.moveTo(cx - dx * z / 2, cy - dy * z / 2); g.lineTo(cx + dx * z / 2, cy + dy * z / 2); g.stroke(); }
      g.setLineDash([]); break;
    }
    case 'u': {
      const hgt = 0.35 + 0.55 * hash(x, y, 4); g.fillStyle = ['#5d6370', '#6b7080', '#4f5663'][Math.floor(hash(x, y, 5) * 3)]; g.fillRect(sx + z * 0.14, sy + z * (1 - hgt - 0.06), z * 0.72, z * hgt);
      g.fillStyle = 'rgba(255,235,150,.7)'; if (z >= 14) for (let wy = 0; wy < hgt * 4; wy++) for (let wx = 0; wx < 3; wx++) if (hash(x * 3 + wx, y * 4 + wy) > 0.35) g.fillRect(sx + z * (0.22 + wx * 0.22), sy + z * (1 - hgt - 0.01 + wy * 0.22 * 0.6 + 0.04), z * 0.1, z * 0.07);
      break;
    }
    case 'l': {
      // luxury downtown: tall golden towers with lit windows
      g.fillStyle = '#4a4130'; g.fillRect(sx, sy, z, z); const hgt = 0.55 + 0.4 * hash(x, y, 4);
      g.fillStyle = ['#c9ad55', '#d6bb62', '#b89a45'][Math.floor(hash(x, y, 5) * 3)]; g.fillRect(sx + z * 0.12, sy + z * (1 - hgt - 0.04), z * 0.76, z * hgt);
      g.fillStyle = '#f4e7a8'; g.fillRect(sx + z * 0.45, sy + z * (1 - hgt - 0.1), z * 0.1, z * 0.08);
      g.fillStyle = 'rgba(255,250,215,.85)'; if (z >= 14) for (let wy = 0; wy < hgt * 5; wy++) for (let wx = 0; wx < 3; wx++) if (hash(x * 3 + wx, y * 5 + wy) > 0.25) g.fillRect(sx + z * (0.2 + wx * 0.24), sy + z * (1 - hgt + wy * 0.18), z * 0.1, z * 0.08);
      break;
    }
    case 'i': g.fillStyle = '#8f8f96'; g.fillRect(sx, sy, z, z); break; // railroad: pavement (the track itself is drawn over it by the rail layer)
    case 'w': {
      // town: a few brown cottages with red roofs round a yard, on trampled ground
      g.fillStyle = 'rgba(120,95,55,.35)'; g.fillRect(sx + z * 0.05, sy + z * 0.05, z * 0.9, z * 0.9);
      const n = 2 + Math.floor(hv * 2.5);
      for (let k = 0; k < n; k++) { const hx = sx + z * (0.08 + 0.55 * hash(x, y, k + 11)), hy = sy + z * (0.18 + 0.5 * hash(x, y, k + 17)), hw = z * 0.3;
        g.fillStyle = '#9a7650'; g.fillRect(hx, hy + hw * 0.45, hw, hw * 0.65); g.fillStyle = '#b5472f'; g.beginPath(); g.moveTo(hx - hw * 0.1, hy + hw * 0.5); g.lineTo(hx + hw * 0.5, hy); g.lineTo(hx + hw * 1.1, hy + hw * 0.5); g.fill(); }
      break;
    }
    case 's': {
      const n = 1 + Math.floor(hv * 2.5);
      for (let k = 0; k < n; k++) { const hx = sx + z * (0.08 + 0.5 * hash(x, y, k + 5)), hy = sy + z * (0.15 + 0.45 * hash(x, y, k + 9)), hw = z * 0.32; g.fillStyle = '#e9e2d0'; g.fillRect(hx, hy + hw * 0.4, hw, hw * 0.7); g.fillStyle = ['#c0504d', '#b06a3a', '#8a5a4a'][Math.floor(hash(x, y, k + 20) * 3)]; g.beginPath(); g.moveTo(hx - 1, hy + hw * 0.45); g.lineTo(hx + hw / 2, hy); g.lineTo(hx + hw + 1, hy + hw * 0.45); g.fill(); }
      break;
    }
    case 'h': {
      // town hall: stone plaza with a columned building and a flag
      g.fillStyle = '#d9d2b8'; g.fillRect(sx, sy, z, z); g.fillStyle = '#efe9d4'; g.fillRect(sx + z * 0.1, sy + z * 0.42, z * 0.8, z * 0.48);
      g.fillStyle = '#b9ac86'; g.beginPath(); g.moveTo(sx + z * 0.04, sy + z * 0.44); g.lineTo(sx + z * 0.5, sy + z * 0.14); g.lineTo(sx + z * 0.96, sy + z * 0.44); g.fill();
      g.fillStyle = '#8a7d58'; for (let k = 0; k < 4; k++) g.fillRect(sx + z * (0.17 + k * 0.2), sy + z * 0.5, z * 0.07, z * 0.36);
      g.fillStyle = '#c0504d'; g.fillRect(sx + z * 0.5, sy + z * 0.02, z * 0.14, z * 0.09); g.fillStyle = '#5a4128'; g.fillRect(sx + z * 0.49, sy + z * 0.02, z * 0.02, z * 0.14); break;
    }
    case 'p': {
      // harbour: wooden pier with posts, plus a boat moored on some tiles
      g.fillStyle = '#8b6b43'; g.fillRect(sx, sy + z * 0.38, z, z * 0.26); g.strokeStyle = '#5a4128'; g.lineWidth = 1; for (let k = 1; k < 5; k++) { g.beginPath(); g.moveTo(sx + z * k / 5, sy + z * 0.38); g.lineTo(sx + z * k / 5, sy + z * 0.64); g.stroke(); }
      g.fillStyle = '#4a3320'; g.fillRect(sx + z * 0.05, sy + z * 0.3, z * 0.1, z * 0.4); g.fillRect(sx + z * 0.85, sy + z * 0.3, z * 0.1, z * 0.4);
      if (hv > 0.35) { g.fillStyle = '#f2f2f2'; g.beginPath(); g.moveTo(sx + z * 0.2, sy + z * 0.72); g.lineTo(sx + z * 0.8, sy + z * 0.72); g.lineTo(sx + z * 0.68, sy + z * 0.92); g.lineTo(sx + z * 0.32, sy + z * 0.92); g.fill(); g.fillStyle = '#c0504d'; g.fillRect(sx + z * 0.46, sy + z * 0.5, z * 0.05, z * 0.22); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(sx + z * 0.52, sy + z * 0.5); g.lineTo(sx + z * 0.74, sy + z * 0.7); g.lineTo(sx + z * 0.52, sy + z * 0.7); g.fill(); }
      break;
    }
  }
}

/** Railway tile: grey pavement under wooden sleepers and two steel rails towards every neighbouring rail tile (on(x,y) tells where track exists). */
export function drawRail(g: CanvasRenderingContext2D, x: number, y: number, sx: number, sy: number, z: number, on: (x: number, y: number) => boolean) {
  const cx = sx + z / 2, cy = sy + z / 2; g.lineCap = 'butt';
  const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => on(x + dx, y + dy)); const ends = nb.length ? nb : [[1, 0], [-1, 0]];
  const seg = (dx: number, dy: number, off: number, w: number, col: string) => { const px = -dy * off, py = dx * off; g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(cx + px, cy + py); g.lineTo(cx + px + dx * z / 2, cy + py + dy * z / 2); g.stroke(); };
  g.fillStyle = '#8f8f96'; g.fillRect(sx, sy, z, z); // pavement under the track
  for (const [dx, dy] of ends) { // sleepers: short bars across the track
    g.strokeStyle = '#5a4128'; g.lineWidth = Math.max(1, z * 0.07);
    for (const t of [0.12, 0.37]) { const mx = cx + dx * z * t, my = cy + dy * z * t, hx = -dy * z * 0.2, hy = dx * z * 0.2; g.beginPath(); g.moveTo(mx - hx, my - hy); g.lineTo(mx + hx, my + hy); g.stroke(); }
  }
  g.strokeStyle = '#5a4128'; g.lineWidth = Math.max(1, z * 0.07); g.beginPath(); g.moveTo(cx - z * 0.2, cy); g.lineTo(cx + z * 0.2, cy); g.moveTo(cx, cy - z * 0.2); g.lineTo(cx, cy + z * 0.2); g.stroke();
  for (const off of [-z * 0.1, z * 0.1]) for (const [dx, dy] of ends) seg(dx, dy, off, Math.max(1, z * 0.055), '#e4e6ea'); // steel rails
  g.fillStyle = '#e4e6ea'; for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.fillRect(cx + ox * z * 0.1 - z * 0.03, cy + oy * z * 0.1 - z * 0.03, z * 0.06, z * 0.06);
}

function drawMain(cv: HTMLCanvasElement, hoverIdx: number) {
  const v = S.view; const wd = S.world; if (!v || !wd) return; const g = cv.getContext('2d')!; const z = cam.z; g.setTransform(Math.max(1, window.devicePixelRatio || 1), 0, 0, Math.max(1, window.devicePixelRatio || 1), 0, 0);
  g.fillStyle = '#10345f'; g.fillRect(0, 0, W, H);
  const x0 = Math.max(0, Math.floor(cam.x)), y0 = Math.max(0, Math.floor(cam.y)), x1 = Math.min(wd.w - 1, Math.ceil(cam.x + W / z)), y1 = Math.min(wd.h - 1, Math.ceil(cam.y + H / z));
  const tiles = wd.tiles; const at = (x: number, y: number) => (x < 0 || y < 0 || x >= wd.w || y >= wd.h ? 'd' : tiles[y * wd.w + x]);
  // with a value layer or a transport-cost field on, the terrain tiles are hidden: only the overlay shows (on a flat dark background)
  const overlayOn = !!layer || !!(S.costField && v.buildings.some(b => b.id === S.costField));
  if (overlayOn) { g.fillStyle = '#1b1f27'; g.fillRect(0, 0, W, H); }
  else if (!show.terrain) { /* flat background only */ }
  else if (z < IMG_ZOOM) {
    // zoomed out: blit the pre-rendered 1px-per-tile image instead of drawing every tile
    g.imageSmoothingEnabled = false;
    const sx = Math.max(0, cam.x), sy = Math.max(0, cam.y), ex = Math.min(wd.w, cam.x + W / z), ey = Math.min(wd.h, cam.y + H / z);
    g.drawImage(wd.img, sx, sy, ex - sx, ey - sy, (sx - cam.x) * z, (sy - cam.y) * z, (ex - sx) * z, (ey - sy) * z);
  } else {
    const detail = z >= DETAIL_ZOOM, zs = Math.ceil(z) + 0.5;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const ch = tiles[y * wd.w + x]; const sx = Math.floor((x - cam.x) * z), sy = Math.floor((y - cam.y) * z); const hv = hash(x, y);
      drawTile(g, ch, x, y, sx, sy, z, at);
    }
  }
  // ---- railway tracks
  const rm = railMap({ world: wd });
  if (rm && show.rails && !overlayOn && z >= IMG_ZOOM) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!rm.on[y * wd.w + x]) continue;
    drawRail(g, x, y, (x - cam.x) * z, (y - cam.y) * z, z, (ax, ay) => ax >= 0 && ay >= 0 && ax < wd.w && ay < wd.h && !!rm.on[ay * wd.w + ax]);
  }
  // ---- value layer
  const ov = overlayImage();
  if (ov) {
    g.imageSmoothingEnabled = false; const sx = Math.max(0, cam.x), sy = Math.max(0, cam.y), ex = Math.min(wd.w, cam.x + W / z), ey = Math.min(wd.h, cam.y + H / z);
    g.drawImage(ov.cv, sx, sy, ex - sx, ey - sy, (sx - cam.x) * z, (sy - cam.y) * z, (ex - sx) * z, (ey - sy) * z);
    if (z >= 26) { g.font = `bold ${Math.round(Math.min(14, z * 0.32))}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = 3;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const val = layerValue(layer, y * wd.w + x); if (val <= 0) continue; const t = layer === 'price' ? (val >= 1000 ? Math.round(val / 1000) + 'k' : String(Math.round(val))) : num(val); const px = (x - cam.x + 0.5) * z, py = (y - cam.y + 0.5) * z + z * 0.3; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(t, px, py); g.fillStyle = '#fff'; g.fillText(t, px, py); } }
    const lg = LAYERS.find(l => l.id === layer)!; g.fillStyle = 'rgba(20,20,20,.75)'; g.fillRect(8, H - 26, 230, 20); g.fillStyle = '#fff'; g.font = '11px system-ui'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(tr(lg.title) + tr(' · max ') + (layer === 'transport' || layer === 'fert' || layer === 'poll' ? '100' : layer === 'price' ? money(ov.max) : num(ov.max)), 14, H - 16);
  }
  // ---- transport cost field of the facility whose toggle is on
  const cb = S.costField ? v.buildings.find(b => b.id === S.costField) : undefined;
  if (cb) {
    const f = costField({ cities: v.cities, world: wd }, cb.idx); const X0 = Math.max(0, Math.floor(cam.x)), Y0 = Math.max(0, Math.floor(cam.y)), X1 = Math.min(wd.w - 1, Math.ceil(cam.x + W / z)), Y1 = Math.min(wd.h - 1, Math.ceil(cam.y + H / z));
    const lim = Math.log10(1 + 4000); const label = z >= 26;
    if (label) { g.font = `bold ${Math.round(Math.min(13, z * 0.3))}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = 3; }
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
      const c = f[y * wd.w + x]; if (c === 65535 && (wd.tiles[y * wd.w + x] === 'd' || wd.tiles[y * wd.w + x] === 'a')) continue;
      const sx = (x - cam.x) * z, sy = (y - cam.y) * z;
      g.fillStyle = c === 65535 ? 'rgba(0,0,0,.45)' : `hsla(${Math.round(120 * (1 - Math.min(1, Math.log10(1 + c) / lim)))},85%,45%,.55)`; g.fillRect(sx, sy, z, z);
      if (label && c !== 65535) { const t = c >= 1000 ? (c / 1000).toFixed(1) + 'k' : String(c); g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(t, sx + z / 2, sy + z / 2); g.fillStyle = '#fff'; g.fillText(t, sx + z / 2, sy + z / 2); }
    }
    g.fillStyle = 'rgba(20,20,20,.8)'; g.fillRect(8, H - 52, 640, 20); g.fillStyle = '#fff'; g.font = '11px system-ui'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(tr('Transport cost field') + ' · ' + cb.name + ' · ' + tr('rail') + ' ' + HAUL_RAIL + ' · ' + tr('road') + ' ' + HAUL_ROAD + ' · ' + tr('field') + ' ' + HAUL_FIELD + ' · ' + tr('forest') + ' ' + HAUL_FOREST + ' · ' + tr('mountain') + ' ' + HAUL_MOUNTAIN + ' · ' + tr('sea') + ' ' + HAUL_SEA + ' · ' + tr('land↔sea') + ' ' + HAUL_SWITCH, 14, H - 42);
  }
  // ---- ownership overlay: lots and buildings
  const px = (i: number) => ({ x: ((i % wd.w) - cam.x) * z, y: (Math.floor(i / wd.w) - cam.y) * z });
  for (const [k, lot] of show.lots ? Object.entries(v.lots) : []) {
    const { x, y } = px(+k); if (x < -z || y < -z || x > W || y > H) continue;
    g.strokeStyle = companyOf(lot.owner)?.color ?? '#000';
    if (z >= 6) { g.lineWidth = Math.max(1.5, z * 0.1); g.strokeRect(x + 1, y + 1, z - 2, z - 2); } else { g.fillStyle = g.strokeStyle; g.globalAlpha = 0.55; g.fillRect(x, y, Math.max(2, z), Math.max(2, z)); g.globalAlpha = 1; }
  }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const b of [...v.buildings.filter(x => !x.mall), ...v.others]) {
    const { x, y } = px(b.idx); if (x < -z || y < -z || x > W || y > H) continue;
    const col = companyOf(b.owner)?.color ?? '#000'; g.globalAlpha = (b as any).building ? 0.45 : 1;
    if (z >= 8) {
      g.fillStyle = defOf(b).color; g.fillRect(x + z * 0.15, y + z * 0.15, z * 0.7, z * 0.7); g.strokeStyle = col; g.lineWidth = Math.max(2, z * 0.1); g.strokeRect(x + z * 0.15, y + z * 0.15, z * 0.7, z * 0.7);
      if (z >= 12) { g.fillStyle = '#fff'; g.font = `bold ${Math.round(z * 0.5)}px system-ui`; g.fillText(defOf(b).letter, x + z / 2, y + z / 2 + 1); }
    } else { g.fillStyle = col; g.fillRect(x - 1, y - 1, Math.max(4, z * 0.9), Math.max(4, z * 0.9)); }
    g.globalAlpha = 1;
  }
  for (const f of show.forsale ? v.vacant : []) {
    const { x, y } = px(f.idx); if (x < -z || y < -z || x > W || y > H) continue;
    g.setLineDash([3, 2]); g.strokeStyle = '#d4a017'; g.lineWidth = Math.max(2, z * 0.12); g.strokeRect(x + 0.5, y + 0.5, Math.max(5, z) - 1, Math.max(5, z) - 1); g.setLineDash([]);
    if (z >= 8) { g.fillStyle = BUILDINGS[f.type].color; g.globalAlpha = 0.6; g.fillRect(x + z * 0.2, y + z * 0.2, z * 0.6, z * 0.6); g.globalAlpha = 1; }
    if (z >= 12) { g.fillStyle = '#7a5a00'; g.font = `bold ${Math.round(z * 0.4)}px system-ui`; g.fillText(tr('SALE'), x + z / 2, y + z / 2 + 1); }
  }
  // ---- city labels
  g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
  const fs = Math.max(10, Math.min(20, z * 1.0 + 6)); g.font = `bold ${fs}px system-ui`;
  for (const c of show.cities ? v.cities : []) {
    const sx = (c.x / WORLD_SCALE - cam.x), sy = (c.y / WORLD_SCALE - cam.y); const X = sx * z, Y = sy * z - c.radius * z * 0.6;
    if (X < -100 || Y < -40 || X > W + 100 || Y > H + 40) continue;
    const label = (c.port ? '⚓ ' : '') + c.name; g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(label, X, Y); g.fillStyle = c.id === S.city ? '#ffe45c' : '#fff'; g.fillText(label, X, Y);
  }
  // ---- hover / selection
  const mark = (i: number, col: string, lw: number) => { if (i < 0 || z < 6) return; const { x, y } = px(i); g.strokeStyle = col; g.lineWidth = lw; g.strokeRect(x + 1, y + 1, z - 2, z - 2); };
  // pending sealed orders (build / expand / buy a facility for sale): dashed outline until the month is played
  if (z >= 4) for (const o of v.orders) { const a = o.action; const i = a.type === 'build' || a.type === 'buyExpansion' ? a.idx : a.type === 'buyVacant' ? v.vacant.find(x => x.id === a.id)?.idx ?? -1 : -1; if (i < 0) continue;
    const { x, y } = px(i); g.setLineDash([3, 3]); g.strokeStyle = '#ffe45c'; g.lineWidth = 2; g.strokeRect(x + 1.5, y + 1.5, z - 3, z - 3); g.setLineDash([]);
    if (z >= 14) { g.fillStyle = '#ffe45c'; g.font = 'bold ' + Math.round(z * 0.5) + 'px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', x + z / 2, y + z / 2); } }
  // the 5x5 area of effect of the selected tile / building
  const selIdx = S.sel ?? (S.buildingId ? v.buildings.find(b => b.id === S.buildingId)?.idx : undefined);
  const selB = selIdx != null ? [...v.buildings, ...v.others].find(b => b.idx === selIdx && b.type !== 'mall') : undefined;
  if (selIdx != null && z >= 6 && (selB || terrainAt({ world: wd }, selIdx) !== 'd' && terrainAt({ world: wd }, selIdx) !== 'a')) {
    const R = selB ? (selB.type === 'store' ? shopReach(selB as { super?: boolean; mall?: string | null }) : areaR(selB.type)) : AREA_R, x0 = selIdx % wd.w - R, y0 = Math.floor(selIdx / wd.w) - R, n = R * 2 + 1, ax = (x0 - cam.x) * z, ay = (y0 - cam.y) * z;
    g.fillStyle = selB ? 'rgba(255,212,0,.10)' : 'rgba(255,255,255,.08)'; g.fillRect(ax, ay, n * z, n * z); g.setLineDash([6, 4]); g.strokeStyle = selB ? 'rgba(255,212,0,.95)' : 'rgba(255,255,255,.85)'; g.lineWidth = 2; g.strokeRect(ax, ay, n * z, n * z); g.setLineDash([]);
  }
  // transport routes from every chosen source to the selected facility
  const rb = S.showRoutes ? (v.buildings.find(b => b.id === S.buildingId) ?? (S.sel != null ? v.buildings.find(b => b.idx === S.sel) : undefined)) : undefined;
  if (rb && rb.type !== 'mall') {
    const ctx = { cities: v.cities, world: wd }, srcs = new Set<string>();
    Object.values(rb.sources ?? {}).forEach(x => x && srcs.add(x)); rb.slots?.forEach(sl => sl.source && srcs.add(sl.source)); rb.layout?.forEach(c => { if (c.m === 'import' && c.source) srcs.add(c.source); });
    const PAL = ['#ff3b30', '#0a84ff', '#ff9f0a', '#bf5af2', '#30d158', '#ff375f'], C = (i: number) => ({ x: ((i % wd.w) + 0.5 - cam.x) * z, y: (Math.floor(i / wd.w) + 0.5 - cam.y) * z });
    let k = 0; g.lineJoin = 'round'; g.lineCap = 'round';
    for (const src of srcs) {
      let from = -1, label = ''; if (src.startsWith('harbour:')) { const c = v.cities[+src.slice(8)]; if (c) { from = cityTile({ world: wd }, c); label = '⚓ ' + c.name; } }
      else { const o = [...v.buildings, ...v.others].find(o => o.id === src.split('#')[0]); if (o) { from = o.idx; label = o.name; } }
      if (from < 0 || from === rb.idx) continue;
      const col = PAL[k++ % PAL.length], path = haulRoute(ctx, from, rb.idx), pts = (path.length ? path : [from, rb.idx]).map(C);
      for (const [w, c] of [[Math.max(5, z * 0.5), 'rgba(255,255,255,.9)'], [Math.max(3, z * 0.3), col]] as [number, string][]) { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.lineWidth = w; g.strokeStyle = c; g.setLineDash(path.length ? [] : [8, 6]); g.stroke(); }
      g.setLineDash([]); const o = pts[0], d = pts[pts.length - 1];
      g.beginPath(); g.arc(o.x, o.y, Math.max(4, z * 0.35), 0, Math.PI * 2); g.fillStyle = col; g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
      g.beginPath(); g.arc(d.x, d.y, Math.max(3, z * 0.25), 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.strokeStyle = col; g.stroke();
      const txt = label + ' → ' + num(haulPath(ctx, from, rb.idx)); g.font = 'bold 12px system-ui'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(txt, o.x + 9, o.y - 10); g.fillStyle = '#fff'; g.fillText(txt, o.x + 9, o.y - 10);
    }
  }
  mark(hoverIdx, 'rgba(255,255,255,.95)', 2); mark(S.sel ?? -1, '#ffd400', 3);
}
