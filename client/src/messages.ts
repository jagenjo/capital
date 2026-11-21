// Messages: private mail between companies.
import { h } from './util.js';
import { S, act, companyOf } from './state.js';

let to = ''; let draft = '';
export const unreadCount = () => S.view ? S.view.messages.filter(m => m.to === S.view!.me.id && !m.seen).length : 0;

export function messagesScreen(): HTMLElement {
  const v = S.view!; const me = v.me.id;
  const others = v.companies.filter(c => c.id !== me && !c.bankrupt);
  if (!to || !others.some(c => c.id === to)) to = others.find(c => v.messages.some(m => m.to === me && m.from === c.id && !m.seen))?.id ?? others.find(c => !c.isAI)?.id ?? others[0]?.id ?? '';
  const thread = v.messages.filter(m => (m.from === me && m.to === to) || (m.to === me && m.from === to));
  if (thread.some(m => m.to === me && !m.seen)) { act({ type: 'readMessages', from: to }); }
  const list = others.map(c => {
    const last = [...v.messages].reverse().find(m => m.from === c.id || m.to === c.id); const unread = v.messages.filter(m => m.from === c.id && m.to === me && !m.seen).length;
    return h('div', { class: 'conv clickable' + (c.id === to ? ' sel' : ''), onclick: () => { to = c.id; S.render(); } },
      h('span', { class: 'tag', style: 'background:' + c.color }), h('b', null, ' ' + c.name), c.isAI && h('span', { class: 'muted small' }, ' (AI)'), unread > 0 && h('span', { class: 'badge' }, String(unread)),
      last && h('div', { class: 'muted small' }, (last.from === me ? 'You: ' : '') + last.text.slice(0, 40)));
  });
  const box = h('textarea', { rows: 3, maxlength: 600, placeholder: 'Write a message…', style: 'width:100%' }); box.value = draft; box.addEventListener('input', () => { draft = box.value; });
  const send = async () => { if (!draft.trim()) return; const r = await act({ type: 'sendMessage', to, text: draft }); if (r) { draft = ''; S.render(); } };
  box.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); });
  const tc = companyOf(to);
  return h('div', { class: 'grid2' },
    h('div', { class: 'panel col' }, h('h2', null, 'Messages'), list.length ? list : h('div', { class: 'muted' }, 'There are no other companies.')),
    h('div', { class: 'panel col' }, h('h2', null, tc ? 'Conversation with ' + tc.name : 'Conversation'),
      tc?.isAI && h('div', { class: 'note' }, 'AI companies do not read their mail.'),
      h('div', { class: 'thread' }, thread.length ? thread.map(m => h('div', { class: 'msg ' + (m.from === me ? 'mine' : 'theirs') }, h('div', { class: 'small muted' }, (m.from === me ? 'You' : companyOf(m.from)?.name ?? '?') + ' · turn ' + m.turn), h('div', null, m.text))) : h('div', { class: 'muted' }, 'No messages yet.')),
      to && box, to && h('div', { class: 'row' }, h('button', { class: 'primary', onclick: send }, 'Send'), h('span', { class: 'muted small' }, 'Ctrl+Enter sends. Messages are private and delivered immediately.'))));
}
