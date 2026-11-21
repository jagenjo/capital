import { PRODUCT_LIST, PRODUCTS, BUILDINGS, LENDERS, type Lender, type ProductId } from '../../shared/data.js';
import { requiredWorkers, layoutIssues, harbourStocks, worldPrice, worldVolume, WORLD_DROP, loanOffer, loanDue, collateralValue, pledgedTo, MAX_LOANS } from '../../shared/engine.js';
import { h, money, money2, num, asset, cls } from './util.js';
import { S, act, companyOf } from './state.js';
import { focusTile } from './worldmap.js';

// ---------- Buildings list
export function buildingsScreen(): HTMLElement {
  const v = S.view!;
  if (!v.buildings.length) return h('div', { class: 'panel' }, 'You have no buildings yet. Go to the Map tab, pick a tile and buy a lot.');
  const total = v.buildings.reduce((a, b) => a + b.report.revenue - b.report.purchases - b.report.wages - b.report.maint, 0);
  const rows = [...v.buildings].sort((a, b) => a.city - b.city || a.type.localeCompare(b.type));
  return h('div', { class: 'panel' }, h('h2', null, 'Your buildings (' + rows.length + ') — last month operating result ', h('span', { class: cls(total) }, money(total))),
    h('table', null, h('thead', null, h('tr', null, ['Building', 'City', 'Product', 'Manager', 'Staff', 'Cond.', 'Stock', 'Produced', 'Revenue', 'Result', 'Issues'].map((x, i) => h('th', { class: i > 3 && i < 10 ? 'num' : '' }, x)))),
      h('tbody', null, rows.map(b => {
        const res = b.report.revenue - b.report.purchases - b.report.wages - b.report.maint;
        const need = requiredWorkers(b); const issues: string[] = [];
        if (b.type !== 'rd' && b.workers < need) issues.push('understaffed');
        if (b.condition < 60) issues.push('poor condition');
        if (b.type === 'store' && !b.slots.some(s => s.product)) issues.push('empty shelves');
        if (b.report.note.includes('short')) issues.push('input shortage');
        if (b.type === 'store' ? b.slots.some(s => s.product && !s.source) : b.type === 'factory' && layoutIssues(b, v.cities).length) issues.push(b.type === 'factory' ? 'layout: supply problem' : 'no source selected');
        if (b.type === 'store' && b.slots.some(s => s.product && s.source.startsWith('harbour:') && !harbourStocks(v.cities, s.source, s.product))) issues.push('harbour sold out');
        if (b.type !== 'store' && b.type !== 'rd' && b.stock.qty > 0 && b.listPrice == null) issues.push('not for sale');
        return h('tr', { class: 'clickable', onclick: () => { S.city = b.city; S.sel = b.idx; S.buildingId = b.id; S.tab = 'map'; focusTile(b.idx, 14); S.render(); } },
          h('td', null, h('span', { class: 'tag', style: 'background:' + BUILDINGS[b.type].color }), b.name), h('td', null, v.cities[b.city].name),
          h('td', null, b.type === 'store' ? b.slots.filter(s => s.product).map(s => PRODUCTS[s.product!].name).join(', ') || '—' : b.product ? PRODUCTS[b.product].name : ''),
          h('td', null, v.me.staff?.find(p => p.assigned === b.id)?.name ?? (b.type === 'store' || b.type === 'rd' ? '' : h('span', { class: 'muted' }, '—'))),
          h('td', { class: 'num' }, b.workers + '/' + (b.type === 'rd' ? '–' : need)), h('td', { class: 'num' }, b.condition.toFixed(0) + '%'),
          h('td', { class: 'num' }, b.type === 'store' ? num(b.slots.reduce((a, s) => a + s.stock.qty, 0)) : num(b.stock.qty)),
          h('td', { class: 'num' }, b.type === 'store' ? num(b.report.sold) + ' sold' : num(b.report.produced)), h('td', { class: 'num' }, money(b.report.revenue)),
          h('td', { class: 'num ' + cls(res) }, money(res)), h('td', { class: 'bad small' }, issues.join(', ')));
      }))));
}

// ---------- Market
let mFilter: ProductId | '' = '';
export function marketScreen(): HTMLElement {
  const v = S.view!;
  const prodTable = h('table', null, h('thead', null, h('tr', null, ['Product', 'Type', 'Market index', 'Reference price', 'Import price', 'Retail ref.', 'Demand idx', 'My tech', 'My brand'].map((x, i) => h('th', { class: i > 1 ? 'num' : '' }, x)))),
    h('tbody', null, PRODUCT_LIST.map(p => { const m = v.market[p.id]; return h('tr', { class: 'clickable' + (mFilter === p.id ? ' sel' : ''), onclick: () => { mFilter = mFilter === p.id ? '' : p.id; S.render(); } },
      h('td', null, h('img', { src: asset(p.photo), style: 'width:34px;height:22px;object-fit:cover;vertical-align:middle;margin-right:6px' }), p.name), h('td', null, p.kind),
      h('td', { class: 'num ' + (m.idx > 1.05 ? 'bad' : m.idx < 0.95 ? 'good' : '') }, m.idx.toFixed(2)), h('td', { class: 'num' }, money2(p.basePrice * m.idx)), h('td', { class: 'num' }, money2(m.importPrice)),
      h('td', { class: 'num' }, p.kind === 'consumer' ? money2(m.retail) : '–'), h('td', { class: 'num' }, p.kind === 'consumer' ? m.demand.toFixed(2) : '–'),
      h('td', { class: 'num' }, v.me.tech[p.id].toFixed(0)), h('td', { class: 'num' }, v.me.brand[p.id].toFixed(0))); })));
  const ls = v.listings.filter(l => !mFilter || l.product === mFilter).sort((a, b) => a.product.localeCompare(b.product) || a.price - b.price);
  const listTable = h('table', null, h('thead', null, h('tr', null, ['Product', 'Seller', 'City', 'Price', 'Quality', 'Available'].map((x, i) => h('th', { class: i > 2 ? 'num' : '' }, x)))),
    h('tbody', null, ls.length ? ls.map(l => h('tr', { class: 'clickable', title: 'Show on the map', onclick: () => { const id = l.building.split('#')[0]; const b = v.buildings.find(x => x.id === id) ?? v.others.find(x => x.id === id); if (!b) return; S.city = b.city; S.sel = b.idx; S.buildingId = v.buildings.some(x => x.id === id) ? id : null; S.tab = 'map'; focusTile(b.idx, 14); S.render(); } }, h('td', null, PRODUCTS[l.product].name), h('td', null, h('span', { class: 'tag', style: 'background:' + companyOf(l.company)?.color }), companyOf(l.company)?.name, l.company === v.me.id ? ' (you)' : ''),
      h('td', null, v.cities[l.city].name), h('td', { class: 'num' }, money2(l.price)), h('td', { class: 'num' }, l.q), h('td', { class: 'num' }, num(l.qty)))) : h('tr', null, h('td', { colSpan: 6, class: 'muted' }, 'No factory is selling to everyone right now. Import through a harbour instead (+35%).'))));
  return h('div', { class: 'col' }, h('div', { class: 'panel' }, h('h2', null, 'Local market — commodity & goods'), prodTable, h('div', { class: 'note' }, 'Click a product to filter listings. Reference price = production-cost based; harbours import at the import price (quality 35) but you must pick a harbour or factory as the source of every input and shelf.')),
    h('div', { class: 'panel' }, h('h2', null, 'Factories selling to everyone ' + (mFilter ? '— ' + PRODUCTS[mFilter].name : '')), listTable),
    h('div', { class: 'panel' }, h('h2', null, 'Harbours — imported goods in stock'), harbourTable()));
}

// ---------- World market
export function worldScreen(): HTMLElement {
  const v = S.view!;
  const mine = (p: ProductId) => v.buildings.reduce((n, b) => n + (b.product === p && b.world ? 1 : 0) + (b.layout ?? []).filter(c => c.m === 'export' && c.world && c.product === p).length, 0);
  const rows = PRODUCT_LIST.map(p => {
    const m = v.market[p.id], wp = worldPrice(v as any, p.id), vol = worldVolume(p.id), sold = m.worldSold ?? 0, fill = Math.min(1, sold / vol), ref = p.basePrice * m.idx;
    return h('tr', null,
      h('td', null, h('img', { src: asset(p.photo), style: 'width:34px;height:22px;object-fit:cover;vertical-align:middle;margin-right:6px' }), p.name), h('td', null, p.kind),
      h('td', { class: 'num' }, money2(ref)), h('td', { class: 'num good' }, money2(wp)), h('td', { class: 'num muted' }, money2(wp * (1 - WORLD_DROP))),
      h('td', { class: 'num' }, money2(m.importPrice)),
      h('td', null, h('div', { style: 'width:110px;height:9px;background:#d8d3c0;display:inline-block;vertical-align:middle' }, h('div', { style: 'height:100%;width:' + Math.round(fill * 100) + '%;background:' + (fill > 0.7 ? '#b3261e' : '#4a8f3f') })), ' ', num(sold) + ' / ' + num(vol) + ' ' + p.unit),
      h('td', { class: 'num' }, mine(p.id) || '–'));
  });
  return h('div', { class: 'col' }, h('div', { class: 'panel' }, h('h2', null, 'World market'),
    h('table', null, h('thead', null, h('tr', null, ['Product', 'Type', 'Reference', 'World price (empty)', 'World price (full)', 'Import price', 'Sold last month / monthly volume', 'My sellers'].map((x, i) => h('th', { class: i > 1 && i < 6 || i === 7 ? 'num' : '' }, x)))), h('tbody', null, rows)),
    h('div', { class: 'note' }, 'The world market buys leftover stock at ' + Math.round(worldPrice(v as any, 'grain') / (PRODUCTS.grain.basePrice * v.market.grain.idx) * 100) + '% of the reference price, scaled by quality. The more of a good that is dumped on it in a month, the lower the price falls (down to the "full" price). Switch it on per building (Production tab) or per export cell.')));
}

/** All harbours with their 4 goods. Used by the Market tab; also reused for the harbour panel on the map. */
export function harbourTable(cityIds?: number[]): HTMLElement {
  const v = S.view!; const ports = v.cities.filter(c => c.port && (!cityIds || cityIds.includes(c.id)));
  return h('table', null, h('thead', null, h('tr', null, ['Harbour', 'Good', 'In stock', 'Price / unit', 'Refreshes'].map((x, i) => h('th', { class: i > 1 ? 'num' : '' }, x)))),
    h('tbody', null, ports.flatMap(c => (c.harbour ?? []).map((g, i) => h('tr', null, h('td', null, i === 0 ? '⚓ ' + c.name : ''),
      h('td', null, h('img', { src: asset(PRODUCTS[g.product].photo), style: 'width:30px;height:20px;object-fit:cover;vertical-align:middle;margin-right:6px' }), PRODUCTS[g.product].name),
      h('td', { class: 'num' }, num(g.qty) + ' ' + PRODUCTS[g.product].unit), h('td', { class: 'num' }, money2(v.market[g.product].importPrice * g.mult)),
      h('td', { class: 'num muted' }, 'sold out or in ' + Math.max(0, 12 - (v.turn - g.since)) + ' mo'))))));
}

// ---------- Finance
export function financeScreen(): HTMLElement {
  const v = S.view!; const me = v.me; const L = me.ledger;
  const lines: [string, number][] = [['Revenue', L.revenue], ['Purchases', -L.purchases], ['Transport', -L.transport], ['Wages', -L.wages], ['Maintenance', -L.maint], ['Advertising', -L.ads], ['Interest', -L.interest], [me.taxBreak && me.taxBreak.until > v.turn ? `Tax (25%, −${Math.round(me.taxBreak.cut * 100)}% break)` : 'Tax (25%)', -L.tax]];
  const cv = h('canvas', { width: 640, height: 260 });
  setTimeout(() => chart(cv), 0);
  return h('div', { class: 'grid2' },
    h('div', { class: 'col' },
      h('div', { class: 'panel' }, h('h2', null, 'Balance'), h('div', { class: 'kv' },
        h('label', null, 'Cash'), h('div', { class: cls(me.cash) }, money(me.cash)), h('label', null, 'Debt'), h('div', null, money(me.debt)),
        h('label', null, 'Net worth'), h('b', null, money(me.netWorth)), h('label', null, 'Credit limit'), h('div', null, money(me.maxDebt)),
        h('label', null, 'Overdraft allowed'), h('div', null, money(me.overdraftLimit)), h('label', null, 'Loss carry-forward'), h('div', null, money(me.lossCarry))),
        h('div', { class: 'note' }, 'Negative cash is charged 2%/month. If net worth stays negative for 3 months you go bankrupt. Each loan has its own interest rate and deadline.'),
        h('div', { class: 'note' }, 'Money is borrowed from lenders as contracts: see the credit offers and your obligations below.')),
      policyPanel(),
      obligationsPanel(),
      offersPanel(),
      h('div', { class: 'panel' }, h('h2', null, 'Last month income statement'),
        h('table', null, h('tbody', null, lines.map(([k, val]) => h('tr', null, h('td', null, k), h('td', { class: 'num ' + cls(val) }, money(val)))), h('tr', null, h('th', null, 'Profit'), h('th', { class: 'num ' + cls(L.profit) }, money(L.profit))))))),
    h('div', { class: 'panel' }, h('h2', null, 'History'), cv, h('div', { class: 'legend' }, h('span', null, h('i', { style: 'background:#1f4e8c' }), 'Net worth'), h('span', null, h('i', { style: 'background:#1c7c3a' }), 'Cash'), h('span', null, h('i', { style: 'background:#d98c00' }), 'Monthly profit'))));
}
// ---- loans: the obligations you signed, and the credit lenders offer
let polForm: { d: number; i: number; t: string } | null = null;
function policyPanel(): HTMLElement {
  const v = S.view!; const me = v.me; const pol = me.policy ?? { dividend: 0, invest: 0, target: 'facilities' as const };
  const mc = v.companies.find(c => c.id === me.id)!; const outside = mc.float + mc.held; const monthsLeft = 11 - (v.turn % 12);
  const profitYear = me.history.slice(-12).reduce((n, p) => n + p.profit, 0) + 0;
  const f = (polForm ??= { d: pol.dividend, i: pol.invest, t: pol.target as string });
  const dIn = h('input', { type: 'number', min: 0, max: 100, value: f.d, style: 'width:60px', onchange: () => { f.d = +dIn.value; S.render(); } }), iIn = h('input', { type: 'number', min: 0, max: 100, value: f.i, style: 'width:60px', onchange: () => { f.i = +iIn.value; S.render(); } });
  const tSel = h('select', { onchange: () => { f.t = tSel.value; } }, [['facilities', 'Modernise facilities (condition + asset value)'], ['rd', 'Research (tech of the goods you make)'], ['debt', 'Repay loans (highest rate first)']].map(([k, label]) => h('option', { value: k, selected: k === f.t }, label)));
  const ly = me.lastYear;
  return h('div', { class: 'panel' }, h('h2', null, 'Fiscal year-end policy'),
    h('div', { class: 'note' }, 'When the fiscal year closes (December, ' + (monthsLeft === 0 ? 'this turn' : 'in ' + monthsLeft + ' months') + ') your profit for the year ($' + Math.round(Math.max(0, profitYear)).toLocaleString('en-US') + ' so far) is split: dividends go to outside shareholders (' + (outside / mc.shares * 100).toFixed(0) + '% of your shares), part is invested, the rest stays as cash.'),
    h('div', { class: 'row' }, 'Dividends', dIn, '% · Invest', iIn, '% into', tSel, h('button', { class: 'primary', onclick: () => act({ type: 'setPolicy', dividend: +dIn.value, invest: +iIn.value, target: tSel.value as any }) }, 'Save')),
    h('div', { class: 'small muted' }, 'Kept as cash: ' + Math.max(0, 100 - (+dIn.value || 0) - (+iIn.value || 0)) + '%.' + (outside <= 0 ? ' No outside shareholders yet: issue shares in the Stock market tab, otherwise dividends are not paid.' : '')),
    ly ? h('div', { class: 'small' }, 'Last year: profit ' + money(ly.profit) + ' · dividends ' + money(ly.dividends) + ' · invested ' + money(ly.invested) + (ly.invested ? ' (' + ly.target + ')' : '')) : null);
}
const pctm = (r: number) => (r * 100).toFixed(2) + '% / mo';
function obligationsPanel(): HTMLElement {
  const v = S.view!; const loans = v.me.loans ?? []; const due = loans.map(loanDue); const tot = due.reduce((n, d) => n + d.interest + d.principal, 0);
  return h('div', { class: 'panel' }, h('h2', null, 'Your obligations'),
    loans.length ? h('div', { class: 'note' }, 'Due at the end of this turn: ', h('b', null, money(tot)), ' (interest + principal). Missing a payment costs a 3% fee; after 3 misses in a row the lender seizes the pledged facilities (60% of their value) and restructures the rest at double interest.') : h('div', { class: 'muted' }, 'You owe nothing. Pick a credit offer below to borrow.'),
    loans.length ? h('table', null, h('thead', null, h('tr', null, ['Lender', 'Owed', 'Rate', 'This month', 'Deadline', 'Collateral', ''].map((x, i) => h('th', { class: i === 1 || i === 3 ? 'num' : '' }, x)))),
      h('tbody', null, loans.map((L, k) => { const lender = LENDERS.find(x => x.id === L.lender)!; const left = L.startTurn + L.term - v.turn;
        return h('tr', null, h('td', null, lender.name, L.defaulted ? h('span', { class: 'bad small' }, ' · restructured') : '', h('div', { class: 'muted small' }, (L.type === 'bullet' ? 'bullet' : 'monthly instalments') + ' · ' + money(L.original) + ' over ' + L.term + ' mo')),
          h('td', { class: 'num' }, money(L.principal)), h('td', null, pctm(L.rate * (L.defaulted ? 2 : 1))),
          h('td', { class: 'num' }, money(due[k].interest + due[k].principal), h('div', { class: 'muted small' }, 'int ' + money(due[k].interest) + (due[k].principal ? ' + ' + money(due[k].principal) : ''))),
          h('td', { class: left <= 1 ? 'bad' : '' }, (left > 0 ? 'in ' + left + ' mo' : 'overdue') + (L.late ? ' · ' + L.late + '/3 missed' : '')),
          h('td', { class: 'small' }, L.collateral.length ? L.collateral.map(id => v.buildings.find(b => b.id === id)?.name ?? id).join(', ') : '–'),
          h('td', null, h('button', { onclick: () => act({ type: 'repayLoan', id: L.id, amount: L.principal }) }, 'Repay all'), ' ', h('button', { onclick: () => { const x = prompt('Repay how much early? (max ' + L.principal + ')', String(Math.min(L.principal, Math.max(0, Math.floor(v.me.cash))))); if (x) act({ type: 'repayLoan', id: L.id, amount: +x }); } }, 'Part…'))); }))) : null);
}
const offerForm: Record<string, { amount: number; term: number; col: Set<string> }> = {};
function offersPanel(): HTMLElement {
  const v = S.view!; const me = v.me; const full = (me.loans ?? []).length >= MAX_LOANS;
  const card = (l: Lender) => {
    const f = offerForm[l.id] ??= { amount: 0, term: l.terms[Math.floor(l.terms.length / 2)], col: new Set<string>() };
    const myB = v.buildings.filter(b => !pledgedTo(me, b.id));
    for (const id of [...f.col]) if (!myB.some(b => b.id === id)) f.col.delete(id);
    const pledged = [...f.col].reduce((n, id) => n + collateralValue(v.buildings.find(b => b.id === id)!), 0);
    const secured = f.col.size > 0 && l.collateral !== 'none';
    const owed = (me.loans ?? []).filter(x => x.lender === l.id).reduce((n, x) => n + x.principal, 0);
    const unsec = l.collateral === 'required' ? 0 : l.base + l.nwFrac * Math.max(0, me.netWorth + me.debt);
    const max = Math.max(0, Math.floor(Math.min(unsec + (secured ? l.ltv * pledged : 0) - owed, Math.max(0, me.maxDebt + 0.7 * pledged - me.debt)) / 1000) * 1000);
    const rate = secured ? l.securedRate : l.rate;
    if (f.amount <= 0 || f.amount > max) f.amount = Math.max(0, Math.min(max, Math.max(l.min, f.amount || Math.round(max / 2 / 1000) * 1000)));
    const per = l.type === 'amortizing' ? Math.ceil(f.amount / f.term) : 0, int0 = f.amount * rate;
    const total = l.type === 'amortizing' ? int0 * (f.term + 1) / 2 : int0 * f.term;
    const amount = h('input', { type: 'number', value: f.amount, step: 10000, min: l.min, max, style: 'width:110px', onchange: (e: Event) => { f.amount = +(e.target as HTMLInputElement).value; S.render(); } });
    const term = h('select', { onchange: (e: Event) => { f.term = +(e.target as HTMLSelectElement).value; S.render(); } }, l.terms.map(m => h('option', { value: m, selected: m === f.term }, m + ' months')));
    const colBox = l.collateral === 'none' ? h('div', { class: 'muted small' }, 'No collateral accepted.') : h('div', null,
      h('div', { class: 'small' }, l.collateral === 'required' ? 'Collateral required — pledge facilities:' : 'Pledge facilities as collateral for more credit and a lower rate (optional):'),
      myB.length ? myB.map(b => h('label', { style: 'display:block' }, h('input', { type: 'checkbox', checked: f.col.has(b.id), onchange: (e: Event) => { (e.target as HTMLInputElement).checked ? f.col.add(b.id) : f.col.delete(b.id); S.render(); } }), ' ' + b.name + ' · value ' + money(collateralValue(b)))) : h('div', { class: 'muted small' }, 'No free facilities to pledge.'));
    const ok = !full && max >= l.min && f.amount >= l.min && f.amount <= max;
    return h('div', { class: 'offer', style: 'border:1px solid #b5ac90;padding:8px;margin:6px 0;background:#fbfaf3' },
      h('div', { class: 'row' }, h('b', null, l.name), h('span', { class: 'grow' }), h('span', { class: secured ? 'good' : '' }, pctm(rate) + (secured ? ' (secured)' : ''))),
      h('div', { class: 'muted small' }, l.blurb + ' ' + (l.type === 'amortizing' ? 'Equal principal instalments each month plus interest.' : 'Interest each month; the whole principal is due at the deadline.')),
      h('div', { class: 'small' }, 'Available now: ', h('b', null, max >= l.min ? money(max) : 'nothing'), ' · min ' + money(l.min)), colBox,
      h('div', { class: 'row', style: 'margin-top:4px' }, 'Amount', amount, 'Term', term, h('span', { class: 'grow' }), h('button', { class: 'primary', disabled: !ok, onclick: () => act({ type: 'takeLoan', lender: l.id, amount: f.amount, term: f.term, collateral: [...f.col] }).then(() => { f.col.clear(); f.amount = 0; }) }, 'Accept offer')),
      h('div', { class: 'small muted' }, l.type === 'amortizing' ? 'First month: ' + money(per + int0) + ' (' + money(per) + ' principal + ' + money(int0) + ' interest) · total interest about ' + money(total) : 'Monthly interest ' + money(int0) + ' · repay ' + money(f.amount) + ' in month ' + f.term + ' · total interest about ' + money(total)));
  };
  return h('div', { class: 'panel' }, h('h2', null, 'Credit offers'), full ? h('div', { class: 'bad small' }, 'You already have ' + MAX_LOANS + ' open loans.') : null, LENDERS.map(card));
}
function chart(cv: HTMLCanvasElement) {
  const hist = S.view!.me.history; const g = cv.getContext('2d')!; g.clearRect(0, 0, cv.width, cv.height); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
  if (hist.length < 2) { g.fillStyle = '#777'; g.font = '14px system-ui'; g.fillText('Play a few turns to see history.', 20, 30); return; }
  const series: [keyof typeof hist[0], string][] = [['netWorth', '#1f4e8c'], ['cash', '#1c7c3a'], ['profit', '#d98c00']];
  const all = hist.flatMap(p => series.map(([k]) => p[k] as number)); const lo = Math.min(0, ...all), hi = Math.max(1, ...all);
  const X = (i: number) => 60 + i / (hist.length - 1) * (cv.width - 80), Y = (val: number) => cv.height - 25 - (val - lo) / (hi - lo) * (cv.height - 45);
  g.strokeStyle = '#ddd'; g.fillStyle = '#666'; g.font = '11px system-ui'; g.textAlign = 'right';
  for (let i = 0; i <= 4; i++) { const val = lo + (hi - lo) * i / 4; g.beginPath(); g.moveTo(60, Y(val)); g.lineTo(cv.width - 20, Y(val)); g.stroke(); g.fillText(Math.abs(val) >= 1e6 ? (val / 1e6).toFixed(1) + 'M' : Math.round(val / 1000) + 'k', 54, Y(val) + 4); }
  for (const [k, col] of series) { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); hist.forEach((p, i) => i ? g.lineTo(X(i), Y(p[k] as number)) : g.moveTo(X(i), Y(p[k] as number))); g.stroke(); }
  g.textAlign = 'center'; g.fillStyle = '#666'; g.fillText('turn ' + hist[0].turn, 60, cv.height - 8); g.fillText('turn ' + hist[hist.length - 1].turn, cv.width - 30, cv.height - 8);
}

// ---------- Marketing
export function marketingScreen(): HTMLElement {
  const v = S.view!; const me = v.me;
  const total = Object.values(me.ads).reduce((a, b) => a + (b ?? 0), 0);
  return h('div', { class: 'panel' }, h('h2', null, 'Advertising — ' + money(total) + ' / month'), h('div', { class: 'note' }, 'Brand awareness boosts how attractive your shelves are against competitors. It decays 8% per month, so campaigns must be sustained. Spending has diminishing returns (square-root curve).'),
    h('img', { class: 'hero', src: asset('title/t_ads.jpg'), style: 'height:110px;max-width:600px;margin-top:8px' }),
    h('table', null, h('thead', null, h('tr', null, ['Product', 'Brand', 'Tech', 'Monthly ad budget'].map(x => h('th', null, x)))), h('tbody', null,
      PRODUCT_LIST.filter(p => p.kind === 'consumer').map(p => {
        const inp = h('input', { type: 'number', value: me.ads[p.id] ?? 0, step: 1000, min: 0 }); inp.addEventListener('change', () => act({ type: 'setAds', product: p.id, budget: +inp.value }));
        return h('tr', null, h('td', null, p.name), h('td', null, h('div', { class: 'row' }, h('div', { class: 'bar', style: 'width:120px' }, h('div', { style: 'width:' + me.brand[p.id] + '%' })), me.brand[p.id].toFixed(0))),
          h('td', null, me.tech[p.id].toFixed(0)), h('td', null, inp));
      }))));
}

// ---------- Rankings
export function rankingsScreen(): HTMLElement {
  const v = S.view!; const rows = [...v.companies].sort((a, b) => Number(a.bankrupt) - Number(b.bankrupt) || b.netWorth - a.netWorth);
  return h('div', { class: 'panel' }, h('h2', null, 'Company ranking'), h('table', null, h('thead', null, h('tr', null, ['#', '', 'Company', 'Type', 'Net worth', 'Buildings', 'Status'].map((x, i) => h('th', { class: i === 4 || i === 5 ? 'num' : '' }, x)))),
    h('tbody', null, rows.map((c, i) => h('tr', { class: c.id === v.me.id ? 'sel' : '' }, h('td', null, i + 1), h('td', null, h('img', { src: asset('person/' + String(c.portrait).padStart(2, '0') + '.png'), style: 'width:30px;height:30px;border:2px solid ' + c.color + ';image-rendering:pixelated' })),
      h('td', null, c.name), h('td', null, c.isAI ? 'AI' : 'Player'), h('td', { class: 'num' }, money(c.netWorth)), h('td', { class: 'num' }, c.buildings),
      h('td', null, c.bankrupt ? h('span', { class: 'bad' }, 'bankrupt') : c.isAI ? '' : c.ready ? h('span', { class: 'good' }, 'ready') : c.online ? 'planning…' : h('span', { class: 'muted' }, 'offline')))))),
    h('div', { class: 'note' }, v.settings.targetNetWorth > 0 ? 'Goal: first to ' + money(v.settings.targetNetWorth) + ' net worth, or richest after ' + v.settings.maxMonths + ' months.' : 'Richest company after ' + v.settings.maxMonths + ' months wins.'));
}

// ---------- News
