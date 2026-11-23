// World sanity: no beach/hills/snow, no isolated water, resources present.
import { createGame, DEFAULT_SETTINGS } from '../shared/engine.js';
for (const seed of [1, 7, 8, 9, 10, 11, 12]) {
  const s = createGame({ ...DEFAULT_SETTINGS, seed, aiCompanies: 0 }); const w = s.world!, W = w.w, H = w.h, t = w.tiles;
  const cnt: Record<string, number> = {}; for (const c of t) cnt[c] = (cnt[c] ?? 0) + 1;
  // water components
  const seen = new Uint8Array(t.length); let comps = 0;
  for (let i = 0; i < t.length; i++) if ((t[i] === 'a' || t[i] === 'd') && !seen[i]) { comps++; const q = [i]; seen[i] = 1; while (q.length) { const j = q.pop()!, x = j % W, y = (j / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const k = yy * W + xx; if (!seen[k] && (t[k] === 'a' || t[k] === 'd')) { seen[k] = 1; q.push(k); } } } }
  console.log(seed, 'water bodies', comps, 'b/h/n', (cnt.b ?? 0) + (cnt.h ?? 0) + (cnt.n ?? 0), 'mountain', cnt.m, 'e/c/q', cnt.e, cnt.c, cnt.q);
}
{ const s = createGame({ ...DEFAULT_SETTINGS, seed: 1, aiCompanies: 0 }); const w = s.world!, W = w.w, H = w.h, t = w.tiles;
  const seen = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) if ((t[i] === 'a' || t[i] === 'd') && !seen[i]) { let n = 0, border = false; const q = [i]; seen[i] = 1; while (q.length) { const j = q.pop()!, x = j % W, y = (j / W) | 0; n++; if (x === 0 || y === 0 || x === W - 1 || y === H - 1) border = true; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const k = yy * W + xx; if (!seen[k] && (t[k] === 'a' || t[k] === 'd')) { seen[k] = 1; q.push(k); } } } console.log('body at', i % W, (i / W) | 0, 'size', n, 'border', border); } }
