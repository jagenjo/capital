// Settings: interface language and display currency (stored in this browser only).
import { h, toast } from './util.js';
import { S } from './state.js';
import { api } from './api.js';
import { icon } from './icons.js';
import { lang, setLang, cur, setCur, RATE, type Lang, type Cur } from './i18n.js';

const choice = <T extends string>(cur0: T, opts: [T, string][], set: (v: T) => void) =>
  h('div', { class: 'row', style: 'gap:6px' }, opts.map(([k, label]) => h('button', { class: cur0 === k ? 'primary' : '', onclick: () => { set(k); S.render(); } }, label)));

const KINDS: [string, string][] = [['idea', 'Idea'], ['balance', 'Balance / too easy or too hard'], ['bug', 'Something is broken'], ['other', 'Other']];
const fb = { kind: 'idea', text: '', busy: false };
function suggestionPanel(): HTMLElement {
  const box = h('textarea', { rows: 5, maxlength: 2000, placeholder: 'What would make the game better? Be as specific as you like…', style: 'width:100%' }); box.value = fb.text; const count = h('span', { class: 'muted small' }, fb.text.length + ' / 2000'); box.addEventListener('input', () => { fb.text = box.value; count.textContent = fb.text.length + ' / 2000'; });
  const send = async () => {
    if (fb.busy) return; fb.busy = true;
    try { await api.suggest(S.gameId, S.token, fb.kind, fb.text); fb.text = ''; toast('Thank you! Your suggestion was sent.', 'ok'); } catch (e: any) { toast(e.message, 'err'); }
    fb.busy = false; S.render();
  };
  return h('div', { class: 'panel col', style: 'max-width:640px' }, h('h2', null, 'Ideas & suggestions'),
    h('div', { class: 'note' }, 'Tell the people running this game what you would change or add. It goes straight to the admin, together with your player name.'),
    choice(fb.kind, KINDS, k => { fb.kind = k; }), box,
    h('div', { class: 'row' }, h('button', { class: 'primary', disabled: fb.busy, onclick: send }, 'Send suggestion'), count));
}
const con = { log: [] as { text: string; err?: boolean }[], busy: false };
/** A small console: type a command (try /help). */
function consolePanel(): HTMLElement {
  const input = h('input', { type: 'text', placeholder: '/help', style: 'flex:1;font-family:monospace', autocomplete: 'off' }) as HTMLInputElement;
  const run = async () => {
    const cmd = input.value.trim(); if (!cmd || con.busy) return; con.busy = true; con.log.push({ text: '> ' + cmd });
    try { const r = await api.console(S.gameId, S.token, cmd); for (const l of r.output) con.log.push({ text: l }); if (r.view) S.view = r.view; }
    catch (e: any) { con.log.push({ text: e.message, err: true }); }
    con.log = con.log.slice(-60); con.busy = false; S.render();
    setTimeout(() => { const el = document.querySelector('.console-in') as HTMLInputElement | null; el?.focus(); const lg = document.querySelector('.console-log'); if (lg) lg.scrollTop = lg.scrollHeight; }, 0);
  };
  input.classList.add('console-in'); input.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
  return h('div', { class: 'panel col', style: 'max-width:640px', 'data-keep': 'console' }, h('h2', null, 'Console'),
    h('div', { class: 'note' }, 'Type a command and press Enter. /help lists them.'),
    h('div', { class: 'console-log' }, con.log.length ? con.log.map(l => h('div', { class: l.err ? 'bad' : '' }, l.text)) : h('span', { class: 'muted' }, 'No commands yet.')),
    h('div', { class: 'row' }, input, h('button', { onclick: run }, 'Run')));
}
export function settingsScreen(): HTMLElement {
  return h('div', { class: 'col', style: 'gap:12px' }, settingsPanel(), consolePanel(), suggestionPanel());
}
function settingsPanel(): HTMLElement {
  return h('div', { class: 'panel col', style: 'max-width:640px' },
    h('h2', null, icon('settings'), 'Settings'),
    h('h3', null, icon('globe'), 'Language'),
    choice<Lang>(lang, [['en', 'English'], ['es', 'Español']], setLang),
    h('h3', null, icon('finance'), 'Currency'),
    choice<Cur>(cur, [['USD', 'US dollar ($)'], ['EUR', 'Euro (€)']], setCur),
    h('div', { class: 'note' }, `Display only: the game always calculates in dollars. Euro amounts are shown at a fixed rate of 1 USD = ${RATE} EUR. Amounts you type into fields (loans, bids, prices) are still entered in dollars.`),
    h('div', { class: 'note' }, 'These settings are stored in this browser.'),
    h('h3', null, icon('encyclopedia'), 'Tutorial'),
    h('div', { class: 'row' }, h('a', { href: '/tutorial/', target: '_blank', rel: 'noopener' }, h('button', { class: 'primary' }, 'Open the tutorial website'))));
}
