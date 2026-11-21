import { tr, cur, RATE } from './i18n.js';
type Kid = Node | string | number | null | false | undefined;
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Record<string, any> | null, ...kids: (Kid | Kid[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (typeof v === 'string' && (k === 'title' || k === 'placeholder' || k === 'alt')) el.setAttribute(k, tr(v));
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (k in el && k !== 'list') (el as any)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  const add = (k: Kid | Kid[]) => { if (Array.isArray(k)) k.forEach(add); else if (k != null && k !== false) el.append(k instanceof Node ? k : tr(String(k))); };
  kids.forEach(add);
  return el;
}
const sym = () => cur === 'EUR' ? '€' : '$', fx = (v: number) => cur === 'EUR' ? v * RATE : v;
export const money = (v: number) => (v < 0 ? '-' : '') + sym() + Math.abs(Math.round(fx(v))).toLocaleString('en-US');
export const money2 = (v: number) => (v < 0 ? '-' : '') + sym() + Math.abs(fx(v)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const num = (v: number, dp = 0) => v.toLocaleString('en-US', { maximumFractionDigits: dp, minimumFractionDigits: dp });
export const pct = (v: number) => Math.round(v * 100) + '%';
export function toast(msg: string, kind: '' | 'err' | 'ok' = '') {
  const t = h('div', { class: 'toast ' + kind }, msg); document.getElementById('toasts')!.append(t);
  setTimeout(() => t.remove(), kind === 'err' ? 5000 : 2800);
}
export const cls = (v: number) => (v > 0 ? 'good' : v < 0 ? 'bad' : '');
export const asset = (p: string) => '/assets/' + p;

// language switch button (re-renders through the callback)
import { lang, setLang } from './i18n.js';
export const langButton = (rerender: () => void) => h('button', { class: 'mini', title: 'Language', onclick: () => { setLang(lang === 'es' ? 'en' : 'es'); rerender(); } }, lang === 'es' ? 'English' : 'Español');

/** Gives a chart canvas a backing store matching the device pixel ratio, so it stays sharp (logical size w x h in CSS px). */
export function crisp<T extends HTMLCanvasElement>(cv: T, w: number, hgt: number): T {
  const d = Math.max(1, window.devicePixelRatio || 1);
  cv.width = Math.round(w * d); cv.height = Math.round(hgt * d); cv.style.width = w + 'px'; cv.style.height = hgt + 'px'; cv.classList.add('chart');
  cv.getContext('2d')!.scale(d, d); return cv;
}
