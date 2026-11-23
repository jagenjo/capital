// Product pictures come from one image, the atlas (shared/data.ts ATLAS): a grid of equal cells, one per product.
// Products with a photo are cropped to fill the box; the others show their framed name cell, stretched to the box.
import { ATLAS, ATLAS_ORDER, NAME_ONLY, PRODUCTS, PORTRAIT_ATLAS, FACILITY_ATLAS, FACILITY_ORDER, FACILITY_NAME_ONLY, BUILDINGS, TERRAIN_ATLAS, TERRAIN_ORDER, TERRAIN_NAME_ONLY, TERRAIN_INFO, type Terrain, type BuildingType, type ProductId } from '../../shared/data.js';
import { h, asset } from './util.js';

export const hasPhoto = (id: ProductId) => !!PRODUCTS[id] && !NAME_ONLY.includes(id);
/** Cuts cell `slot` out of an atlas as a w×h picture. Real pictures keep their proportions (cover); name cells fill the box. */
function atlasImg(A: { cols: number; rows: number; cellW: number; cellH: number; file: string }, slot: number, photo: boolean, w: number, hgt: number, style: string, title: string): HTMLElement {
  const { cols, rows, cellW, cellH } = A;
  const box = h('span', { class: 'pimg', title, style: `display:inline-block;position:relative;overflow:hidden;flex:none;vertical-align:middle;width:${w}px;height:${hgt}px;background:#e4e0d0;${style}` });
  if (slot < 0) return box;
  const col = slot % cols, row = Math.floor(slot / cols);
  const sx = photo ? Math.max(w / cellW, hgt / cellH) : w / cellW, sy = photo ? sx : hgt / cellH;
  const iw = cellW * sx, ih = cellH * sy;
  box.append(h('span', { style: `position:absolute;left:${(w - iw) / 2}px;top:${(hgt - ih) / 2}px;width:${iw}px;height:${ih}px;background:url(${asset(A.file)}) -${col * iw}px -${row * ih}px / ${cols * iw}px ${rows * ih}px no-repeat` }));
  return box;
}
/** A w×h picture of a product, cut out of the atlas. `style` adds CSS to the frame (border, margin...). */
export const prodImg = (id: ProductId, w: number, hgt: number, style = '', title?: string) => atlasImg(ATLAS, ATLAS_ORDER.indexOf(id), hasPhoto(id), w, hgt, style, title ?? PRODUCTS[id]?.name);
export const hasFacPhoto = (t: BuildingType) => !FACILITY_NAME_ONLY.includes(t);
/** A w×h picture of a facility type, cut out of the facility atlas. */
export const facImg = (t: BuildingType, w: number, hgt: number, style = '', title?: string) => atlasImg(FACILITY_ATLAS, FACILITY_ORDER.indexOf(t), hasFacPhoto(t), w, hgt, style, title ?? BUILDINGS[t].name);
/** A w×h picture of a tile type (grassland, downtown, town...), cut out of the terrain atlas. */
export const terrImg = (t: Terrain, w: number, hgt: number, style = '', title?: string) => atlasImg(TERRAIN_ATLAS, TERRAIN_ORDER.indexOf(t), !TERRAIN_NAME_ONLY.includes(t), w, hgt, style, title ?? TERRAIN_INFO[t].name);
/** A person's portrait, cut out of the people atlas: portrait `n` as a `size` x `size` square. `style` adds CSS (border...), `cls` a class. */
export function personImg(n: number, size: number, style = '', cls = ''): HTMLElement {
  const { cols, rows, cell, file } = PORTRAIT_ATLAS; const i = Math.max(0, Math.floor(n)), col = i % cols, row = Math.floor(i / cols); const k = size / cell;
  return h('span', { class: 'pimg portrait-img ' + cls, style: `display:inline-block;flex:none;width:${size}px;height:${size}px;box-sizing:content-box;background:url(${asset(file)}) -${col * size}px -${row * size}px / ${cols * size}px ${rows * size}px no-repeat;image-rendering:pixelated;vertical-align:middle;${style}` });
}
