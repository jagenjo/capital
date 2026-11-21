// Procedural world tilemap. Cities are just groups of tiles (u downtown / s suburb) in the same map.
// Tile chars: d deep sea, a shallow sea, b beach, g grass, f farmland, t forest, h hills, m mountain, n snow,
//             o oil field, e ore deposit, r road, u downtown, s suburb, p port dock.
import type { GameState } from './types.js';
import { rnd } from './engine.js';
import { WORLD_W as WW, WORLD_H as WH, WORLD_SCALE } from './data.js';

export { WW, WH, WORLD_SCALE };
export interface Rail { a: number; b: number; tiles: number[] }
export interface World { v: number; w: number; h: number; tiles: string; rails?: Rail[] }

function fbm(s: GameState, w: number, h: number, scale: number, octaves = 3): Float32Array {
  const out = new Float32Array(w * h); let amp = 1, total = 0, sc = scale;
  for (let o = 0; o < octaves; o++) {
    const gw = Math.ceil(w / sc) + 2, gh = Math.ceil(h / sc) + 2, L = new Float32Array(gw * gh);
    for (let i = 0; i < L.length; i++) L[i] = rnd(s);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const fx = x / sc, fy = y / sc, ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = L[iy * gw + ix], b = L[iy * gw + ix + 1], c = L[(iy + 1) * gw + ix], d = L[(iy + 1) * gw + ix + 1];
      out[y * w + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
    }
    total += amp; amp *= 0.5; sc = Math.max(2, sc / 2);
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

class Heap {
  a: [number, number][] = [];
  push(c: number, v: number) { const a = this.a; a.push([c, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop(): [number, number] | undefined { const a = this.a; if (!a.length) return; const top = a[0], last = a.pop()!; if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
}
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function dijkstra(tiles: string[], from: number, cost: (ch: string) => number) {
  const dist = new Float64Array(WW * WH).fill(Infinity), prev = new Int32Array(WW * WH).fill(-1);
  const h = new Heap(); dist[from] = 0; h.push(0, from);
  for (let n = h.pop(); n; n = h.pop()) {
    const [d, u] = n; if (d > dist[u]) continue;
    const ux = u % WW, uy = (u / WW) | 0;
    for (const [dx, dy] of DIRS) {
      const x = ux + dx, y = uy + dy; if (x < 0 || y < 0 || x >= WW || y >= WH) continue;
      const v = y * WW + x, c = cost(tiles[v]); if (!isFinite(c)) continue;
      const nd = d + c; if (nd < dist[v]) { dist[v] = nd; prev[v] = u; h.push(nd, v); }
    }
  }
  return { dist, prev };
}
/** Cheapest 4-connected route from `from` to `to`. Every change of direction costs `turn`, which gives long straight runs instead of staircases. `turnOk(tile)` can forbid turning on a tile. */
function route(tiles: string[], from: number, to: number, cost: (v: number) => number, turn: number, turnOk: (v: number) => boolean = () => true): { cost: number; path: number[] } | null {
  const N = WW * WH, dist = new Float64Array(N * 4).fill(Infinity), prev = new Int32Array(N * 4).fill(-1);
  const h = new Heap(); for (let d = 0; d < 4; d++) { dist[from * 4 + d] = 0; h.push(0, from * 4 + d); }
  let end = -1;
  for (let n = h.pop(); n; n = h.pop()) {
    const [d0, st] = n; if (d0 > dist[st]) continue; const u = st >> 2, ud = st & 3;
    if (u === to) { end = st; break; }
    const ux = u % WW, uy = (u / WW) | 0;
    for (let k = 0; k < 4; k++) {
      if (k !== ud && !turnOk(u)) continue;
      const x = ux + DIRS[k][0], y = uy + DIRS[k][1]; if (x < 0 || y < 0 || x >= WW || y >= WH) continue;
      const v = y * WW + x, c = cost(v); if (!isFinite(c)) continue;
      const nd = d0 + c + (k !== ud && u !== from ? turn : 0), vs = v * 4 + k; if (nd < dist[vs]) { dist[vs] = nd; prev[vs] = st; h.push(nd, vs); }
    }
  }
  if (end < 0) return null;
  const path: number[] = []; for (let st = end; st >= 0; st = prev[st]) path.push(st >> 2);
  return { cost: dist[end], path };
}
const landCost = (ch: string) => ({ g: 1, f: 1, b: 1.2, t: 2.5, h: 3, o: 1.2, e: 6, m: 8, n: 20, r: 0.8, u: 0.8, s: 0.8, p: 0.8 } as Record<string, number>)[ch] ?? Infinity;
const travelCost = (ch: string) => ({ g: 1, f: 1, b: 1, t: 1.6, h: 1.8, o: 1, e: 2.5, m: 3, n: 5, r: 0.8, u: 0.8, s: 0.8, p: 0.8, a: 2, d: 2 } as Record<string, number>)[ch] ?? 2;

/** Generates the world, places s.cities on it (x,y,port,radius), carves roads, computes s.dist. */
export function buildWorld(s: GameState) {
  const elev = fbm(s, WW, WH, 70, 5), moist = fbm(s, WW, WH, 32, 3), detail = fbm(s, WW, WH, 8, 2), cityN = fbm(s, WW, WH, 4, 2);
  const e = new Float32Array(WW * WH);
  for (let y = 0; y < WH; y++) for (let x = 0; x < WW; x++) {
    const dx = (x - WW / 2) / (WW / 2), dy = (y - WH / 2) / (WH / 2);
    e[y * WW + x] = elev[y * WW + x] - 0.3 * (dx * dx + dy * dy);
  }
  const sorted = [...e].sort((a, b) => a - b);
  const sea = sorted[Math.floor(sorted.length * 0.4)], shallow = sea - 0.05;
  const hills = sorted[Math.floor(sorted.length * 0.86)], mount = sorted[Math.floor(sorted.length * 0.955)], snow = sorted[Math.floor(sorted.length * 0.993)];
  const tiles: string[] = new Array(WW * WH);
  for (let i = 0; i < tiles.length; i++) {
    const v = e[i];
    if (v < shallow) tiles[i] = 'd'; else if (v < sea) tiles[i] = 'a';
    else if (v < sea + 0.012) tiles[i] = 'b';
    else if (v >= snow) tiles[i] = 'n'; else if (v >= mount) tiles[i] = 'm'; else if (v >= hills) tiles[i] = 'h';
    else if (moist[i] > 0.56 && detail[i] > 0.4) tiles[i] = 't';
    else if (moist[i] < 0.5 && detail[i] > 0.42) tiles[i] = 'f';
    else tiles[i] = detail[i] > 0.58 ? 'f' : 'g';
  }
  // scarce resources: a few small random-grown clusters of oil (flat land) and ore (inside hills/mountains)
  const scatter = (chars: string, clusters: number, minSize: number, maxSize: number, to: string, allow: (i: number) => boolean = () => true) => {
    const pool = [...Array(tiles.length).keys()].filter(i => chars.includes(tiles[i]) && allow(i));
    for (let c = 0; c < clusters && pool.length; c++) {
      const start = pool[Math.floor(rnd(s) * pool.length)], size = minSize + Math.floor(rnd(s) * (maxSize - minSize + 1));
      const front = [start]; let done = 0;
      while (front.length && done < size) {
        const k = Math.floor(rnd(s) * front.length), i = front.splice(k, 1)[0];
        if (!chars.includes(tiles[i]) || !allow(i)) continue;
        tiles[i] = to; done++;
        for (const [dx, dy] of DIRS) { const x = (i % WW) + dx, y = ((i / WW) | 0) + dy; if (x > 0 && y > 0 && x < WW - 1 && y < WH - 1) front.push(y * WW + x); }
      }
    }
  };
  scatter('gfbt', 28, 3, 7, 'o');
  scatter('hm', 26, 3, 8, 'e');

  // exterior sea: water connected (4-way) to a border water tile. Any other water is a lake, where ports are not allowed.
  const ext = new Uint8Array(WW * WH); { const q: number[] = []; const seed = (i: number) => { if (!ext[i] && (tiles[i] === 'a' || tiles[i] === 'd')) { ext[i] = 1; q.push(i); } };
    for (let x = 0; x < WW; x++) { seed(x); seed((WH - 1) * WW + x); } for (let y = 0; y < WH; y++) { seed(y * WW); seed(y * WW + WW - 1); }
    while (q.length) { const i = q.pop()!, x = i % WW, y = (i / WW) | 0; for (const [dx, dy] of DIRS) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < WW && yy < WH) seed(yy * WW + xx); } } }
  const isLand = (ch: string) => 'bgftmhnoe'.includes(ch);
  const okForCity = (ch: string) => 'bgfth'.includes(ch);
  const nearSea = (x: number, y: number, r: number) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < WW && yy < WH && tiles[yy * WW + xx] === 'a' && ext[yy * WW + xx]) return true; } return false; };

  // --- choose city sites
  const cities = s.cities, placed: { x: number; y: number }[] = [];
  const cand: number[] = [];
  for (let y = 14; y < WH - 14; y += 1) for (let x = 14; x < WW - 14; x += 1) {
    const i = y * WW + x; if (!okForCity(tiles[i])) continue;
    let ok = true; for (const [dx, dy] of [[5, 0], [-5, 0], [0, 5], [0, -5], [4, 4], [-4, -4], [4, -4], [-4, 4]]) if (!isLand(tiles[(y + dy) * WW + x + dx])) { ok = false; break; }
    if (ok) cand.push(i);
  }
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rnd(s) * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  const coastalWanted = Math.max(2, Math.ceil(cities.filter(c => !c.town).length / 2));
  const centers: number[] = [];
  for (const city of cities) {
    let minD = city.town ? 26 : 70, chosen = -1;
    while (chosen < 0 && minD > (city.town ? 7 : 12)) {
      for (const c of cand) {
        const x = c % WW, y = (c / WW) | 0;
        if (placed.some(p => Math.hypot(p.x - x, p.y - y) < minD)) continue;
        if (!city.town && city.id < coastalWanted && !nearSea(x, y, 6)) continue;
        chosen = c; break;
      }
      if (chosen < 0) minD -= 6;
    }
    if (chosen < 0) chosen = cand[Math.floor(rnd(s) * cand.length)] ?? (WH / 2 * WW + WW / 2);
    const x = chosen % WW, y = (chosen / WW) | 0; placed.push({ x, y }); centers.push(chosen);
    city.x = Math.round((x + 0.5) * WORLD_SCALE); city.y = Math.round((y + 0.5) * WORLD_SCALE);
    city.radius = Math.round((city.town ? 1.4 + Math.sqrt(city.pop / 1000) * 0.12 : 2.2 + Math.sqrt(city.pop / 1000) * 0.085) * 10) / 10;
    // city blob: downtown core + suburbs
    const R = Math.ceil(city.radius * 1.4);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 1 || yy < 1 || xx >= WW - 1 || yy >= WH - 1) continue;
      const i = yy * WW + xx; if (!okForCity(tiles[i]) && tiles[i] !== 'o') continue;
      const d = Math.hypot(dx, dy), lim = city.radius * (0.7 + 0.6 * cityN[i]);
      if (d < lim) tiles[i] = !city.town && d < lim * 0.45 ? 'u' : 's';
    }
    tiles[chosen] = city.town ? 's' : 'u';
    // port: nearest shallow-sea tile within reach, joined to the city by a short harbour road
    let best = -1, bd = 1e9;
    for (let dy = -R - 8; dy <= R + 8; dy++) for (let dx = -R - 8; dx <= R + 8; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 1 || yy < 1 || xx >= WW - 1 || yy >= WH - 1) continue;
      const i = yy * WW + xx; if (tiles[i] !== 'a' || !ext[i]) continue;
      const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0 && (city.town || Math.sqrt(bd) > city.radius + 4)) best = -1; // towns have no port; sea too far away: inland city
    city.port = best >= 0;
    if (best >= 0) {
      // walk from the city centre toward the water (4-connected), turning the land into suburb tiles so the city really touches the sea
      const bx = best % WW, by = (best / WW) | 0; let cx = x, cy = y, dock = -1;
      for (let n = 0; n < 200 && dock < 0; n++) {
        if (Math.abs(bx - cx) >= Math.abs(by - cy)) cx += Math.sign(bx - cx); else cy += Math.sign(by - cy);
        const i = cy * WW + cx, ch = tiles[i];
        if (ch === 'a') { dock = i; break; }
        if ('gfbthmn'.includes(ch)) tiles[i] = 's';
        if (cx === bx && cy === by) break;
      }
      if (dock < 0) dock = best;
      tiles[dock] = 'p';
      // pier: one more harbour tile out into the water, away from the city
      const dx = dock % WW, dy = (dock / WW) | 0, sx = Math.sign(dx - cx) || Math.sign(dx - x), sy = Math.sign(dy - cy) || Math.sign(dy - y);
      const o1 = dy * WW + dx + (Math.abs(dx - x) >= Math.abs(dy - y) ? sx : 0) + (Math.abs(dx - x) >= Math.abs(dy - y) ? 0 : sy * WW);
      if (tiles[o1] === 'a') tiles[o1] = 'p';
    }
  }
  // --- roads: minimum spanning tree + extra links
  const edges: [number, number][] = []; const inTree = new Set([0]);
  while (inTree.size < cities.length) {
    let best: [number, number] | null = null, bd = 1e9;
    for (const a of inTree) for (let b = 0; b < cities.length; b++) if (!inTree.has(b)) { const d = Math.hypot(placed[a].x - placed[b].x, placed[a].y - placed[b].y); if (d < bd) { bd = d; best = [a, b]; } }
    edges.push(best!); inTree.add(best![1]);
  }
  const extra: { a: number; b: number; d: number }[] = [];
  for (let a = 0; a < cities.length; a++) for (let b = a + 1; b < cities.length; b++) if (!edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) extra.push({ a, b, d: Math.hypot(placed[a].x - placed[b].x, placed[a].y - placed[b].y) });
  extra.sort((p, q) => p.d - q.d); for (const x of extra.slice(0, Math.max(1, Math.floor(cities.length / 3)))) edges.push([x.a, x.b]);
  const roadCost = (v: number) => landCost(tiles[v]);
  for (const [a, b] of edges) {
    const r = route(tiles, centers[a], centers[b], roadCost, 2.5); if (!r) continue; // separated by sea
    for (const v of r.path) if ('gfbthmn'.includes(tiles[v])) tiles[v] = 'r';
  }
  // --- keep oil fields and ore deposits well away from cities (a city plus a 12-tile margin); regrow what was lost elsewhere
  { const far = (i: number) => placed.every((p, k) => Math.hypot(p.x - (i % WW), p.y - ((i / WW) | 0)) > cities[k].radius * 1.4 + 12);
    let lostO = 0, lostE = 0;
    for (let i = 0; i < tiles.length; i++) { if (far(i)) continue; if (tiles[i] === 'o') { tiles[i] = 'g'; lostO++; } else if (tiles[i] === 'e') { tiles[i] = 'h'; lostE++; } }
    if (lostO) scatter('gfbt', Math.ceil(lostO / 5), 3, 7, 'o', far);
    if (lostE) scatter('hm', Math.ceil(lostE / 5), 3, 8, 'e', far); }
  // --- railways: a forest of lines between some land-connected cities (big and close first)
  const rails: Rail[] = []; { const cands: { a: number; b: number; sc: number; tiles: number[] }[] = [];
    // rails run on their own tiles: a road tile may only be crossed (one tile, no turning on it), never followed
    const base = (ch: string) => ({ g: 1, f: 1, b: 1.2, t: 1.5, h: 2.5, o: 1.2, e: 3, m: 6, n: 10, u: 0.5, s: 0.5 } as Record<string, number>)[ch] ?? Infinity;
    const railCost = (v: number) => tiles[v] === 'r' ? 1 + 12 : base(tiles[v]);
    const bigs = cities.filter(c => !c.town); const seen = new Set<string>();
    for (const A of bigs) { const near = bigs.filter(c => c !== A).sort((p, q) => Math.hypot(p.x - A.x, p.y - A.y) - Math.hypot(q.x - A.x, q.y - A.y)).slice(0, 3);
      for (const B of near) { const a = Math.min(A.id, B.id), b = Math.max(A.id, B.id), key = a + '-' + b; if (seen.has(key)) continue; seen.add(key);
        const r = route(tiles, centers[a], centers[b], railCost, 5, v => tiles[v] !== 'r'); if (!r) continue;
        cands.push({ a, b, sc: (cities[a].pop + cities[b].pop) / (r.cost + 20), tiles: r.path }); } }
    cands.sort((p, q) => q.sc - p.sc); const uf = cities.map((_, i) => i); const root = (i: number): number => (uf[i] === i ? i : (uf[i] = root(uf[i])));
    const want = Math.max(1, Math.round(bigs.length * 0.6));
    for (const c of cands) { if (rails.length >= want) break; if (root(c.a) === root(c.b)) continue; uf[root(c.a)] = root(c.b); rails.push({ a: c.a, b: c.b, tiles: c.tiles }); } }
  // --- travel distance matrix (roads fast, ferries across sea)
  s.dist = cities.map(() => cities.map(() => 0));
  cities.forEach((_, a) => { const { dist } = dijkstra(tiles, centers[a], travelCost); cities.forEach((__, b) => { s.dist![a][b] = a === b ? 15 : Math.round(dist[centers[b]] * WORLD_SCALE); }); });
  s.world = { v: 19, w: WW, h: WH, tiles: tiles.join(''), rails };
}

export const nearestCity = (cities: { x: number; y: number }[], idx: number): number => {
  const x = ((idx % WW) + 0.5) * WORLD_SCALE, y = (Math.floor(idx / WW) + 0.5) * WORLD_SCALE; let best = 0, bd = Infinity;
  cities.forEach((c, i) => { const d = Math.hypot(c.x - x, c.y - y); if (d < bd) { bd = d; best = i; } });
  return best;
};
