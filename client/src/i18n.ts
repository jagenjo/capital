// Tiny i18n layer. The UI is written in English; in Spanish every string that goes through h() / toast() /
// confirm() is looked up here: exact phrase first, then pattern rules (server news, errors, templated text).
import { ES, ES_PATTERNS } from './i18n-es.js';

export type Lang = 'en' | 'es';
export let lang: Lang = (localStorage.getItem('capital.lang') as Lang) || ((navigator.language || '').toLowerCase().startsWith('es') ? 'es' : 'en');
document.documentElement.lang = lang;
export type Cur = 'USD' | 'EUR';
export const RATE = 0.92; // 1 USD in EUR (display only)
export let cur: Cur = (localStorage.getItem('capital.cur') as Cur) || 'USD';
export function setCur(c: Cur) { cur = c; localStorage.setItem('capital.cur', c); cache.clear(); }
// amounts written by the engine as "$1,234" become euros when the euro is selected
const cvt = (s: string) => cur === 'EUR' && s.includes('$') ? s.replace(/(-?)\$(\d[\d,]*(?:\.\d+)?)/g, (_m, n, a) => { const x = parseFloat(a.replace(/,/g, '')) * RATE; return n + '€' + Math.round(x).toLocaleString('en-US'); }) : s;
export function setLang(l: Lang) { lang = l; localStorage.setItem('capital.lang', l); document.documentElement.lang = l; cache.clear(); }

// keys are matched trimmed (outer whitespace of the source string is kept), so normalise them once
const ESN: Record<string, string> = {}; for (const [k, v] of Object.entries(ES)) { const kk = k.trim(); if (kk && ESN[kk] === undefined) ESN[kk] = v.trim(); }
const lower = new Map<string, string>(); for (const [k, v] of Object.entries(ESN)) lower.set(k.toLowerCase(), v);
const cache = new Map<string, string>();
// fallback for sentences glued together from several pieces: replace the known fragments (whole words only) inside them
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const FRAGS: [RegExp, string][] = (() => {
  const list: [string, string][] = [];
  for (const [k, v] of Object.entries(ES)) {
    const kk = k.trim(), vv = v.trim(); if (kk.length < 3 || !/[A-Za-z]/.test(kk)) continue;
    list.push([kk, vv]);
    if (/^[A-Z][a-z][^A-Z]*$/.test(kk) && /^[A-Z]/.test(vv)) list.push([kk.charAt(0).toLowerCase() + kk.slice(1), vv.charAt(0).toLowerCase() + vv.slice(1)]);
  }
  const seenK = new Set<string>(); const out: [string, string][] = [];
  for (const e of list.sort((x, y) => y[0].length - x[0].length)) if (!seenK.has(e[0])) { seenK.add(e[0]); out.push(e); }
  return out.map(([k, v]) => [new RegExp('(?<![A-Za-z])' + esc(k) + '(?![A-Za-z])', 'g'), v] as [RegExp, string]);
})();

// translate a bare phrase (exact, then case-insensitive keeping a lowercase first letter)
function word(s: string): string | undefined {
  if (ESN[s] !== undefined) return ESN[s];
  const l = lower.get(s.toLowerCase()); if (l === undefined) return undefined;
  return /^[a-z]/.test(s) ? l.charAt(0).toLowerCase() + l.slice(1) : l;
}

function core(s: string): string {
  const w = word(s); if (w !== undefined) return w;
  for (const [re, fn] of ES_PATTERNS) {
    const m = re.exec(s); if (m) return fn(...m.slice(1).map(g => g === undefined ? '' : tr(g)));
  }
  // headlines drop the final "." / "!": try the sentence-patterns with it put back
  if (!/[.!?]$/.test(s)) for (const p of ['.', '!']) for (const [re, fn] of ES_PATTERNS) { const m = re.exec(s + p); if (m) return fn(...m.slice(1).map(g => g === undefined ? '' : tr(g))).replace(/[.!]$/, ''); }
  // leading symbols ("• ", "⚠ ", "✓ ", "🚧 ") are kept, the rest is translated on its own
  const sym = /^([•·⚠✓🚧🔒👤⚓]+\s*)([\s\S]+)$/.exec(s); if (sym) return sym[1] + tr(sym[2]);
  let out = s;
  for (const [re, v] of FRAGS) out = out.replace(re, () => v);
  return out;
}

export function tr(s: string): string {
  if (!s) return s;
  if (lang === 'en') return cvt(s);
  const hit = cache.get(s); if (hit !== undefined) return hit;
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s)!;
  const out = m[2] ? m[1] + core(m[2]) + m[3] : s;
  const res = cvt(out);
  if (cache.size > 4000) cache.clear(); cache.set(s, res); return res;
}

// message boxes
const _confirm = window.confirm.bind(window), _prompt = window.prompt.bind(window);
window.confirm = (m?: string) => _confirm(tr(m ?? ''));
window.prompt = (m?: string, d?: string) => _prompt(tr(m ?? ''), d);
