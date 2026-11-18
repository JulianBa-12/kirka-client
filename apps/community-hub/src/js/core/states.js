/** Honest states for missing data / unavailable backend. Never substitute fake content. */
import { h } from './dom.js';

export function stateBlock({ label, title, body, actions, tone = 'empty', compact = false }) {
  return h('div', { class: `state state--${tone}${compact ? ' state--compact' : ''}`, role: tone === 'error' ? 'alert' : null },
    h('p', { class: 'state__label pl-label' }, h('span', { class: 'dot' }), label),
    h('p', { class: 'state__title' }, title),
    body ? h('p', { class: 'state__body' }, body) : null,
    actions && actions.length ? h('div', { class: 'state__actions btn-row' }, actions) : null);
}

/**
 * Backend unavailable. `feature` reads as "<feature> needs the community backend".
 */
export function backendState(s, feature, { compact = false, retry = true } = {}) {
  const st = s && s.state;
  const actions = [];
  if (retry && st === 'offline') actions.push(h('button', { type: 'button', class: 'btn btn--sm', onclick: () => location.reload() }, 'Try again'));
  actions.push(h('a', { class: 'btn btn--sm btn--ghost', href: 'downloads.html' }, 'Downloads still work →'));
  if (st === 'maintenance') {
    return stateBlock({ tone: 'offline', compact, label: 'Community backend · maintenance', title: 'Back shortly', body: `${feature} is paused while the backend is in maintenance.${s.message ? ' ' + s.message : ''}`, actions });
  }
  if (st === 'unconfigured') {
    return stateBlock({ tone: 'offline', compact, label: 'Community backend · not configured', title: 'Not connected yet', body: `${feature} needs the Polaris community backend, and this copy of the site has not been connected to one. Published news, releases and documentation are served from the static mirror and keep working.`, actions: actions.slice(-1) });
  }
  return stateBlock({ tone: 'offline', compact, label: 'Community backend · offline', title: 'Can’t reach the community backend', body: `${feature} is unavailable right now because the backend did not respond. Nothing is shown rather than stale or placeholder data.`, actions });
}

export function emptyState(title, body, actions, compact) {
  return stateBlock({ tone: 'empty', label: 'Nothing here yet', title, body, actions, compact });
}

export function errorState(title, body, actions) {
  return stateBlock({ tone: 'error', label: 'Error', title, body, actions });
}

export function loading(text = 'Loading') { return h('div', { class: 'loading', role: 'status' }, text); }
