// Writes products.html: a static page listing every product with its atlas cell, so the atlas slots are easy to identify.  Run: npm run productsdoc
import { writeFileSync } from 'node:fs';
import { ATLAS, ATLAS_ORDER, NAME_ONLY, PRODUCTS, type ProductId } from '../shared/data.js';

const DESC: Record<ProductId, string> = {
  grain: 'Cereal harvested on farmland. The base of bread and pastry.', corn: 'Corn grown on farms; refined into sugar.', canned: 'Long-lasting tinned food made from vegetables and livestock.', vegetables: 'Fresh vegetables grown on farms. They spoil fast, so sell or ship them quickly.', cotton: 'Fibre crop grown on farms, spun into fabric.',
  livestock: 'Cattle and poultry raised on farms; feeds dairy and meat processing.', timber: 'Logs from forests. Used for furniture, buildings and spirits.', ore: 'Iron ore dug from the hills, smelted into steel.',
  copper: 'Copper ore from mines, a key input of components.', stone: 'Quarried stone, the basis of construction materials.', rare: 'Rare ores from mountain mines, needed by high-tech goods.',
  oil: 'Crude oil pumped from oil fields: fuel, plastics and chemicals start here.', steel: 'Smelted iron. Goes into components, machinery, cars and appliances.', components: 'Mechanical and electrical parts made from steel and copper.',
  cmaterials: 'Cement, bricks and beams for the building industry.', chemicals: 'Industrial chemicals refined from oil; used in cleaning, pharmaceuticals and food.', sugar: 'Refined from corn. Sweetens pastry, drinks and processed food.',
  fabric: 'Woven cotton, the raw material of clothing and shoes.', plastics: 'Moulded polymers made from oil, used in many consumer goods.', electronics: 'Circuit boards and chips for computers, phones and TVs.',
  bread: 'Daily staple baked from grain.', dairy: 'Milk, cheese and yoghurt from livestock.', pastry: 'Cakes and cookies: dairy, grain and sugar.',
  beverages: 'Soft drinks and juices: sugar plus fruit.', fruits: 'Fruit from farm orchards. It spoils fast; beverages need it.', alcohol: 'Wine and spirits made from sugar and timber (barrels).', ultrafood: 'Cheap, long-lasting industrial food: dairy, chemicals, meat and sugar.',
  meat: 'Packaged meat from livestock.', furniture: 'Tables, chairs and beds made of timber.', fuel: 'Refined petrol and diesel for households and cars.',
  clothing: 'Garments sewn from fabric.', appliances: 'Fridges, washing machines and ovens.', computers: 'Hi-tech home computers; must be researched first.',
  machinery: 'Heavy industrial machinery built from steel, chemicals, plastics and components.', buildings: 'Prefabricated buildings for sale to households.', hygiene: 'Soap, shampoo and toiletries.',
  cleaning: 'Detergents and household cleaners.', shoes: 'Footwear from fabric and plastics.', cars: 'Hi-tech automobiles; must be researched first.',
  phones: 'Hi-tech mobile phones.', tvs: 'Hi-tech televisions.', pharma: 'Hi-tech medicines: oil, plastics, chemicals and machinery.', robotics: 'Hi-tech robots that automate factories.',
};
const kind = { raw: 'Raw material', intermediate: 'Intermediate good', consumer: 'Consumer good' } as const;
const { cols, rows, cellW, cellH, file } = ATLAS;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const cell = (i: number, id?: ProductId) => {
  const c = i % cols, r = Math.floor(i / cols); const p = id && PRODUCTS[id];
  const body = p ? `<h3>${esc(p.name)}</h3><div class="tag">${kind[p.kind]}${p.research ? ' · hi-tech' : ''} · ${!NAME_ONLY.includes(id!) ? 'has picture' : 'name cell'}</div><p>${esc(DESC[id!] ?? '')}</p>`
    + `<p class="f">${Object.keys(p.recipe).length ? 'Made from: ' + Object.entries(p.recipe).map(([k, q]) => `${q} × ${PRODUCTS[k as ProductId].name}`).join(', ') : 'Extracted from the land.'}<br>Base price $${p.basePrice} per ${p.unit} · id <code>${id}</code></p>` : '<p class="free">free slot</p>';
  return `<section class="${p ? '' : 'empty'}"><div class="img" style="background-position:-${c * cellW}px -${r * cellH}px"></div><div class="txt"><div class="slot">Slot ${i} · col ${c + 1}, row ${r + 1}</div>${body}</div></section>`;
};
const total = cols * rows;
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Product atlas</title><style>
body{font:14px/1.4 system-ui,sans-serif;background:#eeeee8;color:#1d2330;margin:20px}h1{margin:0 0 4px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(480px,1fr));gap:10px;margin-top:14px}
section{display:flex;gap:10px;background:#fff;border:1px solid #b9b9b0;padding:8px}section.empty{opacity:.5}
.img{flex:none;width:${cellW}px;height:${cellH}px;background:#e4e0d0 url(client/public/assets/${file}) no-repeat;border:1px solid #8a8470;box-sizing:content-box}
h3{margin:0}.slot{font-size:11px;color:#6b7280}.tag{font-size:12px;color:#1f4e8c}p{margin:4px 0}.f{font-size:12px;color:#555}.free{font-style:italic;color:#777}
</style></head><body><h1>Product atlas</h1><div>${ATLAS_ORDER.length} products in ${total} slots (${cols} × ${rows} cells of ${cellW}×${cellH}px, no padding), ${total - ATLAS_ORDER.length} free. Image: <code>${file}</code>. Generated by <code>npm run productsdoc</code>.</div>
<div class="grid">${Array.from({ length: total }, (_, i) => cell(i, ATLAS_ORDER[i])).join('\n')}</div></body></html>`;
writeFileSync(new URL('../products.html', import.meta.url), html);
console.log('products.html written');
