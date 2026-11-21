import { COMPANY_COLORS } from '../../shared/data.js';
import { h, money, asset, toast } from './util.js';
import { api } from './api.js';
import { S } from './state.js';
import { mapScreen } from './map.js';
import { makeWorldImage, findResources } from './worldmap.js';
import { chainScreen } from './chain.js';
import { buildingsScreen, marketScreen, worldScreen, financeScreen, marketingScreen, rankingsScreen } from './tabs.js';
import { newsScreen } from './news.js';
import { encyclopediaScreen } from './encyclopedia.js';
import { stocksScreen } from './stocks.js';
import { personnelScreen } from './personnel.js';
import { realEstateScreen } from './realestate.js';

const app = document.getElementById('app')!;
const tokens: Record<string, string> = JSON.parse(localStorage.getItem('capital.tokens') ?? '{}');
const saveTokens = () => localStorage.setItem('capital.tokens', JSON.stringify(tokens));
const nameStore = () => localStorage.getItem('capital.name') ?? '';
let lastTurn = -1;
let timer: number | undefined;

// ------------------------------------------------------------------ lobby
async function lobby() {
  S.view = null; clearInterval(timer);
  let games: any[] = [];
  try { games = await api.games(); } catch (e: any) { toast(e.message, 'err'); }
  const name = h('input', { type: 'text', placeholder: 'Your name', value: nameStore() });
  const pw = h('input', { type: 'password', placeholder: 'Your password' });
  const gpw = h('input', { type: 'password', placeholder: 'Game password (if any)' });
  const comp = h('input', { type: 'text', placeholder: 'Company name (new players)' });
  let portrait = Math.floor(Math.random() * 72); let color = COMPANY_COLORS[Math.floor(Math.random() * COMPANY_COLORS.length)];
  const portraits = h('div', { class: 'portraits' }, Array.from({ length: 72 }, (_, i) => {
    const im = h('img', { src: asset(`person/${String(i).padStart(2, '0')}.png`), class: i === portrait ? 'sel' : '', onclick: () => { portrait = i; portraits.querySelectorAll('img').forEach((x, j) => x.classList.toggle('sel', j === i)); } }); return im;
  }));
  const colors = h('div', { class: 'row' }, COMPANY_COLORS.map(c => h('span', { style: `width:22px;height:22px;background:${c};cursor:pointer;border:2px solid ${c === color ? '#000' : 'transparent'}`, onclick: (e: Event) => { color = c; colors.querySelectorAll('span').forEach(s => ((s as HTMLElement).style.borderColor = 'transparent')); (e.target as HTMLElement).style.borderColor = '#000'; } })));

  const join = async (g: any) => {
    if (!name.value.trim() || pw.value.length < 3) return toast('Enter your name and a password (3+ characters). New name = new player; same name + password = log back in.', 'err');
    try {
      const r = await api.join(g.id, { name: name.value, password: pw.value, gamePassword: gpw.value, companyName: comp.value, portrait, color });
      tokens[g.id] = r.token; saveTokens(); localStorage.setItem('capital.name', name.value); enter(g.id);
    } catch (e: any) { toast(e.message, 'err'); }
  };

  app.replaceChildren(h('div', { class: 'login' },
    h('div', { class: 'title' }, h('img', { src: asset('title/corp-1.jpg') }), h('div', null, h('h1', null, 'CAPITAL'), h('div', { class: 'muted' }, 'A turn-based multiplayer business game. One turn = one month.'), h('a', { href: '/admin.html' }, 'Admin panel → create a game'))),
    h('div', { class: 'grid2' },
      h('div', { class: 'panel col' }, h('h2', null, 'Player'), name, pw, gpw, comp, h('h3', null, 'CEO portrait'), portraits, h('h3', null, 'Company colour'), colors,
        h('div', { class: 'note' }, 'Your name + password identify you in a game. Use them again to continue later from any browser.')),
      h('div', { class: 'panel col' }, h('h2', null, 'Games'), games.length === 0 ? h('div', { class: 'muted' }, 'No games yet — open the admin panel to create one.') :
        games.map(g => h('div', { class: 'row', style: 'border-bottom:1px solid #e3e3dc;padding:6px 0' },
          h('div', { class: 'grow' }, h('b', null, g.name), g.hasPassword && ' 🔒', h('div', { class: 'note' }, `turn ${g.turn}/${g.maxMonths} · ${g.players}/${g.maxPlayers} players · ${g.ai} AI${g.paused ? ' · paused' : ''}${g.finished ? ' · finished' : ''}`)),
          tokens[g.id] && h('button', { onclick: () => enter(g.id) }, 'Continue'), h('button', { class: 'primary', onclick: () => join(g) }, 'Join / log in')))))));
}

// ------------------------------------------------------------------ game
async function enter(gameId: string) {
  S.gameId = gameId; S.token = tokens[gameId]; S.tab = 'map'; S.sel = null; S.buildingId = null; lastTurn = -1;
  try { await refresh(true); } catch (e: any) { toast(e.message, 'err'); delete tokens[gameId]; saveTokens(); return lobby(); }
  clearInterval(timer); timer = window.setInterval(() => refresh(false).catch(() => {}), 5000);
}
async function refresh(first: boolean) {
  const v = await api.view(S.gameId, S.token);
  S.offset = v.serverNow - Date.now();
  if (!S.world || S.world.id !== v.worldId) { const w = await api.world(S.gameId, S.token); S.world = { ...w, img: makeWorldImage(w.w, w.h, w.tiles, w.rails), res: findResources(w.tiles) }; }
  const changed = lastTurn >= 0 && v.turn !== lastTurn;
  if (first) { S.city = v.cities.reduce((best, c) => c.pop > v.cities[best].pop ? c.id : best, 0); }
  // avoid wiping the UI while the player is typing
  const typing = document.activeElement && ['INPUT', 'SELECT'].includes(document.activeElement.tagName) && !first && !changed;
  S.view = v; lastTurn = v.turn;
  if (changed) toast(`A new month begins: ${v.date}`, 'ok');
  if (!typing) render(); else updateTop();
}

const TABS: [string, string][] = [['map', 'Map & building'], ['buildings', 'My buildings'], ['chain', 'Supply chain'], ['market', 'Local market'], ['world', 'World market'], ['finance', 'Finance'], ['stocks', 'Stock market'], ['personnel', 'Personnel'], ['realestate', 'Real estate'], ['marketing', 'Advertising'], ['rankings', 'Rankings'], ['news', 'News'], ['encyclopedia', 'Encyclopedia']];
function render() {
  const v = S.view; if (!v) return;
  const me = v.me;
  const readyBtn = h('button', { class: me.ready ? '' : 'primary', disabled: v.finished || v.paused, title: 'Shift+click: debug — play the turn right now', onclick: async (e: MouseEvent) => { try { S.view = (await api.ready(S.gameId, S.token, e.shiftKey ? true : !me.ready, e.shiftKey)).view; render(); } catch (e: any) { toast(e.message, 'err'); } } },
    me.ready ? '✔ Ready — click to unready' : 'End turn ▶');
  const top = h('div', { class: 'topbar' },
    h('img', { class: 'portrait', src: asset(`person/${String(me.portrait).padStart(2, '0')}.png`), style: `border-color:${me.color}` }),
    h('div', { class: 'stat' }, h('b', null, me.name), h('small', null, v.gameName)),
    h('div', { class: 'stat' }, h('b', null, v.date), h('small', null, `turn ${v.turn}/${v.settings.maxMonths}`)),
    h('div', { class: 'stat' }, h('b', { style: me.cash < 0 ? 'color:#ff8d85' : '' }, money(me.cash)), h('small', null, 'cash')),
    h('div', { class: 'stat' }, h('b', null, money(me.netWorth)), h('small', null, 'net worth')),
    h('div', { class: 'stat' }, h('b', null, money(me.debt)), h('small', null, 'debt')),
    h('div', { class: 'stat' }, h('b', { id: 'countdown' }, countdown()), h('small', null, v.paused ? 'paused' : 'next auto-turn')),
    h('div', { class: 'stat' }, h('b', null, `${v.companies.filter(c => !c.isAI && c.ready).length}/${v.companies.filter(c => !c.isAI && !c.bankrupt).length}`), h('small', null, 'players ready')),
    h('span', { class: 'grow' }), readyBtn, h('button', { onclick: lobby }, 'Leave'));
  const nav = h('div', { class: 'nav' }, TABS.map(([k, label]) => h('button', { class: S.tab === k ? 'active' : '', onclick: () => { S.tab = k; render(); } }, label)));
  const banner = v.finished ? h('div', { class: 'banner end' }, `🏁 Game over — ${v.endReason ?? ''} Winner: `, h('b', null, v.companies.find(c => c.id === v.winner)?.name ?? '—'))
    : me.bankrupt ? h('div', { class: 'banner' }, 'Your company went bankrupt.') : null;
  const body = ({ map: mapScreen, buildings: buildingsScreen, chain: chainScreen, market: marketScreen, world: worldScreen, finance: financeScreen, stocks: stocksScreen, personnel: personnelScreen, realestate: realEstateScreen, marketing: marketingScreen, rankings: rankingsScreen, news: newsScreen, encyclopedia: encyclopediaScreen } as Record<string, () => HTMLElement>)[S.tab]();
  const sy = window.scrollY, oldC = app.querySelector<HTMLElement>('.content'), st = oldC && oldC.dataset.tab === S.tab ? oldC.scrollTop : 0; // the scrolling box is .content: keep its position across re-renders (5s polling)
  const content = h('div', { class: S.tab === 'map' ? 'content wide' : 'content', 'data-tab': S.tab }, body);
  app.replaceChildren(top, nav, ...(banner ? [banner] : []), content);
  content.scrollTop = st; window.scrollTo(0, sy);
}
S.render = render;
function countdown() {
  const v = S.view!; if (!v.nextTurnAt) return '—';
  const ms = Math.max(0, v.nextTurnAt - (Date.now() + S.offset)); const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)}h ${String(Math.floor(s / 60) % 60).padStart(2, '0')}m ${String(s % 60).padStart(2, '0')}s`;
}
function updateTop() { const el = document.getElementById('countdown'); if (el && S.view) el.textContent = countdown(); }
setInterval(updateTop, 1000);

let rz: number | undefined;
window.addEventListener('resize', () => { clearTimeout(rz); rz = window.setTimeout(() => { if (S.view && S.tab === 'map') render(); }, 200); });

lobby();
