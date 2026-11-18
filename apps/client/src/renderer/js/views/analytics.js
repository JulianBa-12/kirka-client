import { h, button, clear, tabs, empty, fmt, field, select } from '../lib/dom.js';
import { api, toast, fail, confirmDialog, modal } from '../lib/store.js';
import { lineChart, barChart } from '../lib/charts.js';

const cssv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const dash = (v, unit = '') => (v == null ? '—' : `${fmt.num(v)}${unit}`);

export async function render(root, params = {}) {
  let tab = ['sessions', 'matches', 'benchmarks'].includes(params.tab) ? params.tab : 'sessions';
  const bar = h('div'); const body = h('div');
  root.append(h('header.page-head', h('div', h('div.pl-label.page-kicker', 'Measured on this computer'), h('h1', 'Analytics'), h('p', 'Play time and frame rate are measured by Polaris. Kirka.io does not share match statistics with clients, so kills, deaths and results only exist if you log them yourself.'))), bar, body);
  const onResize = () => draw();
  window.addEventListener('resize', onResize);

  async function draw() {
    clear(bar).append(tabs([{ id: 'sessions', label: 'Sessions' }, { id: 'matches', label: 'Match log' }, { id: 'benchmarks', label: 'Benchmarks' }], tab, (id) => { tab = id; draw(); }));
    const data = await api('analytics:get');
    clear(body);
    ({ sessions, matches, benchmarks })[tab](data);
  }

  function sessions(data) {
    const s = data.sessions.slice().reverse();
    const cur = data.current;
    const total = data.sessions.reduce((a, x) => a + (x.durationSec || 0), 0);
    const inMatch = data.sessions.reduce((a, x) => a + (x.inMatchSec || 0), 0);
    const fpsVals = data.sessions.filter((x) => x.fpsAvg != null);
    const avgFps = fpsVals.length ? fpsVals.reduce((a, x) => a + x.fpsAvg * x.fpsSamples, 0) / Math.max(1, fpsVals.reduce((a, x) => a + x.fpsSamples, 0)) : null;
    body.append(h('div.readouts',
      h('div.readout', h('div.readout-label', 'Sessions'), h('div.readout-value', fmt.num(data.sessions.length))),
      h('div.readout', h('div.readout-label', 'Time in client'), h('div.readout-value', fmt.dur(total))),
      h('div.readout', h('div.readout-label', 'Time in matches'), h('div.readout-value', fmt.dur(inMatch))),
      h('div.readout', h('div.readout-label', 'Average FPS in matches'), h('div.readout-value', avgFps == null ? '—' : fmt.num(Math.round(avgFps))))));
    if (!s.length && !cur) { body.append(empty('No sessions recorded yet', 'Sessions are saved automatically once you have played or kept Polaris open for a while.')); return; }
    // last 30 days, minutes in match per day
    const days = []; const now = new Date();
    for (let i = 29; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); days.push(d.toISOString().slice(0, 10)); }
    const perDay = days.map((d) => { const v = data.sessions.filter((x) => x.start.slice(0, 10) === d).reduce((a, x) => a + (x.inMatchSec || 0), 0); return v ? Math.round(v / 60) : null; });
    const c1 = h('canvas.chart'); const c2 = h('canvas.chart');
    const last = data.sessions.slice(-40);
    body.append(h('div.split.an-charts',
      h('section.section', h('div.section-head', h('h2', 'Minutes in matches, last 30 days')), c1),
      h('section.section', h('div.section-head', h('h2', 'FPS per session'), h('span.muted.small', 'average and 1% low, last 40')), c2)));
    requestAnimationFrame(() => {
      barChart(c1, { values: perDay, labels: days.map((d) => d.slice(8)), color: cssv('--c-accent') });
      lineChart(c2, { series: [{ values: last.map((x) => x.fpsAvg), color: cssv('--c-accent'), dots: true }, { values: last.map((x) => x.low1Avg), color: cssv('--c-accent3'), dots: true }] });
    });
    body.append(h('section.section', h('div.section-head', h('h2', 'History'), h('div.inline',
      button('Export CSV', async () => { try { const f = await api('analytics:exportCsv', 'sessions'); if (f) toast(`Saved ${f}`, 'ok'); } catch (e) { fail(e); } }, { small: true, iconName: 'download' }),
      button('Clear', async () => { if (await confirmDialog('Clear sessions', 'Delete all recorded sessions?', { danger: true, confirm: 'Clear' })) { await api('analytics:clear', 'sessions'); draw(); } }, { small: true, kind: 'quiet' }))),
    h('table.table', h('thead', h('tr', h('th', 'Started'), h('th.num', 'Length'), h('th.num', 'In matches'), h('th.num', 'Matches entered'), h('th.num', 'Avg FPS'), h('th.num', 'Min FPS'), h('th.num', '1% low'))),
      h('tbody', [cur ? sessionRow(cur, true) : null, ...s.slice(0, 200).map((x) => sessionRow(x))]))));
  }
  const sessionRow = (x, live) => h('tr', h('td', fmt.datetime(x.start), live ? h('span.badge.badge-ok', 'now') : null), h('td.num', fmt.dur(x.durationSec)), h('td.num', fmt.dur(x.inMatchSec)), h('td.num', x.matchesEntered), h('td.num', dash(x.fpsAvg)), h('td.num', dash(x.fpsMin)), h('td.num', dash(x.low1Avg)));

  function matches(data) {
    const m = data.matches.slice().reverse();
    const withKD = data.matches.filter((x) => x.kills != null && x.deaths != null);
    const k = withKD.reduce((a, x) => a + x.kills, 0); const d = withKD.reduce((a, x) => a + x.deaths, 0);
    const res = data.matches.filter((x) => x.result);
    body.append(h('div.note', 'Each entry is typed in by you. Fields you leave empty are stored as “not recorded” and never counted as zero.'),
      h('div.readouts',
        h('div.readout', h('div.readout-label', 'Logged matches'), h('div.readout-value', fmt.num(data.matches.length))),
        h('div.readout', h('div.readout-label', `K/D (${withKD.length} with both values)`), h('div.readout-value', withKD.length ? (d ? (k / d).toFixed(2) : `${k} / 0`) : '—')),
        h('div.readout', h('div.readout-label', `Win rate (${res.length} with result)`), h('div.readout-value', res.length ? `${Math.round((res.filter((x) => x.result === 'win').length / res.length) * 100)}%` : '—'))),
      h('div.page-actions', button('Log a match', () => edit(), { kind: 'primary', iconName: 'plus' }),
        button('Export CSV', async () => { try { const f = await api('analytics:exportCsv', 'matches'); if (f) toast(`Saved ${f}`, 'ok'); } catch (e) { fail(e); } }, { iconName: 'download' })));
    if (!m.length) { body.append(empty('No matches logged', 'After a match, log your result here to track progress over time.')); return; }
    if (withKD.length >= 2) {
      const c = h('canvas.chart'); body.append(h('section.section', h('div.section-head', h('h2', 'K/D per match')), c));
      const series = withKD.slice(-50).map((x) => (x.deaths ? x.kills / x.deaths : x.kills));
      requestAnimationFrame(() => lineChart(c, { series: [{ values: series, color: cssv('--c-accent'), dots: true }] }));
    }
    body.append(h('table.table', h('thead', h('tr', h('th', 'Date'), h('th', 'Mode'), h('th', 'Map'), h('th', 'Result'), h('th.num', 'K'), h('th.num', 'D'), h('th.num', 'A'), h('th.num', 'HS'), h('th.num', 'Score'), h('th', 'Notes'), h('th', ''))),
      h('tbody', m.map((x) => h('tr', h('td', fmt.datetime(x.at)), h('td', x.mode || '—'), h('td', x.map || '—'), h('td', x.result || '—'), h('td.num', dash(x.kills)), h('td.num', dash(x.deaths)), h('td.num', dash(x.assists)), h('td.num', dash(x.headshots)), h('td.num', dash(x.score)), h('td.muted.ellipsis', x.notes || ''),
        h('td.actions', button('', () => edit(x), { small: true, kind: 'quiet', iconName: 'edit', title: 'Edit' }), button('', async () => { await api('analytics:deleteMatch', x.id); draw(); }, { small: true, kind: 'quiet', iconName: 'trash', title: 'Delete' })))))));
  }

  function edit(x = {}) {
    const num = (k, label) => { const i = h('input.input', { type: 'number', min: 0, value: x[k] == null ? '' : x[k], placeholder: 'not recorded' }); i.dataset.k = k; return field(label, i); };
    const at = h('input.input', { type: 'datetime-local', value: (x.at ? new Date(x.at) : new Date()).toISOString().slice(0, 16) });
    const mode = h('input.input', { value: x.mode || '', maxlength: 40, placeholder: 'e.g. Team deathmatch', list: 'an-modes' });
    const map = h('input.input', { value: x.map || '', maxlength: 40 });
    let result = x.result || '';
    const notes = h('input.input', { value: x.notes || '', maxlength: 500 });
    const form = h('div.form-2', field('Date', at), field('Result', select([{ value: '', label: 'Not recorded' }, { value: 'win', label: 'Win' }, { value: 'loss', label: 'Loss' }, { value: 'draw', label: 'Draw' }], result, (v) => { result = v; })),
      field('Mode', mode), field('Map', map), num('kills', 'Kills'), num('deaths', 'Deaths'), num('assists', 'Assists'), num('headshots', 'Headshots'), num('score', 'Score'), num('durationMin', 'Length (min)'), field('Notes', notes));
    modal({ title: x.id ? 'Edit match' : 'Log a match', wide: true, body: form, actions: [{ label: 'Cancel', onClick: () => {} }, { label: 'Save', kind: 'primary', onClick: async () => {
      const m = { id: x.id, at: new Date(at.value).toISOString(), mode: mode.value.trim(), map: map.value.trim(), result, notes: notes.value.trim() };
      for (const i of form.querySelectorAll('input[data-k]')) m[i.dataset.k] = i.value.trim();
      try { await api('analytics:saveMatch', m); draw(); } catch (e) { fail(e); return true; }
    } }] });
  }

  function benchmarks(data) {
    const b = data.benchmarks.slice().reverse();
    body.append(h('div.note', 'Benchmarks are run from the Performance Center while you are in a match. Results depend on the map, the number of players and what else your computer is doing — compare runs taken under similar conditions.'));
    if (!b.length) { body.append(empty('No benchmarks yet', 'Run one in the Performance Center to compare profiles and startup flags.')); return; }
    body.append(h('table.table', h('thead', h('tr', h('th', 'Date'), h('th', 'Label'), h('th', 'Profile'), h('th.num', 'Length'), h('th.num', 'Samples'), h('th.num', 'Avg FPS'), h('th.num', 'Min'), h('th.num', '1% low'), h('th.num', 'Frame ms'), h('th.num', 'CPU %'), h('th.num', 'Memory'), h('th', ''))),
      h('tbody', b.map((x) => h('tr', h('td', fmt.datetime(x.at)), h('td', x.label), h('td', x.profile || '—'), h('td.num', `${x.durationSec}s`), h('td.num', x.samples), h('td.num', dash(x.fpsAvg)), h('td.num', dash(x.fpsMin)), h('td.num', dash(x.low1)), h('td.num', dash(x.frameTimeAvg)), h('td.num', dash(x.cpuAvg)), h('td.num', x.memAvg == null ? '—' : `${fmt.num(Math.round(x.memAvg))} MB`),
        h('td.actions', x.inMatch ? null : h('span.badge.badge-warn', 'partly outside match')))))),
    h('div.page-actions', button('Clear benchmarks', async () => { if (await confirmDialog('Clear benchmarks', 'Delete all benchmark results?', { danger: true, confirm: 'Clear' })) { await api('analytics:clear', 'benchmarks'); draw(); } }, { small: true, kind: 'quiet' })));
  }

  await draw();
  return () => window.removeEventListener('resize', onResize);
}
