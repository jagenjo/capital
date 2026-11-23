import { COMPANY_COLORS } from '../../shared/data.js';
import { h, money, asset, toast, langButton } from './util.js';
import { tr } from './i18n.js';
import { icon } from './icons.js';
import { showTurnSummary } from './turnsummary.js';
import { settingsScreen } from './settings.js';
import { api } from './api.js';
import { S } from './state.js';
import { mapScreen } from './map.js';
import { personImg } from './prodimg.js';
import { makeWorldImage, findResources, restoreMapState, saveMapState } from './worldmap.js';
import { chainScreen } from './chain.js';
import { buildingsScreen, marketHub, financeScreen, rankingsScreen } from './tabs.js';
import { marketingScreen } from './advertising.js';
import { newsScreen } from './news.js';
import { encyclopediaScreen } from './encyclopedia.js';
import { stocksScreen } from './stocks.js';
import { personnelScreen } from './personnel.js';
import { realEstateScreen } from './realestate.js';
import { analyticsScreen } from './analytics.js';
import { unreadCount } from './messages.js';
import { deskScreen, deskCount, runForecast } from './desk.js';

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
    const im = personImg(i, 40, 'border:2px solid transparent;cursor:pointer', i === portrait ? 'sel' : ''); im.addEventListener('click', () => { portrait = i; portraits.querySelectorAll('.pimg').forEach((x, j) => x.classList.toggle('sel', j === i)); }); return im;
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
    h('div', { class: 'title' }, h('img', { src: asset('title/corp-1.jpg') }), h('div', null, h('h1', null, 'CAPITAL'), h('div', { class: 'muted' }, 'A turn-based multiplayer business game. One turn = one month.'), h('a', { href: '/admin.html' }, 'Admin panel → create a game'), h('div', { style: 'margin-top:6px' }, langButton(lobby)))),
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
  restored = restoreMapState(gameId); S.sel = restored.sel; S.buildingId = restored.building; // last clicked tile and map position
  try { await refresh(true); } catch (e: any) { toast(e.message, 'err'); delete tokens[gameId]; saveTokens(); return lobby(); }
  clearInterval(timer); timer = window.setInterval(() => refresh(false).catch(() => {}), 5000);
}
let restored: ReturnType<typeof restoreMapState> = { sel: null, building: null, city: null };
async function refresh(first: boolean) {
  const v = await api.view(S.gameId, S.token);
  S.offset = v.serverNow - Date.now();
  if (!S.world || S.world.id !== v.worldId || S.world.rev !== v.worldRev) { const w = await api.world(S.gameId, S.token); S.world = { ...w, img: makeWorldImage(w.w, w.h, w.tiles, w.rails), res: findResources(w.tiles) }; }
  const changed = lastTurn >= 0 && v.turn !== lastTurn;
  if (first) {
    S.city = v.cities.reduce((best, c) => c.pop > v.cities[best].pop ? c.id : best, 0);
    if (restored.city != null && v.cities[restored.city]) S.city = restored.city;
    if (S.buildingId && !v.buildings.some(b => b.id === S.buildingId)) S.buildingId = null; // the building is gone: keep just the tile
  }
  // avoid wiping the UI while the player is typing
  const typing = document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName) && !first && !changed;
  const oldUnread = S.view ? unreadCount() : 0; S.view = v; lastTurn = v.turn;
  if (!first && unreadCount() > oldUnread) toast('New message received', 'ok');
  if (changed) { toast(`A new month begins: ${v.date}`, 'ok'); showTurnSummary(v); }
  if (!typing) render(); else updateTop();
  saveMapState();
}

const TABS: [string, string][] = [['map', 'Map'], ['desk', 'Desk'], ['buildings', 'My buildings'], ['chain', 'Supply chain'], ['market', 'Market'], ['personnel', 'Personnel'], ['finance', 'Finance'], ['analytics', 'Analytics'], ['stocks', 'Stock market'], ['realestate', 'Real estate'], ['marketing', 'Advertising'], ['rankings', 'Competitors'], ['news', 'News'], ['encyclopedia', 'Encyclopedia'], ['settings', 'Settings']];
let navScroll = 0, navTab = '', navFit: () => void = () => {}; // scroll position of the tab strip, kept across refreshes
addEventListener('resize', () => navFit());
const KEEP_SCROLL = '[data-keep], .area, .cfg.scroll, .tabbody, .portraits';
function render() {
  const v = S.view; if (!v) return;
  const me = v.me;
  const readyBtn = h('button', { class: me.ready ? '' : 'primary', disabled: v.finished || v.paused, title: 'Shift+click: debug — play the turn right now', onclick: async (e: MouseEvent) => { try { endingTurn = !me.ready || e.shiftKey; render(); S.view = (await api.ready(S.gameId, S.token, e.shiftKey ? true : !me.ready, e.shiftKey)).view; endingTurn = false; render(); } catch (e: any) { endingTurn = false; toast(e.message, 'err'); render(); } } },
    me.ready ? [icon('ready'), 'Ready — click to unready'] : ['End turn', icon('next')]);
  const top = h('div', { class: 'topbar' },
    personImg(me.portrait, 36, `border:2px solid ${me.color}`, 'portrait'),
    h('div', { class: 'stat' }, h('b', null, me.name), h('small', null, v.gameName)),
    h('div', { class: 'stat' }, h('b', null, icon('clock'), v.date), h('small', null, `turn ${v.turn}/${v.settings.maxMonths}`)),
    h('div', { class: 'stat' }, h('b', { style: me.cash < 0 ? 'color:#ff8d85' : '' }, money(me.cash)), h('small', null, icon('cash'), 'cash')),
    h('div', { class: 'stat' }, h('b', null, money(me.netWorth)), h('small', null, icon('worth'), 'net worth')),
    h('div', { class: 'stat' }, h('b', null, money(me.debt)), h('small', null, icon('debt'), 'debt')),
    waitingTurn() ? h('div', { class: 'stat waiting' }, h('b', null, icon('clock'), 'Waiting turn to end…'), h('small', null, 'the turn is being played')) : h('div', { class: 'stat' }, h('b', { id: 'countdown' }, countdown()), h('small', null, v.paused ? 'paused' : 'next auto-turn')),
    h('div', { class: 'stat' }, h('b', null, `${v.companies.filter(c => !c.isAI && c.ready).length}/${v.companies.filter(c => !c.isAI && !c.bankrupt).length}`), h('small', null, icon('personnel'), 'players ready')),
    h('span', { class: 'grow' }), h('button', { title: me.staff?.some(x => x.kind === 'advisor') ? 'Your advisor plays the coming month on a copy of the game to see what would happen' : 'Forecasts are prepared by an advisor: hire one in the Personnel tab', disabled: v.finished || !me.staff?.some(x => x.kind === 'advisor'), onclick: () => { S.tab = 'desk'; runForecast(); } }, icon('analytics'), 'Forecast'), readyBtn, h('button', { onclick: lobby }, icon('leave'), 'Leave'));
  const tabs = h('div', { class: 'nav' }, TABS.map(([k, label]) => h('button', { class: S.tab === k ? 'active' : '', onclick: () => { S.tab = k; render(); } }, icon(k), label, k === 'rankings' && unreadCount() > 0 ? h('span', { class: 'badge', title: 'Unread messages from competitors' }, '✉ ' + unreadCount()) : k === 'desk' && deskCount() > 0 ? h('span', { class: 'badge' }, String(deskCount())) : null)));
  const banner = v.finished ? h('div', { class: 'banner end' }, `🏁 Game over — ${v.endReason ?? ''} Winner: `, h('b', null, v.companies.find(c => c.id === v.winner)?.name ?? '—'))
    : me.mergedInto ? h('div', { class: 'banner' }, `${v.companies.find(c => c.id === me.mergedInto)?.name ?? 'A rival'} bought more than half of your shares and took over your company.`) : me.bankrupt ? h('div', { class: 'banner' }, 'Your company went bankrupt.') : null;
  const body = ({ desk: deskScreen, map: mapScreen, buildings: buildingsScreen, chain: chainScreen, market: marketHub, finance: financeScreen, analytics: analyticsScreen, stocks: stocksScreen, personnel: personnelScreen, realestate: realEstateScreen, marketing: marketingScreen, rankings: rankingsScreen, news: newsScreen, encyclopedia: encyclopediaScreen, settings: settingsScreen } as Record<string, () => HTMLElement>)[S.tab]();
  const sy = window.scrollY, oldC = app.querySelector<HTMLElement>('.content'), st = oldC && oldC.dataset.tab === S.tab ? oldC.scrollTop : 0; // the scrolling box is .content: keep its position across re-renders (5s polling)
  const content = h('div', { class: S.tab === 'map' ? 'content wide' : 'content', 'data-tab': S.tab }, body);
  // inner scrolling boxes (encyclopedia, supply chain, lists...) are rebuilt on every refresh: put each one back where it was
  const keyed = (root: ParentNode) => { const seen: Record<string, number> = {}; return [...root.querySelectorAll<HTMLElement>(KEEP_SCROLL)].map(e => { const sig = e.dataset.keep ?? e.className; return { e, key: sig + '#' + (seen[sig] = (seen[sig] ?? -1) + 1) }; }); };
  const kept = new Map(oldC && oldC.dataset.tab === S.tab ? keyed(oldC).map(x => [x.key, [x.e.scrollTop, x.e.scrollLeft] as [number, number]] as const) : []);
  // when the window is too narrow for all the tabs, arrows at both ends scroll them
  const arrow = (dir: -1 | 1) => h('button', { class: 'navarrow', title: dir < 0 ? 'Scroll tabs left' : 'Scroll tabs right', onclick: () => tabs.scrollBy({ left: dir * 220, behavior: 'smooth' }) }, dir < 0 ? '◀' : '▶');
  const left = arrow(-1), right = arrow(1), nav = h('div', { class: 'navbar' }, left, tabs, right);
  tabs.addEventListener('scroll', () => { navScroll = tabs.scrollLeft; fitNav(); });
  tabs.addEventListener('wheel', (e: WheelEvent) => { if (tabs.scrollWidth > tabs.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { tabs.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  const fitNav = () => { const over = tabs.scrollWidth > tabs.clientWidth + 1; left.style.display = right.style.display = over ? '' : 'none'; left.disabled = tabs.scrollLeft <= 0; right.disabled = tabs.scrollLeft + tabs.clientWidth >= tabs.scrollWidth - 1; };
  navFit = fitNav;
  app.replaceChildren(top, nav, ...(banner ? [banner] : []), content);
  tabs.scrollLeft = navScroll; if (navTab !== S.tab) { navTab = S.tab; tabs.querySelector<HTMLElement>('button.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } // only when the tab changed: refreshes must not undo the player's scrolling
  navScroll = tabs.scrollLeft; fitNav();
  content.scrollTop = st; window.scrollTo(0, sy);
  for (const { e, key } of keyed(content)) { const k = kept.get(key); if (k) { e.scrollTop = k[0]; e.scrollLeft = k[1]; } }
}
S.render = render;
let endingTurn = false;
/** The turn is about to end / being played: our End-turn request is in flight, every human is ready, or the auto-turn time has passed. */
function waitingTurn(): boolean {
  const v = S.view!; if (v.finished || v.paused) return false;
  const humans = v.companies.filter(c => !c.isAI && !c.bankrupt);
  return endingTurn || (humans.length > 0 && humans.every(c => c.ready)) || (!!v.nextTurnAt && Date.now() + S.offset >= v.nextTurnAt);
}
function countdown() {
  const v = S.view!; if (!v.nextTurnAt) return '—';
  const ms = Math.max(0, v.nextTurnAt - (Date.now() + S.offset)); const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)}h ${String(Math.floor(s / 60) % 60).padStart(2, '0')}m ${String(s % 60).padStart(2, '0')}s`;
}
function updateTop() { const el = document.getElementById('countdown'); if (el && S.view) { if (waitingTurn()) render(); else el.textContent = countdown(); } }
setInterval(updateTop, 1000);

let rz: number | undefined;
window.addEventListener('resize', () => { clearTimeout(rz); rz = window.setTimeout(() => { if (S.view && S.tab === 'map') render(); }, 200); });

lobby();
