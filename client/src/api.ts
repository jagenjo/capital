import type { View, Action } from '../../shared/types.js';
async function call(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}
export const api = {
  games: () => call('GET', '/api/games'),
  join: (id: string, body: unknown) => call('POST', `/api/games/${id}/join`, body) as Promise<{ token: string }>,
  world: (id: string, token: string) => call('GET', '/api/games/' + id + '/world', undefined, { authorization: 'Bearer ' + token }) as Promise<{ id: string; rev: number; w: number; h: number; tiles: string; qual?: string; rails: { a: number; b: number; tiles: number[] }[] }>,
  view: (id: string, token: string) => call('GET', `/api/games/${id}/view`, undefined, { authorization: 'Bearer ' + token }) as Promise<View>,
  action: (id: string, token: string, a: Action) => call('POST', `/api/games/${id}/action`, a, { authorization: 'Bearer ' + token }) as Promise<{ ok: true; info?: string; view: View }>,
  tile: (id: string, token: string, idx: number) => call('GET', `/api/games/${id}/tile/${idx}`, undefined, { authorization: 'Bearer ' + token }) as Promise<{ turn: number; growth: ReturnType<typeof import('../../shared/engine.js').growthStatus> }>,
  forecast: (id: string, token: string) => call('GET', `/api/games/${id}/forecast`, undefined, { authorization: 'Bearer ' + token }) as Promise<Extract<ReturnType<typeof import('../../shared/desk.js').forecast>, { advisor: unknown }>>,
  console: (id: string, token: string, command: string) => call('POST', `/api/games/${id}/console`, { command }, { authorization: 'Bearer ' + token }) as Promise<{ ok: true; output: string[]; view?: View }>,
  suggest: (id: string, token: string, kind: string, text: string) => call('POST', `/api/games/${id}/suggest`, { kind, text }, { authorization: 'Bearer ' + token }) as Promise<{ ok: true }>,
  ready: (id: string, token: string, ready: boolean, force = false) => call('POST', `/api/games/${id}/ready`, { ready, force }, { authorization: 'Bearer ' + token }) as Promise<{ view: View }>,
};
export const adminApi = (token: () => string) => ({
  login: (password: string) => call('POST', '/api/admin/login', { password }) as Promise<{ token: string }>,
  list: () => call('GET', '/api/admin/games', undefined, { 'x-admin-token': token() }),
  suggestions: () => call('GET', '/api/admin/suggestions', undefined, { 'x-admin-token': token() }) as Promise<{ id: string; at: number; game: string; player: string; company: string; kind: string; text: string }[]>,
  delSuggestion: (id: string) => call('DELETE', '/api/admin/suggestions/' + id, undefined, { 'x-admin-token': token() }),
  create: (b: unknown) => call('POST', '/api/admin/games', b, { 'x-admin-token': token() }),
  patch: (id: string, b: unknown) => call('PATCH', `/api/admin/games/${id}`, b, { 'x-admin-token': token() }),
  turn: (id: string) => call('POST', `/api/admin/games/${id}/turn`, {}, { 'x-admin-token': token() }),
  kick: (id: string, playerId: string) => call('POST', `/api/admin/games/${id}/kick`, { playerId }, { 'x-admin-token': token() }),
  del: (id: string) => call('DELETE', `/api/admin/games/${id}`, undefined, { 'x-admin-token': token() }),
});
