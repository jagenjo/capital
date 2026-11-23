// Procedural world tilemap. Cities are just groups of tiles (u downtown / s suburb) in the same map.
// Tile chars: d deep sea, a shallow sea, b beach, g grass, f farmland, t forest, h hills, m mountain, n snow,
//             o oil field, e ore deposit, r road, u downtown, s suburb, p port dock.
import type { GameState } from './types.js';
import { rnd } from './engine.js';
import { WORLD_W as WW, WORLD_H as WH, WORLD_SCALE } from './data.js';

export { WW, WH, WORLD_SCALE };
export interface Rail { a: number; b: number; tiles: number[] }
export interface World { v: number; rev?: number; w: number; h: number; tiles: string; qual?: string; rails?: Rail[] }

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
const landCost = (ch: string) => ({ g: 1, f: 1, t: 2.5, o: 1.2, e: 6, c: 6, x: 6, m: 8, r: 0.8, u: 0.8, s: 0.8, p: 0.8 } as Record<string, number>)[ch] ?? Infinity;
const travelCost = (ch: string) => ({ g: 1, f: 1, t: 1.6, o: 1, e: 2.5, m: 3, r: 0.8, u: 0.8, s: 0.8, h: 0.8, p: 0.8, a: 2, d: 2 } as Record<string, number>)[ch] ?? 2;

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
  const mount = sorted[Math.floor(sorted.length * 0.965)];
  const tiles: string[] = new Array(WW * WH);
  for (let i = 0; i < tiles.length; i++) {
    const v = e[i];
    if (v < shallow) tiles[i] = 'd'; else if (v < sea) tiles[i] = 'a';
    else if (v >= mount) tiles[i] = 'm';
    else if (moist[i] > 0.56 && detail[i] > 0.4) tiles[i] = 't';
    else if (moist[i] < 0.5 && detail[i] > 0.42) tiles[i] = 'f';
    else tiles[i] = detail[i] > 0.58 ? 'f' : 'g';
  }
  // scarce resources: oil (flat land) and ore (inside hills/mountains) come in a few clusters of different sizes
  /** Exactly one cluster per entry of `sizes` (so the sizes differ), each at least `gap` tiles from the others of its kind. Returns the clusters actually made. */
  const clusterSet = (chars: string, sizes: number[], to: string, allow: (i: number) => boolean = () => true, gap = 5) => {
    const block = new Uint8Array(tiles.length); let made = 0;
    for (const size of sizes) {
      const pool = [...Array(tiles.length).keys()].filter(i => chars.includes(tiles[i]) && allow(i) && !block[i]); if (!pool.length) break;
      const start = pool[Math.floor(rnd(s) * pool.length)]; const front = [start]; const got: number[] = [];
      while (front.length && got.length < size) {
        const k = Math.floor(rnd(s) * front.length), i = front.splice(k, 1)[0];
        if (!chars.includes(tiles[i]) || !allow(i) || block[i] || got.includes(i)) continue;
        got.push(i);
        for (const [dx, dy] of DIRS) { const x = (i % WW) + dx, y = ((i / WW) | 0) + dy; if (x > 0 && y > 0 && x < WW - 1 && y < WH - 1) front.push(y * WW + x); }
      }
      if (got.length < 2) continue;
      for (const i of got) { tiles[i] = to; const x = i % WW, y = (i / WW) | 0; for (let dy = -gap; dy <= gap; dy++) for (let dx = -gap; dx <= gap; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < WW && yy < WH) block[yy * WW + xx] = 1; } }
      made++;
    }
    return made;
  };
  // (oil fields are placed last, once roads and railways are laid out)
  // (ore deposits are placed together with the other resources, once the cities are known)


  // one single sea: separate seas that only meet at the map edge are joined by a short channel through the land between them
  for (let guard = 0; guard < 40; guard++) {
    const comp = new Int32Array(WW * WH).fill(-1); const sizes: number[] = [], border: boolean[] = []; const water = (i: number) => tiles[i] === 'a' || tiles[i] === 'd';
    for (let i = 0; i < tiles.length; i++) if (water(i) && comp[i] < 0) { const id = sizes.length; let n = 0, bd = false; const q = [i]; comp[i] = id;
      while (q.length) { const j = q.pop()!, x = j % WW, y = (j / WW) | 0; n++; if (x === 0 || y === 0 || x === WW - 1 || y === WH - 1) bd = true;
        for (const [dx, dy] of DIRS) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= WW || yy >= WH) continue; const k = yy * WW + xx; if (comp[k] < 0 && water(k)) { comp[k] = id; q.push(k); } } }
      sizes.push(n); border.push(bd); }
    const bs = sizes.map((n, id) => ({ n, id })).filter(c => border[c.id]).sort((a, b) => a.n - b.n); if (bs.length < 2) break;
    const from = bs[0].id, prev = new Int32Array(WW * WH).fill(-2); const q: number[] = [];
    for (let i = 0; i < tiles.length; i++) if (comp[i] === from) { prev[i] = -1; q.push(i); }
    let hit = -1;
    for (let h = 0; h < q.length && hit < 0; h++) { const j = q[h], x = j % WW, y = (j / WW) | 0;
      for (const [dx, dy] of DIRS) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= WW || yy >= WH) continue; const k = yy * WW + xx; if (prev[k] !== -2) continue; prev[k] = j; if (comp[k] >= 0 && comp[k] !== from && border[comp[k]]) { hit = k; break; } q.push(k); } }
    if (hit < 0) break;
    for (let k = prev[hit]; k >= 0 && prev[k] !== -1; k = prev[k]) { if (!water(k)) tiles[k] = 'a'; // 3 tiles wide so a port cannot block it
      for (const [dx, dy] of DIRS) { const xx = (k % WW) + dx, yy = ((k / WW) | 0) + dy; if (xx > 0 && yy > 0 && xx < WW - 1 && yy < WH - 1 && !water(yy * WW + xx)) tiles[yy * WW + xx] = 'a'; } }
  }
  // exterior sea: water connected (4-way) to a border water tile. Any other water is a lake, where ports are not allowed.
  const ext = new Uint8Array(WW * WH); { const q: number[] = []; const seed = (i: number) => { if (!ext[i] && (tiles[i] === 'a' || tiles[i] === 'd')) { ext[i] = 1; q.push(i); } };
    for (let x = 0; x < WW; x++) { seed(x); seed((WH - 1) * WW + x); } for (let y = 0; y < WH; y++) { seed(y * WW); seed(y * WW + WW - 1); }
    while (q.length) { const i = q.pop()!, x = i % WW, y = (i / WW) | 0; for (const [dx, dy] of DIRS) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < WW && yy < WH) seed(yy * WW + xx); } } }
  // no isolated water: lakes and inland ponds (water that does not reach the outer sea) become grassland
  for (let i = 0; i < tiles.length; i++) if (!ext[i] && (tiles[i] === 'a' || tiles[i] === 'd')) tiles[i] = 'g';
  const isLand = (ch: string) => 'gftmoecx'.includes(ch);
  const okForCity = (ch: string) => 'gft'.includes(ch);
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
    if (best >= 0 && (city.town || (city.id !== 0 && Math.sqrt(bd) > city.radius + 4))) best = -1; // city 0 is the metropolis: it always gets a harbour; // towns have no port; sea too far away: inland city
    city.port = best >= 0;
    if (best >= 0) {
      // walk from the city centre toward the water (4-connected), turning the land into suburb tiles so the city really touches the sea
      const bx = best % WW, by = (best / WW) | 0; let cx = x, cy = y, dock = -1;
      for (let n = 0; n < 200 && dock < 0; n++) {
        if (Math.abs(bx - cx) >= Math.abs(by - cy)) cx += Math.sign(bx - cx); else cy += Math.sign(by - cy);
        const i = cy * WW + cx, ch = tiles[i];
        if (ch === 'a') { dock = i; break; }
        if ('gftm'.includes(ch)) tiles[i] = 's';
        if (cx === bx && cy === by) break;
      }
      if (dock < 0) dock = best;
      tiles[dock] = 'p';
      // exactly one harbour tile per port city
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
    for (const v of r.path) if ('gftm'.includes(tiles[v])) tiles[v] = 'r';
  }
  // --- dead-end roads: few short straight spurs (no turns) branching off the main roads, never joining another road
  { const roads: number[] = []; for (let i = 0; i < tiles.length; i++) if (tiles[i] === 'r') roads.push(i);
    const inCity = (i: number) => placed.some((p, k) => Math.hypot(p.x - (i % WW), p.y - ((i / WW) | 0)) < cities[k].radius * 1.3 + 2);
    const nb = (i: number) => { const x = i % WW, y = (i / WW) | 0; const o: number[] = []; if (x > 0) o.push(i - 1); if (x < WW - 1) o.push(i + 1); if (y > 0) o.push(i - WW); if (y < WH - 1) o.push(i + WW); return o; };
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const want = Math.floor(roads.length / 60); let made = 0;
    for (let tries = 0; tries < want * 6 && made < want && roads.length; tries++) {
      const start = roads[Math.floor(rnd(s) * roads.length)]; if (inCity(start)) continue;
      const sx = start % WW, sy = (start / WW) | 0; const dir = DIRS[Math.floor(rnd(s) * 4)]; const len = 4 + Math.floor(rnd(s) * 11);
      const path: number[] = []; let x = sx, y = sy;
      for (let k = 0; k < len; k++) {
        x += dir[0]; y += dir[1]; if (x < 1 || y < 1 || x >= WW - 1 || y >= WH - 1) break;
        const i = y * WW + x; if (!'gft'.includes(tiles[i]) || inCity(i) || path.includes(i)) break;
        const prev = path.length ? path[path.length - 1] : start;
        if (nb(i).some(n => n !== prev && (tiles[n] === 'r' || path.includes(n)))) break; // would touch another road or itself: stop here
        path.push(i);
      }
      if (path.length < 3) continue;
      for (const i of path) tiles[i] = 'r'; made++;
    }
  }
  // --- ore deposits: five clusters of each kind (four of rare ores) of different sizes, in the hills and mountains, a city plus a 12-tile margin away from any city;
  //     copper and stone keep clear of the iron, rare ores clear of everything
  { const far = (i: number) => placed.every((p, k) => Math.hypot(p.x - (i % WW), p.y - ((i / WW) | 0)) > cities[k].radius * 1.4 + 12);
    const clear = (chars: string, R: number) => { const near = new Uint8Array(tiles.length);
      for (let i = 0; i < tiles.length; i++) if (chars.includes(tiles[i])) { const x = i % WW, y = (i / WW) | 0; for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < WW && yy < WH) near[yy * WW + xx] = 1; } }
      return (i: number) => far(i) && !near[i]; };
    clusterSet('m', [12, 9, 7, 5, 4], 'e', far, 7);
    clusterSet('m', [10, 8, 6, 4, 3], 'c', clear('e', 9), 7);
    clusterSet('m', [6, 4, 3, 2], 'x', clear('ec', 6), 6); }
  // --- railways: a forest of lines between some land-connected cities (big and close first)
  const rails: Rail[] = []; { const cands: { a: number; b: number; sc: number; tiles: number[] }[] = [];
    // rails run on their own tiles: a road tile may only be crossed (one tile, no turning on it), never followed
    const base = (ch: string) => ({ g: 1, f: 1, t: 1.5, o: 1.2, e: 3, c: 3, x: 3, m: 6, u: 0.5, s: 0.5 } as Record<string, number>)[ch] ?? Infinity;
    const railCost = (v: number) => tiles[v] === 'r' ? 1 + 12 : base(tiles[v]);
    const bigs = cities.filter(c => !c.town); const seen = new Set<string>();
    for (const A of bigs) { const near = bigs.filter(c => c !== A).sort((p, q) => Math.hypot(p.x - A.x, p.y - A.y) - Math.hypot(q.x - A.x, q.y - A.y)).slice(0, 3);
      for (const B of near) { const a = Math.min(A.id, B.id), b = Math.max(A.id, B.id), key = a + '-' + b; if (seen.has(key)) continue; seen.add(key);
        const r = route(tiles, centers[a], centers[b], railCost, 5, v => tiles[v] !== 'r'); if (!r) continue;
        cands.push({ a, b, sc: (cities[a].pop + cities[b].pop) / (r.cost + 20), tiles: r.path }); } }
    cands.sort((p, q) => q.sc - p.sc); const uf = cities.map((_, i) => i); const root = (i: number): number => (uf[i] === i ? i : (uf[i] = root(uf[i])));
    const want = Math.max(1, Math.round(bigs.length * 0.6));
    for (const c of cands) { if (rails.length >= want) break; if (root(c.a) === root(c.b)) continue; uf[root(c.a)] = root(c.b); rails.push({ a: c.a, b: c.b, tiles: c.tiles.filter(v => !'us'.includes(tiles[v]) && !centers.includes(v)) }); /* no track inside cities: urban tiles already move goods at rail cost */ } }
  // --- oil fields: five clusters of different sizes, placed after roads and railways so they never sit on a route; well away from cities (a city plus a 12-tile margin)
  { const railTiles = new Set<number>(); for (const r of rails) for (const v of r.tiles) railTiles.add(v);
    const farO = (i: number) => placed.every((p, k) => Math.hypot(p.x - (i % WW), p.y - ((i / WW) | 0)) > cities[k].radius * 1.4 + 12);
    clusterSet('gft', [13, 10, 8, 6, 4], 'o', i => farO(i) && !railTiles.has(i), 8); } // roads are 'r' tiles, which the clusters never overwrite
  // --- travel distance matrix (roads fast, ferries across sea)
  s.dist = cities.map(() => cities.map(() => 0));
  cities.forEach((_, a) => { const { dist } = dijkstra(tiles, centers[a], travelCost); cities.forEach((__, b) => { s.dist![a][b] = a === b ? 15 : Math.round(dist[centers[b]] * WORLD_SCALE); }); });
  for (const r of rails) for (const t of r.tiles) tiles[t] = 'i'; // railroad tiles: nothing can be built on them (a road they cross is cut by the track)
  for (const c of centers) tiles[c] = 'h'; // town hall / central square: nothing can be built here, shops around it get extra foot traffic
  // tile quality 00-99 (two digits per tile): forest density, farmland fertility, suburb services (everything else 5)
  const qn = fbm(s, WW, WH, 14, 3), qf = fbm(s, WW, WH, 5, 3); const qual: string[] = new Array(tiles.length);
  /* distance to the nearest water (sea / lake), multi-source BFS: land near water is fertile, far inland drier */
  const wdist = new Float32Array(tiles.length).fill(1e9); { const qu: number[] = []; for (let i = 0; i < tiles.length; i++) if (tiles[i] === 'd' || tiles[i] === 'a') { wdist[i] = 0; qu.push(i); }
    for (let h = 0; h < qu.length; h++) { const i = qu[h], x = i % WW, y = (i / WW) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= WW || Y >= WH) continue; const j = Y * WW + X; if (wdist[j] > wdist[i] + 1) { wdist[j] = wdist[i] + 1; qu.push(j); } } } }
  for (let i = 0; i < tiles.length; i++) {
    const nz = Math.max(0, Math.min(1, 0.5 + (qn[i] - 0.5) / 0.4)); let q = nz; // 0..1 smooth noise
    if (tiles[i] === 'f' || tiles[i] === 't' || tiles[i] === 'g') { const wet = 0.25 + 0.75 * Math.exp(-Math.min(wdist[i], 200) / 22), n2 = Math.max(0, Math.min(1, 0.5 + (0.6 * qn[i] + 0.4 * qf[i] - 0.5) / 0.3)); q = Math.max(0.1, Math.min(1, n2 * wet * 1.7)); /* farm and forest are never barren: at least 10% */ }
    if (tiles[i] === 's') { let best = 0, bk = 0; const x = i % WW, y = (i / WW) | 0; let bd = 1e9; placed.forEach((p, k) => { const d = Math.hypot(p.x - x, p.y - y) / (cities[k].radius * 1.3); if (d < bd) { bd = d; bk = k; } });
      best = Math.max(0, 1 - bd); q = Math.max(0, Math.min(1, 0.55 * best + 0.3 * nz + (cities[bk].town ? 0 : 0.15))); }
    qual[i] = tiles[i] === 't' || tiles[i] === 'f' || tiles[i] === 'g' || tiles[i] === 's' ? String(Math.max(0, Math.min(99, Math.round(q * 99)))).padStart(2, '0') : '50';
  }
  s.world = { v: 66, w: WW, h: WH, tiles: tiles.join(''), qual: qual.join(''), rails };
}

export const nearestCity = (cities: { x: number; y: number }[], idx: number): number => {
  const x = ((idx % WW) + 0.5) * WORLD_SCALE, y = (Math.floor(idx / WW) + 0.5) * WORLD_SCALE; let best = 0, bd = Infinity;
  cities.forEach((c, i) => { const d = Math.hypot(c.x - x, c.y - y); if (d < bd) { bd = d; best = i; } });
  return best;
};
