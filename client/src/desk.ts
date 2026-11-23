// The Desk: this month's decisions, the end-turn forecast, sealed orders and supply contracts.
import { PRODUCTS, PRODUCT_LIST, type ProductId } from '../../shared/data.js';
import type { Contract, Building, Card } from '../../shared/types.js';
import { h, money, money2, num, cls, toast } from './util.js';
import { S, act, companyOf } from './state.js';
import { api } from './api.js';
import { forecastSkill, forecastError } from '../../shared/desk.js';
import { ADVISOR_SPECS } from '../../shared/engine.js';
import { contractDoc, contractFolder, docOverlay, dateOfTurn, type FolderItem } from './contract.js';

type Forecast = Awaited<ReturnType<typeof api.forecast>>;
let fc: { turn: number; data: Forecast } | null = null; let fcBusy = false;
/** Unanswered decisions + contract offers waiting for me (badge on the Desk tab). */
export const deskCount = () => { const v = S.view; if (!v) return 0; return (v.me.agenda ?? []).filter(k => !k.choice).length + v.contracts.filter(k => k.status === 'offer' && k.to === v.me.id).length; };

export async function runForecast() {
  if (fcBusy) return; fcBusy = true; S.render();
  try { fc = { turn: S.view!.turn, data: await api.forecast(S.gameId, S.token) }; } catch (e: any) { toast(e.message, 'err'); }
  fcBusy = false; S.render();
}

/** Sealed bid: an extra amount offered on top of the price, used when several companies order the same thing this month. */
export const bid = { value: 0 };
export function bidInput(): HTMLElement {
  const inp = h('input', { type: 'number', min: 0, step: 1000, value: bid.value, style: 'width:100px', onchange: (e: Event) => { bid.value = Math.max(0, Math.round(+(e.target as HTMLInputElement).value || 0)); } });
  return h('span', { class: 'row', style: 'gap:4px;flex-wrap:nowrap', title: 'Your order is carried out when the month is played. If rivals order the same thing, the highest bid wins (bids are secret). You only pay the bid if you win.' }, 'Sealed bid +$', inp);
}
/** After an action: tell the player when it became an order instead of happening at once. */
export function orderToast(r: string | null): boolean { if (r && r.startsWith('order:')) { toast('Order placed: it is carried out when the month is played (see Desk).', 'ok'); return true; } return false; }

export function deskScreen(): HTMLElement {
  return h('div', { class: 'col', style: 'gap:12px' },
    h('div', { class: 'grid2' }, decisionsPanel(), forecastPanel()),
    h('div', { class: 'grid2' }, ordersPanel(), contractsPanel()));
}

// ---------------------------------------------------------------- decisions
function decisionsPanel(): HTMLElement {
  const v = S.view!; const cards = v.me.agenda ?? [];
  return h('div', { class: 'panel col' }, h('h2', null, 'Decisions this month'),
    cards.length ? cards.map(k => h('div', { class: 'card' + (k.choice ? '' : ' open') },
      h('b', null, k.title), h('div', null, k.text), k.kind === 'order' ? orderDoc(k) : null,
      h('div', { class: 'row', style: 'gap:6px;margin-top:6px' }, k.options.map(o => h('button', { class: (k.choice ?? '') === o.id ? 'primary' : '', title: o.hint, onclick: () => act({ type: 'answerCard', id: k.id, option: o.id }) }, o.label))),
      h('div', { class: 'note' }, k.options.map(o => h('div', null, h('b', null, o.label), ': ', o.hint))),
      h('div', { class: 'muted small' }, k.choice ? 'Your choice takes effect when the month is played.' : h('span', null, 'If you do nothing: ', h('b', null, k.options.find(o => o.id === k.def)?.label ?? '')))))
      : h('div', { class: 'muted' }, 'Nothing needs your decision this month.'));
}

/** The wholesale customer's draft contract: already signed by the distributor, yours appears once you choose to sign. */
function orderDoc(k: Card): HTMLElement {
  const v = S.view!; const x = k.ctx; const city = v.cities[+x.city]?.name ?? '?'; const qty = +x.qty, price = +x.price;
  return contractDoc({
    title: 'Supply agreement', no: 'DRAFT', turn: v.turn,
    me: { name: v.me.name, seed: v.me.id, signed: k.choice === 'accept', role: 'the Seller' },
    other: { name: 'Distributor in ' + city, seed: 'npc:' + x.city, signed: true, role: 'the Buyer' },
    clauses: [
      ['The Seller delivers ', h('b', null, num(qty) + ' ' + PRODUCTS[x.p as ProductId].name.toLowerCase()), ' every month, from ', h('b', null, bName(String(x.b))), '.'],
      ['The Buyer pays ', h('b', null, money2(price)), ' per unit, ', h('b', null, money(price * qty)), ' a month.'],
      ['Transport is paid by the Seller.'],
      ['This agreement runs for ', h('b', null, x.months + (+x.months > 1 ? ' months' : ' month')), '.'],
      ['For every unit not delivered or not collected, the party at fault pays ', h('b', null, money2(+x.penalty)), '.'],
    ],
  });
}

// ---------------------------------------------------------------- forecast
function forecastPanel(): HTMLElement {
  const v = S.view!; const f = fc && fc.turn === v.turn ? fc.data : null; const L0 = v.me.ledger;
  const btn = h('button', { class: 'primary', disabled: fcBusy, onclick: runForecast }, fcBusy ? 'Calculating…' : f ? 'Recalculate' : 'Forecast this month');
  const adv = v.me.staff?.find(x => x.kind === 'advisor');
  if (!adv) return h('div', { class: 'panel col' }, h('h2', null, 'Forecast'), h('div', { class: 'note' }, 'Forecasts are prepared by your advisor. The better the advisor, the more accurate the figures; a financial advisor is the specialist.'),
    h('div', { class: 'row' }, h('span', { class: 'muted' }, 'You have no advisor.'), h('button', { onclick: () => { S.tab = 'personnel'; S.render(); } }, 'Hire one (Personnel)')));
  const skill = forecastSkill(adv);
  const byLine = h('div', { class: 'small' }, 'Prepared by ', h('b', null, adv.name), ' (' + (ADVISOR_SPECS[adv.spec] ?? adv.spec) + ', skill ' + adv.skill + (adv.spec === 'finance' ? ' +2 as specialist' : '') + ')', ' · figures within about ', h('b', null, '±' + Math.round(forecastError(skill) * 100) + '%'), skill < 8 ? h('span', { class: 'muted' }, ' · may overlook some problems') : null);
  if (!f) return h('div', { class: 'panel col' }, h('h2', null, 'Forecast'), h('div', { class: 'note' }, 'Your advisor plays the coming month on a copy of the game with your current settings and orders, to show what would happen. Rivals\' plans are unknown and random events differ, so it is an estimate.'), byLine, h('div', null, btn));
  const L = f.ledger;
  const row = (label: string, a: number, b?: number) => h('tr', null, h('td', null, label), h('td', { class: 'num ' + cls(a) }, money(a)), h('td', { class: 'num muted' }, b === undefined ? '' : money(b)));
  return h('div', { class: 'panel col' }, h('h2', null, 'Forecast for ' + v.date), h('div', { class: 'row' }, btn, h('span', { class: 'muted small' }, 'Estimate: rivals\' plans and random events are unknown.')), byLine,
    h('div', { class: 'kv' }, h('label', null, 'Cash'), h('div', null, money(f.cash0), ' → ', h('b', { class: cls(f.cash - f.cash0) }, money(f.cash)), ' (' + (f.cash >= f.cash0 ? '+' : '') + money(f.cash - f.cash0) + ')'),
      h('label', null, 'Net worth'), h('div', null, money(f.netWorth0), ' → ', h('b', { class: cls(f.netWorth - f.netWorth0) }, money(f.netWorth)))),
    h('table', null, h('thead', null, h('tr', null, h('th', null, ''), h('th', { class: 'num' }, 'This month'), h('th', { class: 'num' }, 'Last month'))),
      h('tbody', null, row('Revenue', L.revenue, L0?.revenue), row('Purchases', -L.purchases, L0 ? -L0.purchases : undefined), row('Transport', -L.transport, L0 ? -L0.transport : undefined), row('Wages', -L.wages, L0 ? -L0.wages : undefined),
        row('Maintenance', -L.maint, L0 ? -L0.maint : undefined), row('Advertising', -L.ads, L0 ? -L0.ads : undefined), row('Interest', -L.interest, L0 ? -L0.interest : undefined), row('Tax', -L.tax, L0 ? -L0.tax : undefined), row('Profit', L.profit, L0?.profit))),
    f.warnings.length ? h('div', { class: 'col', style: 'gap:2px' }, h('h3', null, 'Warnings'), f.warnings.map(w => h('div', { class: 'bad small' }, '⚠ ' + w))) : h('div', { class: 'good small' }, skill < 8 ? 'Your advisor sees no problems.' : 'No warnings.'),
    f.events.length ? h('div', { class: 'col', style: 'gap:2px' }, h('h3', null, 'What would happen'), f.events.slice(0, 15).map(e => h('div', { class: 'small' }, '• ' + e))) : null,
    h('h3', null, 'Facilities'),
    h('table', null, h('thead', null, h('tr', null, ['Facility', 'Produced', 'Sold', 'Revenue', 'Result'].map((x, i) => h('th', { class: i ? 'num' : '' }, x)))),
      h('tbody', null, f.buildings.map(b => h('tr', { class: 'clickable', title: b.note, onclick: () => { S.buildingId = b.id; S.sel = v.buildings.find(x => x.id === b.id)?.idx ?? null; S.tab = 'map'; S.render(); } },
        h('td', null, b.name + (b.idle ? ' (idle)' : '')), h('td', { class: 'num' }, num(b.produced)), h('td', { class: 'num' }, num(b.sold)), h('td', { class: 'num' }, money(b.revenue)), h('td', { class: 'num ' + cls(b.result) }, money(b.result)))))));
}

// ---------------------------------------------------------------- orders
function ordersPanel(): HTMLElement {
  const v = S.view!; const os = v.orders as (typeof v.orders[number] & { cost?: number })[];
  return h('div', { class: 'panel col' }, h('h2', null, 'Pending orders'),
    h('div', { class: 'note' }, 'Building, buying land, facilities for sale and shares are orders: they are carried out when the month is played. When several companies want the same thing, the highest sealed bid wins; the others get nothing and pay nothing.'),
    os.length ? h('table', null, h('thead', null, h('tr', null, h('th', null, 'Order'), h('th', { class: 'num' }, 'Bid'), h('th', { class: 'num' }, 'Est. cost'), h('th', null, ''))),
      h('tbody', null, os.map(o => h('tr', null, h('td', null, o.label), h('td', { class: 'num' }, money(o.bid)), h('td', { class: 'num' }, o.cost != null ? money(o.cost) : '–'), h('td', null, h('button', { class: 'mini', onclick: () => act({ type: 'cancelOrder', id: o.id }) }, 'Cancel'))))))
      : h('div', { class: 'muted' }, 'No pending orders.'),
    os.length ? h('div', { class: 'small' }, 'Committed: ', h('b', null, money(os.reduce((n, o) => n + (o.cost ?? o.bid), 0)))) : null);
}

// ---------------------------------------------------------------- contracts
type Terms = { to: string; role: 'sell' | 'buy'; product: ProductId; qty: number; price: number; months: number; penalty: number; building: string };
const form: Terms & { draftId?: string } = { to: '', role: 'sell', product: 'bread', qty: 100, price: 0, months: 6, penalty: 0, building: '' };
/** Saved drafts live in this browser (per game and company): they are private notes until signed and sent. */
type Draft = Terms & { id: string; saved: number };
const draftsKey = () => `capital.drafts.${S.gameId}.${S.view!.me.id}`;
const loadDrafts = (): Draft[] => { try { return JSON.parse(localStorage.getItem(draftsKey()) ?? '[]'); } catch { return []; } };
const storeDrafts = (d: Draft[]) => localStorage.setItem(draftsKey(), JSON.stringify(d));
const terms = (): Terms => ({ to: form.to, role: form.role, product: form.product, qty: form.qty, price: form.price, months: form.months, penalty: form.penalty, building: form.building });
function saveDraft() {
  const d = loadDrafts(); const id = form.draftId ?? 'd' + Date.now().toString(36); const entry: Draft = { ...terms(), id, saved: S.view!.turn };
  const i = d.findIndex(x => x.id === id); if (i >= 0) d[i] = entry; else d.push(entry); storeDrafts(d); form.draftId = id;
}
const deleteDraft = (id: string) => storeDrafts(loadDrafts().filter(x => x.id !== id));
/** Open the contract editor with these terms (a saved draft, or a copy of an existing contract). */
export function openEditor(t: Partial<Terms>, draftId?: string) { Object.assign(form, t); form.draftId = draftId; drafting = true; draftAnim = true; S.tab = 'desk'; S.render(); } // the editor lives on the Desk
/** The terms of an existing contract, from my side, ready to be proposed again. */
function termsOf(k: Contract): Partial<Terms> {
  const me = S.view!.me.id; const sell = k.seller === me; const other = sell ? k.buyer : k.seller;
  return { role: sell ? 'sell' : 'buy', ...(other !== 'npc' ? { to: other } : {}), product: k.product, qty: k.qty, price: k.price, months: k.term ?? k.months, penalty: k.penalty, building: (sell ? k.from : k.dest) ?? '' };
}
const sellers = (p: ProductId) => S.view!.buildings.filter(b => b.product === p && b.type !== 'store' && b.type !== 'rd');
const receivers = (p: ProductId) => S.view!.buildings.filter(b => b.type === 'store' || (b.type === 'factory' && (b.layout ?? []).some(x => x.m === 'import' && x.product === p)));
const bName = (id?: string) => (id && S.view!.buildings.find(b => b.id === id)?.name) || (id && S.view!.others.find(b => b.id === id)?.name) || '–';
function buildingSelect(list: Building[], cur: string, on: (id: string) => void) {
  return h('select', { onchange: (e: Event) => on((e.target as HTMLSelectElement).value) }, list.length ? list.map(b => h('option', { value: b.id, selected: b.id === cur }, b.name)) : h('option', { value: '' }, '— none suitable —'));
}
function contractRow(k: Contract): HTMLElement {
  const v = S.view!; const me = v.me.id; const sell = k.seller === me; const other = sell ? k.buyer : k.seller;
  const who = other === 'npc' ? 'Distributor in ' + (v.cities[k.city ?? 0]?.name ?? '?') : companyOf(other)?.name ?? '?';
  let actions: (HTMLElement | null)[] = [];
  if (k.status === 'offer' && k.to === me) {
    const list = sell ? sellers(k.product) : receivers(k.product); let pickB = list[0]?.id ?? '';
    actions = [buildingSelect(list, pickB, id => { pickB = id; }), h('button', { class: 'primary mini', onclick: () => act({ type: 'answerContract', id: k.id, accept: true, building: pickB }) }, 'Accept'), h('button', { class: 'mini', onclick: () => act({ type: 'answerContract', id: k.id, accept: false }) }, 'Reject')];
  } else if (k.status === 'offer') actions = [h('span', { class: 'muted small' }, 'waiting for an answer'), h('button', { class: 'mini', onclick: () => act({ type: 'cancelContract', id: k.id }) }, 'Withdraw')];
  else if (k.status === 'active') actions = [h('button', { class: 'mini', title: 'Breaking a contract costs 3 months of penalties for the full quantity', onclick: () => { if (confirm('Break this contract? It costs ' + money(k.penalty * k.qty * Math.min(3, k.months)) + '.')) act({ type: 'cancelContract', id: k.id }); } }, 'Break')];
  const ended = k.status === 'done' || k.status === 'broken';
  const canRenew = ended && other !== 'npc' && !!companyOf(other) && !v.companies.find(c => c.id === other)?.bankrupt;
  if (canRenew) actions.push(h('button', { class: 'primary mini', title: 'Open a new contract with the same terms and the same company', onclick: () => openEditor(termsOf(k)) }, '↻ Renew'));
  actions.push(h('button', { class: 'mini', title: 'Open a new draft with the same terms', onclick: () => openEditor(termsOf(k)) }, 'Clone'));
  const meName = v.me.name, active = k.status === 'active' || ended;
  const otherSeed = other === 'npc' ? 'npc:' + (k.city ?? 0) : other;
  const pname = PRODUCTS[k.product].name.toLowerCase();
  return contractDoc({
    title: 'Supply agreement', no: k.id.toUpperCase(), turn: k.turn, open: k.status === 'offer' && k.to === me,
    me: { name: meName, seed: me, signed: active || k.proposer === me, role: sell ? 'the Seller' : 'the Buyer' },
    other: { name: who, seed: otherSeed, signed: active || k.proposer === other || other === 'npc', role: sell ? 'the Buyer' : 'the Seller' },
    clauses: [
      ['The Seller delivers ', h('b', null, num(k.qty) + ' ' + pname), ' every month', k.from ? h('span', null, ', from ', h('b', null, bName(k.from))) : null, '.'],
      ['The Buyer pays ', h('b', null, money2(k.price)), ' per unit, ', h('b', null, money(k.price * k.qty)), ' a month', k.dest ? h('span', null, ', received into ', h('b', null, bName(k.dest))) : null, '.'],
      [other === 'npc' ? 'Transport is paid by the Seller.' : 'Transport is paid by the Buyer.'],
      ended ? ['This agreement runs for ', h('b', null, (k.term ?? '?') + ' months'), '.'] : ['This agreement runs for ', h('b', null, k.months + (k.months > 1 ? ' months' : ' month')), active ? ' more.' : '.'],
      ['For every unit not delivered or not collected, the party at fault pays ', h('b', null, money2(k.penalty)), '.'],
      ['Breaking this agreement early costs three months of penalties for the full quantity.'],
    ],
    stamp: k.status === 'done' ? 'Completed' : k.status === 'broken' ? 'Broken' : undefined,
    foot: ended ? h('span', null, k.status === 'done' ? 'Completed in ' : 'Broken in ', h('b', null, dateOfTurn(k.ended ?? v.turn)), k.status === 'broken' ? h('span', null, ' by ', h('b', null, k.brokenBy === me ? meName : who)) : null, '.', other === 'npc' ? h('span', null, ' ', 'Distributor contracts come from offers on your Desk.') : null)
      : k.status === 'active' ? h('span', null, !sell && k.dest ? 'Set "contract" as the source of that shelf / import cell. ' : null, k.lastDelivered != null ? h('span', null, 'Last month delivered: ', h('b', null, num(k.lastDelivered))) : null) : null,
    actions,
  });
}
/** The tab of a supply contract in the folder: who, what, how many, at what price, for how long. */
export function contractItem(k: Contract): FolderItem {
  const v = S.view!; const me = v.me.id; const sell = k.seller === me; const other = sell ? k.buyer : k.seller;
  const who = other === 'npc' ? 'Distributor in ' + (v.cities[k.city ?? 0]?.name ?? '?') : companyOf(other)?.name ?? '?';
  const mineToAnswer = k.status === 'offer' && k.to === me;
  return { key: 'sc:' + k.id, title: 'Supply agreement', attention: mineToAnswer,
    status: k.status === 'active' ? { text: 'active', cls: 'ok' } : k.status === 'done' ? { text: 'completed' } : k.status === 'broken' ? { text: 'broken', cls: 'bad' } : mineToAnswer ? { text: 'needs your signature', cls: 'warn' } : { text: 'awaiting signature' },
    headline: [h('b', null, sell ? 'Sell ' : 'Buy '), h('b', null, num(k.qty) + ' ' + PRODUCTS[k.product].name.toLowerCase()), '/mo ', sell ? 'to ' : 'from ', h('b', null, who), ' · ', money2(k.price), ' · ', (k.status === 'done' || k.status === 'broken' ? k.term ?? k.months : k.months) + ' mo'],
    doc: () => contractRow(k) };
}
let drafting = false, draftAnim = false;
/** A saved draft in the folder: clicking it opens the editor (not a read-only view). */
function draftItem(d: Draft): FolderItem {
  const who = companyOf(d.to)?.name ?? '?';
  return { key: 'dr:' + d.id, title: 'Supply agreement', status: { text: 'draft' }, open: () => openEditor(d, d.id),
    headline: [h('b', null, (d.role === 'sell' ? 'Sell ' : 'Buy ') + num(d.qty) + ' ' + PRODUCTS[d.product].name.toLowerCase()), '/mo ', d.role === 'sell' ? 'to ' : 'from ', h('b', null, who), ' · ', money2(d.price), ' · ', d.months + ' mo'],
    doc: () => h('div') };
}
/** A blank supply agreement: the terms are fields to fill in, and signing it sends the offer. */
function draftOverlay(): HTMLElement {
  const v = S.view!; const me = v.me.id; const others = v.companies.filter(c => c.id !== me && !c.bankrupt);
  const mp = (p: ProductId) => PRODUCTS[p].basePrice * v.market[p].idx;
  const sell = form.role === 'sell'; const list = sell ? sellers(form.product) : receivers(form.product);
  const num0 = (k: 'qty' | 'price' | 'months' | 'penalty', step: number, w: number) => h('input', { class: 'cfield', type: 'number', min: 0, step, value: form[k], style: `width:${w}px`,
    oninput: (e: Event) => { form[k] = +(e.target as HTMLInputElement).value || 0; }, onchange: () => S.render() });
  const sel = (opts: [string, string][], cur: string, on: (x: string) => void) => h('select', { class: 'cfield', onchange: (e: Event) => { on((e.target as HTMLSelectElement).value); S.render(); } }, opts.map(([id, label]) => h('option', { value: id, selected: id === cur }, label)));
  const roleSel = (mine: boolean) => sel([['sell', 'the Seller'], ['buy', 'the Buyer']], mine === sell ? 'sell' : 'buy', x => { form.role = (mine ? x : x === 'sell' ? 'buy' : 'sell') as 'sell' | 'buy'; });
  const prodSel = sel(PRODUCT_LIST.map(p => [p.id, p.name.toLowerCase()]), form.product, x => { form.product = x as ProductId; form.price = Math.round(mp(form.product) * 100) / 100; });
  const bSel = list.length ? sel(list.map(b => [b.id, b.name]), form.building, x => { form.building = x; }) : h('span', { class: 'bad' }, sell ? 'none of your facilities makes it' : 'none of your facilities can receive it');
  const toC = companyOf(form.to);
  const send = async () => { const r = await act({ type: 'proposeContract', to: form.to, role: form.role, product: form.product, qty: form.qty, price: form.price, months: form.months, penalty: form.penalty, building: form.building }); if (r) { if (form.draftId) deleteDraft(form.draftId); drafting = false; toast('Offer sent', 'ok'); S.render(); } };
  const close = () => { drafting = false; S.render(); };
  const save = () => { saveDraft(); drafting = false; toast('Draft saved', 'ok'); S.render(); };
  const discard = () => { if (form.draftId && confirm('Delete this draft?')) deleteDraft(form.draftId); close(); };
  const doc = contractDoc({ title: 'Supply agreement', no: 'DRAFT', turn: v.turn,
    me: { name: v.me.name, seed: me, signed: false, role: roleSel(true), roleText: sell ? 'the Seller' : 'the Buyer' },
    other: { name: toC?.name ?? '?', seed: form.to, signed: false, role: roleSel(false), roleText: sell ? 'the Buyer' : 'the Seller', nameField: sel(others.map(c => [c.id, c.name + (c.isAI ? ' (AI)' : '')]), form.to, x => { form.to = x; }) },
    clauses: [
      ['The Seller delivers ', num0('qty', 10, 80), ' units of ', prodSel, ' every month', sell ? h('span', null, ', from ', bSel) : null, '.'],
      ['The Buyer pays $', num0('price', 0.5, 90), ' per unit, ', h('b', null, money(form.price * form.qty)), ' a month', !sell ? h('span', null, ', received into ', bSel) : null, '.'],
      ['Transport is paid by the Buyer.'],
      ['This agreement runs for ', num0('months', 1, 55), ' months.'],
      ['For every unit not delivered or not collected, the party at fault pays $', num0('penalty', 0.5, 70), '.'],
      ['Breaking this agreement early costs three months of penalties for the full quantity.'],
    ],
    foot: 'Market price of ' + PRODUCTS[form.product].name + ': ' + money2(mp(form.product)) + '. AI companies sell to you at 2% over market and buy at 3% under it, if they have a facility for it. They answer next month.',
    actions: [h('button', { class: 'primary', disabled: !list.length || !form.to, onclick: send }, '✒ Sign and send offer'), h('button', { onclick: save }, '🗎 Save as draft'), h('button', { onclick: discard }, form.draftId ? 'Delete draft' : 'Discard')] });
  const o = docOverlay(doc, close, draftAnim); draftAnim = false; return o;
}
function contractsPanel(): HTMLElement {
  const v = S.view!; const me = v.me.id; const others = v.companies.filter(c => c.id !== me && !c.bankrupt);
  if (!others.some(c => c.id === form.to)) form.to = others[0]?.id ?? '';
  const mp = (p: ProductId) => PRODUCTS[p].basePrice * v.market[p].idx; if (!form.price) form.price = Math.round(mp(form.product) * 100) / 100;
  const list = form.role === 'sell' ? sellers(form.product) : receivers(form.product); if (!list.some(b => b.id === form.building)) form.building = list[0]?.id ?? '';
  const mine = v.contracts; const drafts = loadDrafts(); const done = mine.filter(k => k.status === 'done' || k.status === 'broken').sort((a, b) => (b.ended ?? 0) - (a.ended ?? 0));
  return h('div', { class: 'panel col' }, h('h2', null, 'Supply contracts'),
    h('div', { class: 'note' }, 'A contract fixes quantity, price and length. The seller delivers from one facility; the buyer pulls the goods by choosing the contract as the source of a shelf or factory import cell (and pays the transport). Every unit short costs the penalty to whoever caused it. AI companies answer offers next month.'),
    contractFolder(mine.filter(k => k.status === 'offer' || k.status === 'active').map(k => contractItem(k)), 'No contracts or offers.'),
    h('div', null, h('button', { class: 'primary', onclick: () => openEditor({}) }, '✎ Create contract')),
    drafts.length ? h('h3', null, 'Drafts') : null,
    drafts.length ? contractFolder(drafts.map(draftItem), '') : null,
    done.length ? h('h3', null, 'Finished') : null,
    done.length ? contractFolder(done.map(k => contractItem(k)), '') : null,
    drafting ? draftOverlay() : null);
}
