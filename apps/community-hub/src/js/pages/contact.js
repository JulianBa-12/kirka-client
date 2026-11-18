import { boot } from '../core/chrome.js';
import { h, $, clear } from '../core/dom.js';
import { api, status, errorText } from '../core/api.js';
import { backendState } from '../core/states.js';

await boot('contact');
const host = $('[data-bind="form"]');
const s = await status();

if (s.state !== 'online') {
  clear(host, backendState(s, 'The contact form'),
    h('p', { class: 'field__hint contact__fallback' }, 'Until then, open an issue on ', h('a', { href: 'https://github.com/JulianBa-12/kirka-client/issues', rel: 'noopener noreferrer', target: '_blank' }, 'GitHub'), ' — for security issues use a private security advisory instead.'));
} else {
  const field = (id, label, input, hint) => h('div', { class: 'field' }, h('label', { class: 'field__label', for: id }, label), input,
    hint ? h('p', { class: 'field__hint' }, hint) : null, h('p', { class: 'field__error', id: `${id}-err` }));
  const topic = h('select', { class: 'input', id: 'ct-topic' }, ['General question', 'Security', 'Press', 'Content or takedown request', 'Other'].map((t) => h('option', { value: t }, t)));
  const subject = h('input', { class: 'input', id: 'ct-subject', maxlength: '100', required: true, autocomplete: 'off' });
  const message = h('textarea', { class: 'textarea', id: 'ct-body', maxlength: '5000', rows: '8', required: true });
  const reply = h('input', { class: 'input', id: 'ct-reply', maxlength: '120', required: true, autocomplete: 'email', placeholder: 'Email or Discord name' });
  const st = h('p', { class: 'form__status', role: 'status' });
  const submit = h('button', { class: 'btn btn--primary pl-chamfer', type: 'submit' }, 'Send message');
  const form = h('form', { class: 'form', novalidate: true },
    field('ct-topic', 'Topic', topic),
    field('ct-subject', 'Subject', subject, '5–100 characters.'),
    field('ct-body', 'Message', message, 'Only the Polaris team can read this. It is never published.'),
    field('ct-reply', 'Reply to', reply, 'Required, so we can answer you.'),
    h('div', { class: 'btn-row' }, submit), st);
  const err = (input, msg) => { input.setAttribute('aria-invalid', msg ? 'true' : 'false'); form.querySelector(`#${input.id}-err`).textContent = msg || ''; return !!msg; };
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); st.textContent = ''; st.dataset.tone = '';
    const t = subject.value.trim(); const b = message.value.trim(); const c = reply.value.trim();
    const bad = [err(subject, t.length < 5 ? 'At least 5 characters.' : ''), err(message, b.length < 10 ? 'At least 10 characters.' : ''), err(reply, c.length < 3 ? 'Tell us where to reply.' : '')].some(Boolean);
    if (bad) { form.querySelector('[aria-invalid="true"]').focus(); return; }
    submit.disabled = true;
    try {
      const item = await api('/feedback', { method: 'POST', body: { type: 'contact', title: `[${topic.value}] ${t}`.slice(0, 120), body: b, contact: c } });
      form.reset();
      st.dataset.tone = 'ok'; st.textContent = `Sent. Reference #${item.id} — the team replies to ${c}.`;
    } catch (ex) {
      st.dataset.tone = 'error';
      st.textContent = ex.status === 429 ? 'Too many messages in the last hour. Please try again later.' : errorText(ex);
    } finally { submit.disabled = false; }
  });
  clear(host, form);
}
