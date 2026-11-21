// Settings: interface language and display currency (stored in this browser only).
import { h } from './util.js';
import { S } from './state.js';
import { icon } from './icons.js';
import { lang, setLang, cur, setCur, RATE, type Lang, type Cur } from './i18n.js';

const choice = <T extends string>(cur0: T, opts: [T, string][], set: (v: T) => void) =>
  h('div', { class: 'row', style: 'gap:6px' }, opts.map(([k, label]) => h('button', { class: cur0 === k ? 'primary' : '', onclick: () => { set(k); S.render(); } }, label)));

export function settingsScreen(): HTMLElement {
  return h('div', { class: 'panel col', style: 'max-width:640px' },
    h('h2', null, icon('settings'), 'Settings'),
    h('h3', null, icon('globe'), 'Language'),
    choice<Lang>(lang, [['en', 'English'], ['es', 'Español']], setLang),
    h('h3', null, icon('finance'), 'Currency'),
    choice<Cur>(cur, [['USD', 'US dollar ($)'], ['EUR', 'Euro (€)']], setCur),
    h('div', { class: 'note' }, `Display only: the game always calculates in dollars. Euro amounts are shown at a fixed rate of 1 USD = ${RATE} EUR. Amounts you type into fields (loans, bids, prices) are still entered in dollars.`),
    h('div', { class: 'note' }, 'These settings are stored in this browser.'));
}
