// Contracts drawn as paper documents: title, date, numbered clauses and two signatures (yours and the other party's).
// Every party has its own handwritten-looking signature, generated from a seed (its id) so it never changes.
import { MONTH_NAMES } from '../../shared/data.js';
import { h } from './util.js';
import { S } from './state.js';

type Kid = Node | string | number | null | undefined | false;
export interface Party { name: string; seed: string; signed: boolean; role?: Kid; roleText?: string; nameField?: Kid } // nameField: shown instead of the name in the heading (e.g. a dropdown while drafting)

const SVG = 'http://www.w3.org/2000/svg';
function rng(seed: string) {
  let x = 2166136261; for (let i = 0; i < seed.length; i++) x = Math.imul(x ^ seed.charCodeAt(i), 16777619);
  return () => { x = Math.imul(x ^ (x >>> 15), 2246822507); x = Math.imul(x ^ (x >>> 13), 3266489909); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
}
/** Smooth path through the points (Catmull-Rom turned into cubic Béziers). */
function smooth(p: [number, number][]): string {
  let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[Math.max(0, i - 1)], b = p[i], c = p[i + 1], e = p[Math.min(p.length - 1, i + 2)];
    d += ` C${(b[0] + (c[0] - a[0]) / 6).toFixed(1)},${(b[1] + (c[1] - a[1]) / 6).toFixed(1)} ${(c[0] - (e[0] - b[0]) / 6).toFixed(1)},${(c[1] - (e[1] - b[1]) / 6).toFixed(1)} ${c[0].toFixed(1)},${c[1].toFixed(1)}`;
  }
  return d;
}
const cache = new Map<string, string[]>();
/** Paths of the signature for this seed: one or two scribbled "words" plus, sometimes, an underline flourish. */
function sigPaths(seed: string): string[] {
  const got = cache.get(seed); if (got) return got;
  const r = rng(seed); const base = 34; const out: string[] = [];
  let x = 6 + r() * 6; const words = r() < 0.6 ? 2 : 1;
  for (let w = 0; w < words; w++) {
    const pts: [number, number][] = [[x, base + 2 - r() * 4]];
    // capital letter: a tall loop
    const capH = 20 + r() * 10; pts.push([x + 3 + r() * 3, base - capH], [x - 1 + r() * 3, base - capH * 0.4], [x + 6 + r() * 4, base - capH * 0.7]);
    x += 9 + r() * 4;
    const letters = (w ? 4 : 2) + Math.floor(r() * 4);
    for (let i = 0; i < letters; i++) {
      const tall = r() < 0.22, deep = !tall && r() < 0.15;
      const top = base - (tall ? 16 + r() * 9 : 6 + r() * 6);
      pts.push([x + 2 + r() * 2, top]);
      if (tall || r() < 0.35) pts.push([x - 1 + r() * 2, top + (base - top) * 0.5]); // loop back
      pts.push([x + 4 + r() * 3, deep ? base + 9 + r() * 6 : base - r() * 2]);
      x += 6 + r() * 6;
    }
    pts.push([x + 3, base - 4 - r() * 6]);
    out.push(smooth(pts));
    x += 10 + r() * 8;
  }
  if (r() < 0.65) { // flourish under the name
    const y = base + 6 + r() * 5, x0 = 4 + r() * 12;
    out.push(smooth([[x0, y + 3], [x0 + (x - x0) * 0.35, y - 2 + r() * 4], [x - 6, y + r() * 3], [x + 4, y - 6 - r() * 6]]));
  }
  if (r() < 0.4) out.push(`M${(x - 14 - r() * 20).toFixed(1)},${(base - 18 - r() * 6).toFixed(1)} l2,1`); // a dot over an i
  cache.set(seed, out); return out;
}
export function signature(seed: string): SVGElement {
  const svg = document.createElementNS(SVG, 'svg'); svg.setAttribute('viewBox', '0 0 180 56'); svg.setAttribute('class', 'sig');
  const g = document.createElementNS(SVG, 'g'); const r = rng(seed + '#');
  g.setAttribute('transform', `skewX(${(-12 - r() * 14).toFixed(1)}) translate(${(10 + r() * 8).toFixed(1)},0)`);
  for (const d of sigPaths(seed)) { const p = document.createElementNS(SVG, 'path'); p.setAttribute('d', d); g.append(p); }
  svg.append(g); return svg;
}

/** "Mar 1993" for a turn. */
export const dateOfTurn = (t: number) => `${MONTH_NAMES[((t % 12) + 12) % 12]} ${(S.view?.settings.startYear ?? 1990) + Math.floor(t / 12)}`;

/** A contract on paper. `me` signs on the left, `other` on the right. */
export function contractDoc(o: { title: string; no?: string; turn: number; me: Party; other: Party; intro?: Kid[]; clauses: Kid[][]; foot?: Kid; actions?: Kid[]; open?: boolean; stamp?: string }): HTMLElement {
  const sig = (p: Party) => h('div', { class: 'sigbox' },
    p.signed ? signature(p.seed) : h('div', { class: 'sig empty' }, 'awaiting signature'),
    h('div', { class: 'sigline' }), h('div', { class: 'signame' }, p.name), (p.roleText ?? (typeof p.role === 'string' ? p.role : null)) ? h('div', { class: 'sigrole' }, p.roleText ?? (p.role as string)) : null);
  return h('div', { class: 'contract' + (o.open ? ' open' : '') },
    o.stamp ? h('div', { class: 'cstamp' + (o.stamp === 'Broken' ? ' bad' : '') }, o.stamp) : null,
    h('div', { class: 'ctitle' }, o.title), o.no ? h('div', { class: 'cno' }, 'No. ' + o.no) : null,
    h('div', { class: 'cdate' }, 'Dated ', h('b', null, dateOfTurn(o.turn))),
    h('div', { class: 'cintro' }, h('div', null, 'This agreement is made between:'),
      [o.me, o.other].map(p => h('div', { class: 'cparty' }, p.nameField ?? h('b', null, p.name), p.role ? h('i', null, ' (', p.role, ')') : null)),
      h('div', null, 'who agree as follows:'), ...(o.intro ?? [])),
    h('ol', { class: 'clauses' }, o.clauses.map(c => h('li', null, ...c))),
    o.foot ? h('div', { class: 'cfoot' }, o.foot) : null,
    h('div', { class: 'sigs' }, sig(o.me), sig(o.other)),
    o.actions?.length ? h('div', { class: 'row cact' }, ...o.actions) : null);
}

// ---------------------------------------------------------------- the folder
/** One paper in the folder: the headline shown on the tab, and the full document shown when it is opened. */
export interface FolderItem { key: string; title: string; headline: Kid[]; status?: { text: string; cls?: string }; doc: () => HTMLElement; attention?: boolean; open?: () => void } // open: replaces the read-only view (e.g. drafts open the editor)
let openKey: string | null = null, animate = false;
let escClose: (() => void) | null = null;
const close = () => { openKey = null; S.render(); };
addEventListener('keydown', e => { if (e.key === 'Escape' && escClose) escClose(); });

/** A document in the middle of a darkened screen. Clicking the dark background, ✕ or Esc calls onClose. */
export function docOverlay(doc: HTMLElement, onClose: () => void, fadeIn: boolean): HTMLElement {
  doc.classList.add('modal'); escClose = onClose;
  const overlay = h('div', { class: 'coverlay' + (fadeIn ? ' in' : ''), onclick: (e: MouseEvent) => { if (e.target === overlay) onClose(); } },
    h('div', { class: 'cmodal' }, h('button', { class: 'cclose', title: 'Close', onclick: onClose }, '✕'), doc));
  return overlay;
}

/** Contracts as papers in a folder: only the top of each sheet shows (title + the key terms); click one to read it in the middle of the screen. */
export function contractFolder(items: FolderItem[], empty: string): HTMLElement {
  if (!items.length) return h('div', { class: 'muted' }, empty);
  // each sheet sits in a slot that hides everything below its top, as if the rest were inside the folder
  const folder = h('div', { class: 'cfolder' }, items.map(it => h('div', { class: 'cslot' }, h('div', { class: 'cstage' }, h('div', { class: 'cpaper' + (it.attention ? ' attention' : ''), title: 'Click to read the contract', onclick: () => { if (it.open) return it.open(); openKey = it.key; animate = true; S.render(); } },
    h('div', { class: 'cptitle' }, it.title, it.status ? h('span', { class: 'cpstatus ' + (it.status.cls ?? '') }, it.status.text) : null),
    h('div', { class: 'cpline' }, ...it.headline), h('div', { class: 'cprule' }), h('div', { class: 'cprule' }), h('div', { class: 'cprule short' }))))));
  const cur = items.find(x => x.key === openKey); if (openKey && !cur) { openKey = null; escClose = null; }
  if (!cur) return h('div', null, folder);
  const doc = cur.doc(); const overlay = docOverlay(doc, close, animate);
  animate = false; // later re-renders (polling) keep it still
  // any button inside the document closes it after acting
  doc.querySelectorAll('.cact button').forEach(b => b.addEventListener('click', () => { openKey = null; }));
  return h('div', null, folder, overlay);
}
