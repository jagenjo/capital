// "Supply chain" tab: every production line, farm, mine and shop of yours as a node, with a link wherever a good flows from a source to a user.
import { PRODUCTS, BUILDINGS, type ProductId } from '../../shared/data.js';
import { adj8, isLinked } from '../../shared/engine.js';
import type { Building } from '../../shared/types.js';
import { h, num } from './util.js';
import { S, companyOf } from './state.js';
import { focusTile } from './worldmap.js';

type Kind = 'harbour' | 'ext' | 'bld' | 'line' | 'store';
interface N { id: string; kind: Kind; label: string; sub: string; color: string; product?: ProductId; b?: Building; rank: number; x: number; y: number; missing: string[] }
interface E { from: string; to: string; product: ProductId }
const NW = 156, NH = 60, COLW = 230, ROWH = 76, PADX = 16, PADY = 16;

function graph() {
  const v = S.view!; const nodes = new Map<string, N>(); const edges: E[] = [];
  const add = (n: Omit<N, 'rank' | 'x' | 'y' | 'missing'>) => { if (!nodes.has(n.id)) nodes.set(n.id, { ...n, rank: 0, x: 0, y: 0, missing: [] }); return nodes.get(n.id)!; };
  const city = (c: number) => v.cities[c].name;
  // 1) your nodes
  for (const b of v.buildings) {
    if (b.type === 'rd') continue;
    if (b.type === 'store') add({ id: 'b:' + b.id, kind: 'store', label: b.name, sub: 'shop · ' + city(b.city), color: BUILDINGS.store.color, b });
    else if (b.type === 'factory' && b.layout) b.layout.forEach((c, i) => { if (c.m === 'line' && c.product) add({ id: 'l:' + b.id + ':' + i, kind: 'line', label: PRODUCTS[c.product].name, sub: b.name + ' · line #' + (i + 1), color: BUILDINGS.factory.color, product: c.product, b }); });
    else add({ id: 'b:' + b.id, kind: 'bld', label: PRODUCTS[b.product!]?.name ?? b.name, sub: b.name, color: BUILDINGS[b.type].color, product: b.product ?? undefined, b });
  }
  const lineOf = (b: Building, p: ProductId, near?: number): string | null => {
    if (!b.layout) return null; let first: number | null = null;
    for (let i = 0; i < b.layout.length; i++) if (b.layout[i].m === 'line' && b.layout[i].product === p) { if (first == null) first = i; if (near != null && adj8(near).includes(i) && isLinked(b, near, i)) return 'l:' + b.id + ':' + i; }
    return first == null ? null : 'l:' + b.id + ':' + first;
  };
  // 2) resolve a source string to a node id (creating harbour / foreign nodes on demand)
  const resolve = (src: string, p: ProductId): string | null => {
    if (!src) return null;
    if (src.startsWith('harbour:')) { const c = +src.slice(8); return add({ id: 'h:' + c, kind: 'harbour', label: '⚓ ' + city(c), sub: 'harbour import', color: '#3b7bbf' }).id; }
    const [bid, ci] = src.split('#'); const mine = v.buildings.find(x => x.id === bid);
    if (mine) { if (mine.type === 'factory') { const ex = ci !== undefined ? mine.layout?.[+ci] : undefined; return lineOf(mine, ex?.product ?? p) ?? null; } return 'b:' + mine.id; }
    const o = v.others.find(x => x.id === bid); const co = o ? companyOf(o.owner) : null;
    return add({ id: 'x:' + src, kind: 'ext', label: o ? o.name : 'Supplier', sub: co ? co.name : 'other company', color: co?.color ?? '#888' }).id;
  };
  const link = (src: string, to: string, p: ProductId) => { const f = resolve(src, p); if (f && f !== to) edges.push({ from: f, to, product: p }); };
  // 3) links
  for (const b of v.buildings) {
    if (b.type === 'store') { for (const sl of b.slots) if (sl.product && sl.source) link(sl.source, 'b:' + b.id, sl.product); }
    else if (b.type === 'factory' && b.layout) {
      const L = b.layout;
      L.forEach((c, i) => {
        if (c.m === 'import' && c.product && c.source) for (const j of adj8(i)) if (isLinked(b, i, j) && L[j].m === 'line') link(c.source, 'l:' + b.id + ':' + j, c.product);
        if (c.m === 'line' && c.product) for (const j of adj8(i)) if (j > i && isLinked(b, i, j) && L[j].m === 'line' && L[j].product) {
          if (PRODUCTS[L[j].product!].recipe[c.product]) edges.push({ from: 'l:' + b.id + ':' + i, to: 'l:' + b.id + ':' + j, product: c.product });
          else if (PRODUCTS[c.product].recipe[L[j].product!]) edges.push({ from: 'l:' + b.id + ':' + j, to: 'l:' + b.id + ':' + i, product: L[j].product! });
        }
      });
    } else if (b.type !== 'rd') for (const [p, src] of Object.entries(b.sources)) if (src) link(src, 'b:' + b.id, p as ProductId);
  }
  // 4) inputs nobody supplies
  for (const n of nodes.values()) if (n.product && n.b && (n.kind === 'line' || n.kind === 'bld')) for (const Y of Object.keys(PRODUCTS[n.product].recipe) as ProductId[]) if (!edges.some(e => e.to === n.id && e.product === Y)) n.missing.push(PRODUCTS[Y].name);
  // 5) rank = longest chain behind the node; stack the nodes of each rank
  const ns = [...nodes.values()];
  for (let it = 0; it < ns.length + 1; it++) { let ch = false; for (const e of edges) { const f = nodes.get(e.from)!, t = nodes.get(e.to)!; if (t.rank < f.rank + 1 && f.rank < ns.length) { t.rank = f.rank + 1; ch = true; } } if (!ch) break; }
  const cols = new Map<number, N[]>(); for (const n of ns) { if (!cols.has(n.rank)) cols.set(n.rank, []); cols.get(n.rank)!.push(n); }
  let rows = 1; for (const [r, list] of cols) { list.sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label)); list.forEach((n, i) => { n.x = PADX + r * COLW; n.y = PADY + i * ROWH; }); rows = Math.max(rows, list.length); }
  return { ns, edges, nodes, w: PADX * 2 + (Math.max(0, ...[...cols.keys()]) ) * COLW + NW, h: PADY * 2 + rows * ROWH };
}

const palette = ['#c0392b', '#2471a3', '#1e8449', '#b9770e', '#7d3c98', '#117a65', '#a04000', '#34495e', '#af7ac5', '#5d6d7e'];
const pcol = (p: ProductId) => palette[[...p].reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length];

export function chainScreen(): HTMLElement {
  const v = S.view!;
  if (!v.buildings.length) return h('div', { class: 'panel' }, 'You have no buildings yet. Build something on the Map tab and its supply chain shows up here.');
  const gr = graph(); const W = Math.max(600, gr.w), H = Math.max(240, gr.h);
  const cv = h('canvas', { width: W, height: H, style: 'display:block;background:#efece0;cursor:pointer' });
  const g = cv.getContext('2d')!; let hov = '';
  const draw = () => {
    g.clearRect(0, 0, W, H); g.fillStyle = '#efece0'; g.fillRect(0, 0, W, H);
    const hot = (e: E) => hov && (e.from === hov || e.to === hov);
    for (const pass of [0, 1]) for (const e of gr.edges) {
      if ((pass === 1) !== !!hot(e)) continue; const f = gr.nodes.get(e.from)!, t = gr.nodes.get(e.to)!;
      const x1 = f.x + NW, y1 = f.y + NH / 2, x2 = t.x, y2 = t.y + NH / 2, dx = Math.max(40, Math.abs(x2 - x1) / 2);
      g.strokeStyle = pcol(e.product); g.globalAlpha = hov && !hot(e) ? 0.15 : 0.9; g.lineWidth = hot(e) ? 3 : 2;
      g.beginPath(); g.moveTo(x1, y1); g.bezierCurveTo(x1 + dx, y1, x2 - dx, y2, x2, y2); g.stroke();
      g.fillStyle = g.strokeStyle; g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - 9, y2 - 5); g.lineTo(x2 - 9, y2 + 5); g.fill();
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2; g.font = '10px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; const label = PRODUCTS[e.product].name; const tw = g.measureText(label).width;
      g.fillStyle = '#efece0'; g.fillRect(mx - tw / 2 - 3, my - 7, tw + 6, 14); g.fillStyle = pcol(e.product); g.fillText(label, mx, my); g.globalAlpha = 1;
    }
    for (const n of gr.ns) {
      const dim = hov && hov !== n.id && !gr.edges.some(e => (e.from === hov && e.to === n.id) || (e.to === hov && e.from === n.id));
      g.globalAlpha = dim ? 0.35 : 1; g.fillStyle = '#fbfaf3'; g.fillRect(n.x, n.y, NW, NH); g.fillStyle = n.color; g.fillRect(n.x, n.y, 8, NH);
      g.strokeStyle = n.id === hov ? '#ffb000' : n.b && n.b.idx === S.sel ? '#1f4e8c' : '#8a8470'; g.lineWidth = n.id === hov || (n.b && n.b.idx === S.sel) ? 3 : 1; g.strokeRect(n.x + .5, n.y + .5, NW - 1, NH - 1);
      g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = '#222'; g.font = 'bold 12px system-ui'; g.fillText(n.label, n.x + 14, n.y + 17, NW - 20);
      g.fillStyle = '#666'; g.font = '10px system-ui'; g.fillText(n.sub, n.x + 14, n.y + 30, NW - 20);
      if (n.b && n.kind !== 'store' && n.kind !== 'harbour') { const fin = n.kind === 'bld' || n.product === n.b.product; if (fin) { g.fillStyle = '#444'; g.fillText('stock ' + num(n.b.stock.qty), n.x + 14, n.y + 42, NW - 20); } }
      if (n.missing.length) { g.fillStyle = '#b3261e'; g.font = 'bold 10px system-ui'; g.fillText('⚠ no ' + n.missing.join(', '), n.x + 14, n.y + 54, NW - 20); }
      g.globalAlpha = 1;
    }
  };
  draw();
  const at = (e: MouseEvent) => { const r = cv.getBoundingClientRect(); const x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height; return gr.ns.find(n => x >= n.x && x <= n.x + NW && y >= n.y && y <= n.y + NH); };
  cv.addEventListener('mousemove', e => { const n = at(e); const id = n?.id ?? ''; if (id !== hov) { hov = id; draw(); } });
  cv.addEventListener('mouseleave', () => { hov = ''; draw(); });
  cv.addEventListener('click', e => { const n = at(e); if (n?.b) { S.city = n.b.city; S.sel = n.b.idx; S.buildingId = n.b.id; S.tab = 'map'; focusTile(n.b.idx, 14); S.render(); } });
  const unsupplied = gr.ns.filter(n => n.missing.length);
  return h('div', { class: 'col' }, h('div', { class: 'panel' }, h('h2', null, 'Supply chain'),
    h('div', { class: 'note' }, 'Nodes: your production lines (factories, one per line), farms, mines and shops, plus the harbours and other companies you buy from. A link means goods flow from the source to the user along that connection. Hover to highlight a node\'s links, click a node to open its building.'),
    unsupplied.length ? h('div', { class: 'bad small' }, unsupplied.map(n => h('div', null, '⚠ ' + n.sub + ' · ' + n.label + ': no supply of ' + n.missing.join(', ')))) : h('div', { class: 'good small' }, '✓ Every input has a source.'),
    h('div', { style: 'overflow:auto;border:2px inset #8a8470;background:#efece0;max-height:calc(100vh - 260px)' }, cv)));
}
