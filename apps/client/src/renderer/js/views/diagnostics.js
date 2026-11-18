/* Diagnostics — runs real checks and explains how to fix what fails. */
import { h, button, clear, icon, fmt } from '../lib/dom.js';
import { api, toast, fail } from '../lib/store.js';
import { go } from '../app.js';

const ICON = { ok: 'check', warn: 'alert', fail: 'close', skip: 'minus' };
const LINKS = { server: ['settings', { tab: 'account' }], mirror: ['settings', { tab: 'advanced' }], version: ['updates'], gpu: ['performance'], memory: ['performance'], fps: ['performance'], disk: ['replays'], realtime: ['settings', { tab: 'advanced' }] };

export async function render(root) {
  const head = h('header.page-head', h('div', h('div.pl-label.page-kicker', 'Support'), h('h1', 'Diagnostics'),
    h('p', 'Checks the connection to Kirka.io, the configuration mirror and your Polaris server, the signature of the active configuration, your version, GPU acceleration, disk space and the error log.')));
  const summary = h('div.readouts');
  const list = h('div');
  let last = null;
  head.append(h('div.page-actions',
    button('Copy report', async () => { try { await api('app:copy', await api('diagnostics:report')); toast('Report copied — paste it into a bug report', 'ok'); } catch (e) { fail(e); } }, { iconName: 'copy' }),
    button('Export report', async () => { try { const f = await api('diagnostics:export'); if (f) toast(`Saved to ${f}`, 'ok'); } catch (e) { fail(e); } }, { iconName: 'download' }),
    button('Run checks', () => runChecks(), { kind: 'primary', iconName: 'refresh' })));
  root.append(head, summary, list);

  async function runChecks() {
    clear(list).append(h('p.muted', 'Running checks…'));
    try { last = await api('diagnostics:run'); } catch (e) { clear(list).append(h('div.note.note-danger', e.message)); return; }
    const s = last.summary;
    clear(summary).append(
      h('div.readout', h('div.readout-label.pl-label', 'Passed'), h('div.readout-value', String(s.ok))),
      h('div.readout', h('div.readout-label.pl-label', 'Warnings'), h('div.readout-value', String(s.warn))),
      h('div.readout', h('div.readout-label.pl-label', 'Failed'), h('div.readout-value', String(s.fail))),
      h('div.readout', h('div.readout-label.pl-label', 'Checked'), h('div.readout-value.mono', fmt.datetime(last.at)), h('div.readout-sub', `Polaris ${last.version}`)));
    clear(list);
    const groups = [...new Set(last.checks.map((c) => c.group))];
    for (const g of groups) {
      list.append(h('div.section', h('div.pl-label.section-kicker', g), h('div.rows', last.checks.filter((c) => c.group === g).map((c) => h(`div.row.diag-${c.status}`,
        h('div.row-text', h('div.row-title', h(`span.diag-ico.diag-${c.status}`, icon(ICON[c.status], 13)), c.label), h('div.row-desc.mono', c.detail), c.fix ? h('div.row-desc', h('b', 'Fix: '), c.fix) : null),
        h('div.row-control', LINKS[c.id] && c.status !== 'ok' && c.status !== 'skip' ? button('Open', () => go(...LINKS[c.id]), { small: true }) : null,
          c.id === 'realtime' && c.status !== 'ok' && c.status !== 'skip' ? button('Reconnect', async () => { await api('realtime:reconnect'); setTimeout(runChecks, 1500); }, { small: true }) : null))))));
    }
  }
  await runChecks();
}
