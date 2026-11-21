// Encyclopedia: every product as a node, with an arrow from each ingredient to what it is made into. Click a product for details.
import { PRODUCTS, PRODUCT_LIST, type ProductId } from '../../shared/data.js';
import { isUnlocked, canResearch, researchOf } from '../../shared/engine.js';
import { h, money2, num, asset } from './util.js';
import { S } from './state.js';

const NW = 150, NH = 46, COLW = 215, ROWH = 62, PAD = 16;
const KCOL = { raw: '#8a6d3b', intermediate: '#3b7bbf', consumer: '#3f8f4f' } as const;
let sel: ProductId = 'cars';

export function encyclopediaScreen(): HTMLElement {
  const v = S.view!; const me = v.me;
  const pos = new Map<ProductId, { x: number; y: number }>(); const cols = new Map<number, ProductId[]>();
  for (const p of PRODUCT_LIST) { if (!cols.has(p.depth)) cols.set(p.depth, []); cols.get(p.depth)!.push(p.id); }
  let rows = 1;
  // order each column by the average row of its ingredients to keep the arrows tidy
  for (const d of [...cols.keys()].sort((a, b) => a - b)) {
    const list = cols.get(d)!;
    const key = (id: ProductId) => { const ys = Object.keys(PRODUCTS[id].recipe).map(k => pos.get(k as ProductId)?.y ?? 0); return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0; };
    list.sort((a, b) => key(a) - key(b) || PRODUCTS[a].kind.localeCompare(PRODUCTS[b].kind) || PRODUCTS[a].name.localeCompare(PRODUCTS[b].name));
    list.forEach((id, i) => pos.set(id, { x: PAD + d * COLW, y: PAD + i * ROWH })); rows = Math.max(rows, list.length);
  }
  const W = PAD * 2 + (Math.max(...cols.keys())) * COLW + NW, H = PAD * 2 + rows * ROWH;
  const cv = h('canvas', { width: W, height: H, style: 'display:block;background:#efece0;cursor:pointer' }); const g = cv.getContext('2d')!;
  const rel = (p: ProductId) => { const set = new Set<ProductId>([p]); const up = (x: ProductId) => { for (const k of Object.keys(PRODUCTS[x].recipe) as ProductId[]) if (!set.has(k)) { set.add(k); up(k); } }; up(p); for (const q of PRODUCT_LIST) if (set.has(p) && PRODUCTS[q.id].recipe[p]) set.add(q.id); return set; };
  const draw = () => {
    g.clearRect(0, 0, W, H); g.fillStyle = '#efece0'; g.fillRect(0, 0, W, H);
    const on = rel(sel); g.textBaseline = 'middle';
    for (const pass of [0, 1]) for (const p of PRODUCT_LIST) for (const [k, q] of Object.entries(p.recipe)) {
      const hot = p.id === sel || k === sel || (on.has(p.id) && on.has(k as ProductId) && (isAncestor(k as ProductId, sel) || isAncestor(p.id, sel))); if ((pass === 1) !== hot) continue;
      const a = pos.get(k as ProductId)!, b = pos.get(p.id)!; const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2, dx = Math.max(30, (x2 - x1) / 2);
      g.globalAlpha = hot ? 1 : 0.35; g.strokeStyle = hot ? '#c0392b' : '#6d6a5b'; g.lineWidth = hot ? 2.5 : 1.2;
      g.beginPath(); g.moveTo(x1, y1); g.bezierCurveTo(x1 + dx, y1, x2 - dx, y2, x2, y2); g.stroke();
      g.fillStyle = g.strokeStyle; g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - 9, y2 - 5); g.lineTo(x2 - 9, y2 + 5); g.fill();
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2; g.font = 'bold 10px system-ui'; g.textAlign = 'center'; const t = '×' + q; const tw = g.measureText(t).width;
      g.fillStyle = '#efece0'; g.fillRect(mx - tw / 2 - 2, my - 7, tw + 4, 14); g.fillStyle = hot ? '#c0392b' : '#555'; g.fillText(t, mx, my); g.globalAlpha = 1;
    }
    for (const p of PRODUCT_LIST) {
      const { x, y } = pos.get(p.id)!, lock = !isUnlocked(me, p.id); g.globalAlpha = on.has(p.id) ? 1 : 0.45;
      g.fillStyle = lock ? '#e4dfcf' : '#fbfaf3'; g.fillRect(x, y, NW, NH); g.fillStyle = KCOL[p.kind]; g.fillRect(x, y, 8, NH);
      g.strokeStyle = p.id === sel ? '#ffb000' : '#8a8470'; g.lineWidth = p.id === sel ? 3 : 1; g.strokeRect(x + .5, y + .5, NW - 1, NH - 1);
      g.textAlign = 'left'; g.fillStyle = lock ? '#777' : '#222'; g.font = 'bold 12px system-ui'; g.fillText((lock ? '🔒 ' : '') + p.name, x + 14, y + 16, NW - 20);
      g.fillStyle = '#666'; g.font = '10px system-ui'; g.fillText(p.kind + (p.research ? ' · hi-tech' : '') + ' · ' + money2(p.basePrice), x + 14, y + 32, NW - 20); g.globalAlpha = 1;
    }
  };
  const isAncestor = (a: ProductId, of: ProductId): boolean => a !== of && (!!PRODUCTS[of].recipe[a] || Object.keys(PRODUCTS[of].recipe).some(k => isAncestor(a, k as ProductId)));
  const detail = h('div', { class: 'panel', style: 'min-width:280px;max-width:340px;align-self:flex-start' });
  const showDetail = () => {
    const p = PRODUCTS[sel]; const lock = !isUnlocked(me, sel); const usedIn = PRODUCT_LIST.filter(q => q.recipe[sel]);
    const mkr = new Set<string>(); for (const o of v.listings) if (o.product === sel) mkr.add(o.company);
    detail.replaceChildren(h('h2', null, p.name), h('img', { src: asset(p.photo), style: 'width:100%;height:120px;object-fit:cover;border:2px inset #8a8470' }),
      h('div', { class: 'kv2', style: 'margin-top:6px;grid-template-columns:auto 1fr' },
        h('label', null, 'Type'), h('div', null, p.kind === 'raw' ? 'raw material' : p.kind === 'intermediate' ? 'intermediate good' : 'consumer good'),
        h('label', null, 'Made from'), h('div', null, Object.keys(p.recipe).length ? Object.entries(p.recipe).map(([k, q]) => h('div', null, q + ' × ', h('a', { href: '#', onclick: (e: Event) => { e.preventDefault(); sel = k as ProductId; draw(); showDetail(); } }, PRODUCTS[k as ProductId].name))) : 'extracted from the land (farm, forest, mine or oil well)'),
        h('label', null, 'Used in'), h('div', null, usedIn.length ? usedIn.map(q => h('div', null, h('a', { href: '#', onclick: (e: Event) => { e.preventDefault(); sel = q.id; draw(); showDetail(); } }, q.name))) : 'nothing (final product)'),
        h('label', null, 'Reference price'), h('div', null, money2(p.basePrice * v.market[sel].idx) + ' per ' + p.unit + ' (base ' + money2(p.basePrice) + ')'),
        h('label', null, 'Per line'), h('div', null, num(p.cap) + ' ' + p.unit + ' / month · ' + p.workers + ' workers'),
        h('label', null, 'Spoilage'), h('div', null, Math.round(p.spoil * 100) + '% / month'),
        p.kind === 'consumer' ? h('label', null, 'Demand') : null, p.kind === 'consumer' ? h('div', null, p.demandPerK + ' per 1000 people / month') : null,
        h('label', null, 'Your tech'), h('div', null, me.tech[sel].toFixed(0) + ' / 100'),
        p.research ? h('label', null, 'Hi-tech') : null,
        p.research ? h('div', null, lock ? h('div', { class: 'bad' }, '🔒 Locked: ' + Math.round(researchOf(me, sel)) + ' / ' + p.research + ' research points' + (p.after && !canResearch(me, sel) ? ' · needs ' + PRODUCTS[p.after].name + ' first' : ''))
          : h('div', { class: 'good' }, '✓ Unlocked'), lock ? h('div', { class: 'note' }, 'Build an R&D building and set it to research ' + p.name + '.') : null) : null));
  };
  cv.addEventListener('click', e => {
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
    const hit = PRODUCT_LIST.find(p => { const q = pos.get(p.id)!; return x >= q.x && x <= q.x + NW && y >= q.y && y <= q.y + NH; });
    if (hit) { sel = hit.id; draw(); showDetail(); }
  });
  draw(); showDetail();
  return h('div', { class: 'col' }, h('div', { class: 'panel' }, h('h2', null, 'Encyclopedia'),
    h('div', { class: 'note' }, 'Every product and what it is made from: arrows run from an ingredient to the product made with it (×N = units per unit made). Click a product to highlight its supply tree and read its details. 🔒 hi-tech products must be researched in an R&D building before you can manufacture them.'),
    h('div', { class: 'row', style: 'align-items:flex-start;gap:12px' }, h('div', { style: 'overflow:auto;border:2px inset #8a8470;background:#efece0;max-height:calc(100vh - 250px);flex:1;min-width:0' }, cv), detail)));
}
