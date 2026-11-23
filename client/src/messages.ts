// Private mail between companies. It lives in the Competitors tab: each company's conversation is shown with its profile.
import { h, toast } from './util.js';
import { S, act, companyOf } from './state.js';

const drafts: Record<string, string> = {};
export const unreadCount = () => S.view ? S.view.messages.filter(m => m.to === S.view!.me.id && !m.seen).length : 0;
/** Unread messages from one company (0 for all companies: the total). */
export const unreadFrom = (id: string) => S.view ? S.view.messages.filter(m => m.to === S.view!.me.id && m.from === id && !m.seen).length : 0;

/** The conversation with a company: the thread, a box to write, and send. Showing it marks the messages as read. */
export function conversationPanel(id: string): HTMLElement {
  const v = S.view!; const me = v.me.id; const c = companyOf(id);
  const thread = v.messages.filter(m => (m.from === me && m.to === id) || (m.to === me && m.from === id));
  if (thread.some(m => m.to === me && !m.seen)) act({ type: 'readMessages', from: id });
  const box = h('textarea', { rows: 3, maxlength: 600, placeholder: 'Write a message…', style: 'width:100%' }); box.value = drafts[id] ?? ''; box.addEventListener('input', () => { drafts[id] = box.value; });
  const send = async () => { const text = (drafts[id] ?? '').trim(); if (!text) return; const r = await act({ type: 'sendMessage', to: id, text }); if (r) { drafts[id] = ''; toast('Message sent to ' + (c?.name ?? '?'), 'ok'); S.render(); } };
  box.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); });
  const th = h('div', { class: 'thread' }, thread.length ? thread.map(m => h('div', { class: 'msg ' + (m.from === me ? 'mine' : 'theirs') }, h('div', { class: 'small muted' }, (m.from === me ? 'You' : companyOf(m.from)?.name ?? '?') + ' · turn ' + m.turn), h('div', null, m.text))) : h('div', { class: 'muted' }, 'No messages yet.'));
  setTimeout(() => { th.scrollTop = th.scrollHeight; }, 0); // newest at the bottom
  return h('div', { class: 'panel col' }, h('h2', null, 'Messages with ' + (c?.name ?? '?')),
    c?.isAI ? h('div', { class: 'note' }, 'AI companies do not read their mail.') : null, th,
    c && !c.bankrupt ? h('div', { class: 'col' }, box, h('div', { class: 'row' }, h('button', { class: 'primary', onclick: send }, 'Send'), h('span', { class: 'muted small' }, 'Ctrl+Enter sends. Messages are private and delivered immediately.'))) : h('div', { class: 'muted small' }, 'This company is bankrupt.'));
}
