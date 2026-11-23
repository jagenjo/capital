// Builds a picture atlas: `npm run atlas -- [products|facilities|terrain] [--force]`. Slots follow ATLAS_ORDER / FACILITY_ORDER in shared/data.ts: new entries go at the END.
// The atlases are hand-edited art once they exist, so an existing image is only overwritten with --force.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { ATLAS, ATLAS_ORDER, PRODUCTS, PRODUCT_LIST, FACILITY_ATLAS, FACILITY_ORDER, FACILITY_NAME_ONLY, BUILDINGS, TERRAIN_ATLAS, TERRAIN_ORDER, TERRAIN_NAME_ONLY, TERRAIN_INFO, TERRAIN_PHOTO } from '../shared/data.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), ASSETS = path.join(ROOT, 'client', 'public', 'assets');
const fac = process.argv.includes('facilities'), ter = process.argv.includes('terrain');
const A = ter ? TERRAIN_ATLAS : fac ? FACILITY_ATLAS : ATLAS; const order: string[] = ter ? TERRAIN_ORDER : fac ? FACILITY_ORDER : ATLAS_ORDER;
const out = path.join(ASSETS, A.file);
if (fs.existsSync(out) && !process.argv.includes('--force')) throw new Error(`${A.file} exists and may be hand-made art; run with --force to overwrite it.`);
const all = ter ? Object.keys(TERRAIN_INFO) : fac ? Object.keys(BUILDINGS) : PRODUCT_LIST.map(p => p.id);
const missing = all.filter(id => !order.includes(id)); if (missing.length) throw new Error('Add to the order list: ' + missing.join(', '));
const dup = order.filter((id, i) => order.indexOf(id) !== i); if (dup.length) throw new Error('Duplicate in the order list: ' + dup.join(', '));
if (order.length > A.cols * A.rows) throw new Error(`The atlas is full (${A.cols * A.rows} slots): make rows bigger`);
const items = order.map(id => ter ? { id, name: TERRAIN_INFO[id as keyof typeof TERRAIN_INFO].name, photo: TERRAIN_NAME_ONLY.includes(id as never) ? null : 'pict/' + TERRAIN_PHOTO[id as keyof typeof TERRAIN_PHOTO] } : fac ? { id, name: BUILDINGS[id as keyof typeof BUILDINGS].name, photo: FACILITY_NAME_ONLY.includes(id as never) ? null : BUILDINGS[id as keyof typeof BUILDINGS].photo }
  : { id, name: PRODUCTS[id as keyof typeof PRODUCTS].name, photo: PRODUCTS[id as keyof typeof PRODUCTS].photo ?? null });
for (const p of items) if (p.photo && !fs.existsSync(path.join(ASSETS, p.photo))) throw new Error(`${p.id}: picture ${p.photo} not found`);
const tmp = path.join(ROOT, 'data', 'atlas-manifest.json'); fs.mkdirSync(path.dirname(tmp), { recursive: true });
fs.writeFileSync(tmp, JSON.stringify({ ...A, assets: ASSETS, products: items }));
fs.mkdirSync(path.dirname(out), { recursive: true });
console.log(execFileSync('python3', [path.join(ROOT, 'tools', 'atlas.py'), tmp, out], { encoding: 'utf8' }).trim());
fs.unlinkSync(tmp);
console.log('with a picture:', items.filter(p => p.photo).map(p => p.id).join(', '));
console.log('framed name only:', items.filter(p => !p.photo).map(p => p.id).join(', '));
console.log('wrote', path.relative(ROOT, out));
