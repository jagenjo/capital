import { h, toast, asset } from './util.js';
import { adminApi } from './api.js';

let token = sessionStorage.getItem('capital.admin') ?? '';
const api = adminApi(() => token);
const app = document.getElementById('app')!;

function loginScreen() {
  const pw = h('input', { type: 'password', placeholder: 'Admin password' });
  const go = async () => {
    try { token = (await api.login(pw.value)).token; sessionStorage.setItem('capital.admin', token); panel(); } catch (e: any) { toast(e.message, 'err'); }
  };
  pw.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  app.replaceChildren(h('div', { class: 'content' }, h('div', { class: 'panel col', style: 'max-width:380px;margin:60px auto' },
    h('h1', null, 'Capital — admin'), h('div', { class: 'note' }, 'Default password is "admin" unless the ADMIN_PASSWORD environment variable is set.'), pw,
    h('div', { class: 'row' }, h('button', { class: 'primary', onclick: go }, 'Log in'), h('a', { href: '/' }, 'Back to game')))));
}

const field = (label: string, input: HTMLElement, hint = '') => [h('label', { class: 'muted' }, label), h('div', null, input, hint && h('span', { class: 'note', style: 'margin-left:8px' }, hint))];

async function panel() {
  let games: any[] = [];
  try { games = await api.list(); } catch (e: any) { token = ''; sessionStorage.removeItem('capital.admin'); toast(e.message, 'err'); return loginScreen(); }

  const f = {
    name: h('input', { type: 'text', value: 'Friday Game', style: 'width:220px' }),
    gamePassword: h('input', { type: 'text', placeholder: '(none = open game)', style: 'width:220px' }),
    startCash: h('input', { type: 'number', value: 1000000, step: 100000 }),
    startYear: h('input', { type: 'number', value: 1995 }),
    maxMonths: h('input', { type: 'number', value: 120 }),
    targetNetWorth: h('input', { type: 'number', value: 10000000, step: 1000000 }),
    aiCompanies: h('input', { type: 'number', value: 3, min: 0, max: 8 }),
    aiSkill: h('input', { type: 'number', value: 1, step: 0.1, min: 0.5, max: 1.5 }),
    cityCount: h('input', { type: 'number', value: 8, min: 3, max: 16 }),
    maxPlayers: h('input', { type: 'number', value: 6, min: 1, max: 12 }),
    turnIntervalHours: h('input', { type: 'number', value: 24, step: 1 }),
    advanceWhenReady: h('input', { type: 'checkbox', checked: true }),
    events: h('input', { type: 'checkbox', checked: true }),
    seed: h('input', { type: 'number', placeholder: 'random' }),
  };
  const create = async () => {
    const body: any = {};
    for (const [k, el] of Object.entries(f)) body[k] = (el as HTMLInputElement).type === 'checkbox' ? (el as HTMLInputElement).checked : (el as HTMLInputElement).value;
    try { await api.create(body); toast('Game created', 'ok'); panel(); } catch (e: any) { toast(e.message, 'err'); }
  };

  const createPanel = h('div', { class: 'panel' }, h('h2', null, 'Create new game'),
    h('div', { class: 'kv', style: 'grid-template-columns:220px 1fr' },
      ...field('Game name', f.name), ...field('Join password', f.gamePassword, 'players need this to join'),
      ...field('Starting cash ($)', f.startCash), ...field('Start year', f.startYear),
      ...field('Game length (months)', f.maxMonths, 'turns until the game ends'), ...field('Net worth goal ($)', f.targetNetWorth, '0 = disabled'),
      ...field('AI companies', f.aiCompanies), ...field('AI skill', f.aiSkill, '0.5 easy … 1.5 hard'),
      ...field('Cities', f.cityCount), ...field('Max players', f.maxPlayers),
      ...field('Auto-turn every (hours)', f.turnIntervalHours, '24 = one month per day'),
      ...field('Play turn when all ready', f.advanceWhenReady, 'otherwise wait for the timer'),
      ...field('Random events', f.events), ...field('Map seed', f.seed)),
    h('div', { style: 'margin-top:12px' }, h('button', { class: 'primary', onclick: create }, 'Create game')));

  const gameCard = (g: any) => {
    const left = g.nextTurnAt ? Math.max(0, g.nextTurnAt - Date.now()) : 0;
    const pw = h('input', { type: 'text', placeholder: g.hasPassword ? 'new join password' : 'set join password', style: 'width:160px' });
    const hrs = h('input', { type: 'number', value: g.settings.turnIntervalHours, style: 'width:70px' });
    const link = `${location.origin}/`;
    return h('div', { class: 'panel col' },
      h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, g.name), h('span', { class: 'pill' }, `id ${g.id}`), h('span', { class: 'pill' }, g.finished ? 'finished' : g.paused ? 'paused' : 'running'),
        h('span', { class: 'muted' }, `turn ${g.turn}/${g.settings.maxMonths}`), g.hasPassword ? h('span', { class: 'pill' }, '🔒 password') : h('span', { class: 'pill' }, 'open'),
        !g.finished && !g.paused && h('span', { class: 'muted' }, `next auto-turn in ${Math.floor(left / 3600000)}h ${Math.floor(left / 60000) % 60}m`)),
      h('table', null, h('thead', null, h('tr', null, ['Player', 'Company', 'Ready', 'Last seen', ''].map(x => h('th', null, x)))),
        h('tbody', null, g.players.length === 0 ? h('tr', null, h('td', { colSpan: 5, class: 'muted' }, 'No players yet. Share ' + link)) :
          g.players.map((p: any) => h('tr', null, h('td', null, p.name), h('td', null, p.company + (p.bankrupt ? ' (bankrupt)' : '')), h('td', null, p.ready ? '✔' : '–'),
            h('td', null, p.lastSeen ? new Date(p.lastSeen).toLocaleString() : ''),
            h('td', null, h('button', { class: 'danger', onclick: async () => { if (confirm(`Remove ${p.name} and liquidate their company?`)) { await api.kick(g.id, p.id); panel(); } } }, 'Remove')))))),
      h('div', { class: 'note' }, `AI: ${g.ais.map((a: any) => a.name + (a.bankrupt ? ' ✗' : '')).join(', ') || 'none'} · ${g.settings.cityCount} cities · seed ${g.settings.seed}`),
      h('div', { class: 'row' },
        h('button', { class: 'primary', disabled: g.finished, onclick: async () => { await api.turn(g.id); toast('Turn played', 'ok'); panel(); } }, 'Play turn now'),
        h('button', { disabled: g.finished, onclick: async () => { await api.patch(g.id, { paused: !g.paused }); panel(); } }, g.paused ? 'Resume' : 'Pause'),
        pw, h('button', { onclick: async () => { await api.patch(g.id, { gamePassword: pw.value }); toast('Password updated', 'ok'); panel(); } }, 'Set password'),
        h('span', { class: 'muted' }, 'Auto-turn h:'), hrs, h('button', { onclick: async () => { await api.patch(g.id, { turnIntervalHours: +hrs.value }); panel(); } }, 'Apply'),
        h('button', { onclick: async () => { await api.patch(g.id, { advanceWhenReady: !g.settings.advanceWhenReady }); panel(); } }, g.settings.advanceWhenReady ? 'Ready-advance: ON' : 'Ready-advance: OFF'),
        h('span', { class: 'grow' }),
        h('button', { class: 'danger', onclick: async () => { if (confirm(`Delete "${g.name}" permanently?`)) { await api.del(g.id); panel(); } } }, 'Delete')));
  };

  app.replaceChildren(h('div', { class: 'content col' },
    h('div', { class: 'row' }, h('img', { src: asset('title/gameset.jpg'), style: 'height:60px;border:1px solid #bbb' }), h('h1', { style: 'margin:0' }, 'Capital — admin panel'), h('span', { class: 'grow' }),
      h('a', { href: '/' }, '← Game'), h('button', { onclick: () => { token = ''; sessionStorage.removeItem('capital.admin'); loginScreen(); } }, 'Log out')),
    createPanel, h('h2', null, `Games (${games.length})`), ...games.map(gameCard), games.length === 0 && h('div', { class: 'muted' }, 'No games yet.')));
}

token ? panel() : loginScreen();
setInterval(() => { if (token && !document.querySelector('input:focus')) panel(); }, 30000);
