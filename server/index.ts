import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame, addCompany, applyAction, processTurn, DEFAULT_SETTINGS } from '../shared/engine.js';
import type { Settings, Action } from '../shared/types.js';
import { buildWorld } from '../shared/world.js';
import { buildView, type GameRec, type PlayerRec } from './view.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = process.env.DATA_DIR ?? path.join(ROOT, 'data', 'games');
const PORT = +(process.env.PORT ?? 3001);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin';
fs.mkdirSync(DATA, { recursive: true });

const games = new Map<string, GameRec>();
const adminTokens = new Map<string, number>();
const hash = (pw: string, salt: string) => crypto.scryptSync(pw, salt, 32).toString('hex');
const rid = (n = 12) => crypto.randomBytes(n).toString('hex');
const safeEq = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// ---- persistence
const dirty = new Set<string>();
function save(g: GameRec) { dirty.add(g.id); }
function flush() {
  for (const id of dirty) { const g = games.get(id); if (g) fs.writeFileSync(path.join(DATA, id + '.json'), JSON.stringify(g)); }
  dirty.clear();
}
setInterval(flush, 2000);
// Development policy: saves in an outdated/unreadable format are discarded (no archiving) and a fresh test game is created.
const WORLD_VERSION = 28;
function newGame(settings: Settings, pw = ''): GameRec {
  const salt = rid(8);
  return { id: rid(4), state: createGame(settings), players: [], gameSalt: salt, gameHash: pw ? hash(pw, salt) : null, nextTurnAt: Date.now() + settings.turnIntervalHours * 3600_000, paused: false, createdAt: Date.now() };
}
let dropped = 0;
for (const f of fs.readdirSync(DATA)) {
  if (f.endsWith('.v1')) { fs.unlinkSync(path.join(DATA, f)); dropped++; continue; }
  if (!f.endsWith('.json')) continue;
  try {
    const g = JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')) as GameRec;
    if (g.state?.world?.v !== WORLD_VERSION) throw new Error('outdated data structure');
    games.set(g.id, g);
  } catch (e) {
    dropped++; fs.unlinkSync(path.join(DATA, f)); console.log('Discarded invalid save ' + f + ': ' + (e as Error).message);
  }
}
if (dropped > 0) {
  const g = newGame({ ...DEFAULT_SETTINGS, name: 'Test game', aiCompanies: 3, seed: Math.floor(Math.random() * 2 ** 31) });
  games.set(g.id, g); save(g); console.log('Created a fresh test game "Test game" (id ' + g.id + ', no password) to replace ' + dropped + ' discarded save(s).');
}
console.log(`Loaded ${games.size} game(s). Admin password: ${process.env.ADMIN_PASSWORD ? '(from ADMIN_PASSWORD)' : "'admin' (set ADMIN_PASSWORD to change)"}`);

// ---- turn handling
function playTurn(g: GameRec, why: string) {
  processTurn(g.state);
  g.nextTurnAt = Date.now() + g.state.settings.turnIntervalHours * 3600_000;
  save(g);
  console.log(`[${g.state.settings.name}] turn ${g.state.turn} played (${why})`);
}
function checkReady(g: GameRec) {
  const s = g.state; if (s.finished || g.paused || !s.settings.advanceWhenReady) return;
  const humans = s.companies.filter(c => !c.isAI && !c.bankrupt);
  if (humans.length > 0 && humans.every(c => c.ready)) playTurn(g, 'all players ready');
}
setInterval(() => {
  const now = Date.now();
  for (const g of games.values()) if (!g.state.finished && !g.paused && now >= g.nextTurnAt) playTurn(g, 'daily timer');
}, 5000);

// ---- http
const app = express();
app.use(express.json({ limit: '100kb' }));

const wrap = (fn: express.RequestHandler): express.RequestHandler => (req, res, next) => { try { fn(req, res, next); } catch (e: any) { console.error(e); res.status(500).json({ error: String(e?.message ?? e) }); } };

function adminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const t = req.header('x-admin-token'); const exp = t ? adminTokens.get(t) : undefined;
  if (!exp || exp < Date.now()) return void res.status(401).json({ error: 'Admin login required' });
  next();
}
function playerAuth(req: express.Request): { g: GameRec; p: PlayerRec } | null {
  const g = games.get(String(req.params.id)); const tok = (req.header('authorization') ?? '').replace(/^Bearer /, '');
  if (!g || !tok) return null;
  const p = g.players.find(x => safeEq(x.token, tok)); if (!p) return null;
  p.lastSeen = Date.now(); return { g, p };
}

// admin
app.post('/api/admin/login', wrap((req, res) => {
  const pw = String(req.body?.password ?? '');
  if (!safeEq(hash(pw, 'admin'), hash(ADMIN_PASSWORD, 'admin'))) return void res.status(403).json({ error: 'Wrong password' });
  const t = rid(); adminTokens.set(t, Date.now() + 24 * 3600_000); res.json({ token: t });
}));
const adminGameInfo = (g: GameRec) => ({
  id: g.id, name: g.state.settings.name, turn: g.state.turn, finished: g.state.finished, paused: g.paused, nextTurnAt: g.nextTurnAt, settings: g.state.settings,
  hasPassword: !!g.gameHash, createdAt: g.createdAt,
  players: g.players.map(p => { const c = g.state.companies.find(x => x.id === p.companyId); return { id: p.id, name: p.name, company: c?.name, ready: c?.ready, bankrupt: c?.bankrupt, lastSeen: p.lastSeen }; }),
  ais: g.state.companies.filter(c => c.isAI).map(c => ({ name: c.name, bankrupt: c.bankrupt })),
});
app.get('/api/admin/games', adminAuth, wrap((_req, res) => res.json([...games.values()].map(adminGameInfo))));
app.post('/api/admin/games', adminAuth, wrap((req, res) => {
  const b = req.body ?? {}; const d = DEFAULT_SETTINGS;
  const n = (v: any, def: number, lo: number, hi: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : def; };
  const settings: Settings = {
    name: String(b.name ?? '').trim().slice(0, 40) || 'New game',
    startCash: n(b.startCash, d.startCash, 100_000, 100_000_000), startYear: Math.round(n(b.startYear, d.startYear, 1900, 2100)),
    maxMonths: Math.round(n(b.maxMonths, d.maxMonths, 6, 1200)), targetNetWorth: n(b.targetNetWorth, d.targetNetWorth, 0, 1e12),
    aiCompanies: Math.round(n(b.aiCompanies, d.aiCompanies, 0, 8)), aiSkill: n(b.aiSkill, 1, 0.5, 1.5),
    cityCount: Math.round(n(b.cityCount, d.cityCount, 3, 16)), maxPlayers: Math.round(n(b.maxPlayers, d.maxPlayers, 1, 12)),
    turnIntervalHours: n(b.turnIntervalHours, 24, 0.01, 24 * 30), advanceWhenReady: b.advanceWhenReady !== false,
    seed: b.seed ? Math.round(n(b.seed, 1, 1, 2 ** 31)) : Math.floor(Math.random() * 2 ** 31), events: b.events !== false,
  };
  const salt = rid(8); const pw = String(b.gamePassword ?? '');
  const g: GameRec = { id: rid(4), state: createGame(settings), players: [], gameSalt: salt, gameHash: pw ? hash(pw, salt) : null, nextTurnAt: Date.now() + settings.turnIntervalHours * 3600_000, paused: false, createdAt: Date.now() };
  games.set(g.id, g); save(g); res.json(adminGameInfo(g));
}));
app.patch('/api/admin/games/:id', adminAuth, wrap((req, res) => {
  const g = games.get(String(req.params.id)); if (!g) return void res.status(404).json({ error: 'No such game' });
  const b = req.body ?? {};
  if (typeof b.paused === 'boolean') { g.paused = b.paused; if (!b.paused) g.nextTurnAt = Date.now() + g.state.settings.turnIntervalHours * 3600_000; }
  if (typeof b.turnIntervalHours === 'number' && b.turnIntervalHours > 0) { g.state.settings.turnIntervalHours = b.turnIntervalHours; g.nextTurnAt = Date.now() + b.turnIntervalHours * 3600_000; }
  if (typeof b.advanceWhenReady === 'boolean') g.state.settings.advanceWhenReady = b.advanceWhenReady;
  if (typeof b.gamePassword === 'string') g.gameHash = b.gamePassword ? hash(b.gamePassword, g.gameSalt) : null;
  if (typeof b.name === 'string' && b.name.trim()) g.state.settings.name = b.name.trim().slice(0, 40);
  save(g); res.json(adminGameInfo(g));
}));
app.post('/api/admin/games/:id/turn', adminAuth, wrap((req, res) => { const g = games.get(String(req.params.id)); if (!g) return void res.status(404).json({ error: 'No such game' }); playTurn(g, 'admin'); res.json(adminGameInfo(g)); }));
app.post('/api/admin/games/:id/kick', adminAuth, wrap((req, res) => {
  const g = games.get(String(req.params.id)); if (!g) return void res.status(404).json({ error: 'No such game' });
  const i = g.players.findIndex(p => p.id === req.body?.playerId); if (i >= 0) { const c = g.state.companies.find(x => x.id === g.players[i].companyId); if (c) { c.bankrupt = true; for (const b of Object.values(g.state.buildings)) if (b.owner === c.id) delete g.state.buildings[b.id]; for (const [k, l] of Object.entries(g.state.lots)) if (l.owner === c.id) delete g.state.lots[k]; } g.players.splice(i, 1); save(g); }
  res.json(adminGameInfo(g));
}));
app.delete('/api/admin/games/:id', adminAuth, wrap((req, res) => { games.delete(String(req.params.id)); dirty.delete(String(req.params.id)); fs.rmSync(path.join(DATA, String(req.params.id) + '.json'), { force: true }); res.json({ ok: true }); }));

// public
app.get('/api/games/:id/world', wrap((req, res) => {
  const a = playerAuth(req); if (!a) return void res.status(401).json({ error: 'Not logged in' });
  const w = a.g.state.world!; res.set('cache-control', 'private, max-age=3600'); res.json({ id: a.g.id, w: w.w, h: w.h, tiles: w.tiles, rails: w.rails ?? [] });
}));
app.get('/api/games', wrap((_req, res) => res.json([...games.values()].map(g => ({
  id: g.id, name: g.state.settings.name, date: g.state.finished ? 'finished' : undefined, turn: g.state.turn, players: g.players.length, maxPlayers: g.state.settings.maxPlayers,
  hasPassword: !!g.gameHash, finished: g.state.finished, paused: g.paused, ai: g.state.settings.aiCompanies, maxMonths: g.state.settings.maxMonths,
})))));
app.post('/api/games/:id/join', wrap((req, res) => {
  const g = games.get(String(req.params.id)); if (!g) return void res.status(404).json({ error: 'No such game' });
  const b = req.body ?? {}; const name = String(b.name ?? '').trim().slice(0, 24); const pw = String(b.password ?? '');
  if (!name || pw.length < 3) return void res.status(400).json({ error: 'Name and a password of at least 3 characters are required' });
  const existing = g.players.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    if (!safeEq(hash(pw, existing.salt), existing.hash)) return void res.status(403).json({ error: 'Wrong player password' });
    existing.lastSeen = Date.now(); return void res.json({ token: existing.token });
  }
  if (g.state.finished) return void res.status(400).json({ error: 'Game is finished' });
  if (g.gameHash && !safeEq(hash(String(b.gamePassword ?? ''), g.gameSalt), g.gameHash)) return void res.status(403).json({ error: 'Wrong game password' });
  if (g.players.length >= g.state.settings.maxPlayers) return void res.status(400).json({ error: 'Game is full' });
  const company = addCompany(g.state, { name: String(b.companyName ?? '').trim().slice(0, 30) || `${name} Corp.`, playerId: name, portrait: Number.isInteger(b.portrait) ? b.portrait % 72 : undefined, color: /^#[0-9a-f]{6}$/i.test(b.color ?? '') ? b.color : undefined });
  const salt = rid(8); const p: PlayerRec = { id: rid(4), name, salt, hash: hash(pw, salt), token: rid(), companyId: company.id, lastSeen: Date.now() };
  g.players.push(p); g.state.news.push({ turn: g.state.turn, text: `${company.name} (${name}) enters the market.`, kind: 'info' }); save(g);
  res.json({ token: p.token });
}));
app.get('/api/games/:id/view', wrap((req, res) => {
  const a = playerAuth(req); if (!a) return void res.status(401).json({ error: 'Not logged in' });
  res.json(buildView(a.g, a.p.companyId));
}));
app.post('/api/games/:id/action', wrap((req, res) => {
  const a = playerAuth(req); if (!a) return void res.status(401).json({ error: 'Not logged in' });
  const act = req.body as Action; if (!act || typeof act.type !== 'string') return void res.status(400).json({ error: 'Bad action' });
  const r = applyAction(a.g.state, a.p.companyId, act);
  if ('error' in r) return void res.status(400).json({ error: r.error });
  save(a.g); res.json({ ok: true, info: r.info, view: buildView(a.g, a.p.companyId) });
}));
app.post('/api/games/:id/ready', wrap((req, res) => {
  const a = playerAuth(req); if (!a) return void res.status(401).json({ error: 'Not logged in' });
  const c = a.g.state.companies.find(x => x.id === a.p.companyId)!; c.ready = !!req.body?.ready; save(a.g);
  if (req.body?.force && !a.g.state.finished && !a.g.paused) playTurn(a.g, 'debug: forced by ' + a.p.name); else checkReady(a.g); res.json({ view: buildView(a.g, a.p.companyId) });
}));

// static client (production)
const dist = path.join(ROOT, 'dist');
if (fs.existsSync(dist)) { app.use(express.static(dist)); }
app.listen(PORT, () => console.log(`Capital server on http://localhost:${PORT}`));
process.on('SIGINT', () => { flush(); process.exit(0); });
process.on('SIGTERM', () => { flush(); process.exit(0); });
