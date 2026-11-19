type Kid = Node | string | number | null | false | undefined;
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Record<string, any> | null, ...kids: (Kid | Kid[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (k in el && k !== 'list') (el as any)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  const add = (k: Kid | Kid[]) => { if (Array.isArray(k)) k.forEach(add); else if (k != null && k !== false) el.append(k instanceof Node ? k : String(k)); };
  kids.forEach(add);
  return el;
}
export const money = (v: number) => (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US');
export const money2 = (v: number) => (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const num = (v: number, dp = 0) => v.toLocaleString('en-US', { maximumFractionDigits: dp, minimumFractionDigits: dp });
export const pct = (v: number) => Math.round(v * 100) + '%';
export function toast(msg: string, kind: '' | 'err' | 'ok' = '') {
  const t = h('div', { class: 'toast ' + kind }, msg); document.getElementById('toasts')!.append(t);
  setTimeout(() => t.remove(), kind === 'err' ? 5000 : 2800);
}
export const cls = (v: number) => (v > 0 ? 'good' : v < 0 ? 'bad' : '');
export const asset = (p: string) => '/assets/' + p;
