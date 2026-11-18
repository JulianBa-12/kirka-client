/* Session Journal — every measured session with personal notes, tags, rating and favorites.
 * The numbers come from the local session tracker; Polaris does not invent results. */
import { h, button, clear, toggle, empty, fmt, icon } from '../lib/dom.js';
import { api, toast, fail } from '../lib/store.js';
import { go } from '../app.js';

export async function render(root) {
  let onlyFav = false; let query = '';
  const head = h('header.page-head', h('div', h('div.pl-label.page-kicker', 'Your history'), h('h1', 'Session Journal'),
    h('p', 'Sessions measured by Polaris on this computer, with your own notes. Kirka.io does not share match results with clients, so the journal only shows what Polaris measured and what you wrote.')));
  const search = h('input.input', { type: 'search', placeholder: 'Search notes and tags' });
  search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); draw(); });
  head.append(h('div.page-actions', search, h('label.inline.small', toggle(false, (v) => { onlyFav = v; draw(); }, { label: 'Only favorites' }), h('span', 'Only favorites')),
    button('Export journal', async () => { try { const f = await api('journal:export'); if (f) toast(`Saved to ${f}`, 'ok'); } catch (e) { fail(e); } }, { iconName: 'download' })));
  const body = h('div.stack');
  root.append(head, body);
  let data; let journal;

  async function load() { [data, journal] = await Promise.all([api('analytics:get'), api('journal:get')]); }

  function draw() {
    clear(body);
    const cur = data.current;
    if (cur) body.append(h('div.note', h('b', 'Current session: '), `${fmt.dur(cur.durationSec)} open · ${fmt.dur(cur.inMatchSec)} in matches · ${cur.matchesEntered} match(es) entered${cur.fpsAvg != null ? ` · ${cur.fpsAvg} fps average` : ''}. It is added to the journal automatically.`));
    let sessions = data.sessions.slice().reverse();
    sessions = sessions.filter((s) => {
      const e = journal.entries[`session:${s.id}`];
      if (onlyFav && !(e && e.favorite)) return false;
      if (query && !(e && ((e.note || '').toLowerCase().includes(query) || e.tags.some((t) => t.toLowerCase().includes(query))))) return false;
      return true;
    });
    if (!sessions.length) { body.append(empty(data.sessions.length ? 'Nothing matches the filter' : 'No sessions yet', data.sessions.length ? 'Clear the search or the favorites filter.' : 'Sessions appear here after you have played or kept Polaris open for a while.', data.sessions.length ? null : button('Play', () => go('play'), { kind: 'primary', iconName: 'play' }))); return; }
    // group by day
    const byDay = new Map();
    for (const s of sessions) { const d = s.start.slice(0, 10); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(s); }
    for (const [day, list] of byDay) {
      const total = list.reduce((a, s) => a + (s.inMatchSec || 0), 0);
      body.append(h('div.section', h('div.section-head', h('div', h('div.pl-label.section-kicker', fmt.date(`${day}T12:00:00Z`)), h('div.small.muted', `${list.length} session(s) · ${fmt.dur(total)} in matches`))),
        h('div.journal-list', list.map(entry))));
    }
  }

  function entry(s) {
    const key = `session:${s.id}`;
    const e = journal.entries[key] || { note: '', favorite: false, tags: [], rating: null };
    const note = h('textarea.input', { rows: 2, maxlength: 4000, placeholder: 'What did you practise, what worked, what to change next time?' }, e.note || '');
    const tags = h('input.input.input-sm', { value: e.tags.join(', '), placeholder: 'Tags, comma separated', maxlength: 200 });
    const save = async (patch = {}) => {
      const next = { ...e, note: note.value, tags: tags.value.split(',').map((t) => t.trim()).filter(Boolean), ...patch };
      try { const r = await api('journal:set', key, next); journal.entries[key] = r || undefined; if (!r) delete journal.entries[key]; Object.assign(e, r || {}); } catch (err) { fail(err); }
    };
    note.addEventListener('change', () => save()); tags.addEventListener('change', () => save());
    const fav = button('', async () => { await save({ favorite: !e.favorite }); draw(); }, { small: true, kind: 'quiet', iconName: 'star', title: e.favorite ? 'Remove favorite' : 'Favorite' });
    if (e.favorite) fav.classList.add('is-on');
    const stars = h('span.stars', [1, 2, 3, 4, 5].map((n) => h(`button.star${e.rating && n <= e.rating ? '.is-on' : ''}`, { type: 'button', title: `${n}/5`, 'aria-label': `Rate ${n} of 5`, on: { click: async () => { await save({ rating: e.rating === n ? null : n }); draw(); } } }, icon('star', 13))));
    return h('div.journal-entry',
      h('div.journal-meta',
        h('div.mono', `${s.start.slice(11, 16)}–${s.end ? s.end.slice(11, 16) : '…'}`),
        h('div.small.muted', `${fmt.dur(s.durationSec)} open · ${fmt.dur(s.inMatchSec)} in match · ${s.matchesEntered} match(es)`),
        h('div.small.muted', s.fpsAvg != null ? `${s.fpsAvg} fps avg · ${s.fpsMin ?? '—'} min${s.low1Avg != null ? ` · ${s.low1Avg} 1% low` : ''}` : 'No frame rate measured'),
        h('div.inline', fav, stars)),
      h('div.journal-note', note, tags));
  }

  try { await load(); draw(); } catch (e) { body.append(h('div.note.note-danger', e.message)); }
}
