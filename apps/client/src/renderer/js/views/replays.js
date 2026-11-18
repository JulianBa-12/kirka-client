import { h, icon, button, clear, empty, fmt, select } from '../lib/dom.js';
import { api, store, toast, fail, confirmDialog, promptDialog, subscribe } from '../lib/store.js';
import * as recorder from '../lib/recorder.js';

const tc = (s) => { s = Math.max(0, s || 0); const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };

export async function render(root) {
  const recBtn = h('span');
  const list = h('div.rp-list'); const stage = h('div.rp-stage');
  root.append(
    h('header.page-head', h('div', h('div.pl-label.page-kicker', 'Video recordings'), h('h1', 'Replays'), h('p', 'Kirka.io does not provide match replays, so Polaris records the game window as video. Recordings stay on this computer.')),
      h('div.page-actions', recBtn, button('Open folder', () => api('app:openFolder', 'replays'), { iconName: 'folder' }))),
    h('div.note', `Window capture records video only — on Linux there is no game audio. Hotkeys: ${store.settings.game.keybinds.record || 'not set'} to start/stop, ${store.settings.game.keybinds.bookmark || 'not set'} to bookmark while recording. Settings → Game controls resolution, bitrate and the time limit.`),
    h('div.rp-layout', list, stage));

  const drawRec = () => clear(recBtn).append(recorder.isRecording()
    ? button('Stop recording', async () => { await recorder.stop(); drawRec(); }, { kind: 'danger', iconName: 'pause' })
    : button('Start recording', async () => { await recorder.start(); drawRec(); }, { kind: 'primary', iconName: 'record' }));
  drawRec();

  let items = []; let current = null;
  async function load(selectId) {
    items = await api('replays:list');
    clear(list);
    if (!items.length) { list.append(empty('No recordings yet', 'Start a recording, play a round, then stop it. It appears here.')); clear(stage); return; }
    const total = items.reduce((a, x) => a + x.size, 0);
    list.append(h('div.muted.small.mono.rp-total', `${items.length} recordings · ${fmt.bytes(total)}`));
    for (const it of items) {
      list.append(h(`button.rp-item${current && current.id === it.id ? '.is-active' : ''}`, { type: 'button', on: { click: () => open(it) } },
        h('div.rp-item-title', it.title), h('div.muted.small.mono', `${fmt.datetime(it.createdAt)} · ${tc(it.durationSec)} · ${fmt.bytes(it.size)}`),
        h('div.inline.small', it.clipOf ? h('span.badge.badge-muted', 'clip') : null, it.bookmarks.length ? h('span.badge.badge-muted', `${it.bookmarks.length} bookmarks`) : null)));
    }
    const pick = items.find((x) => x.id === (selectId || (current && current.id))) || items[0];
    if (!current || current.id !== pick.id || selectId) open(pick);
  }

  function open(it) {
    current = it;
    for (const b of list.querySelectorAll('.rp-item')) b.classList.toggle('is-active', b.querySelector('.rp-item-title').textContent === it.title);
    clear(stage);
    const video = h('video.rp-video', { controls: true, preload: 'metadata', crossOrigin: 'anonymous' });
    video.src = it.url;
    // MediaRecorder WebM files have no duration header; seeking far forward makes Chromium compute it.
    video.addEventListener('loadedmetadata', () => {
      if (!Number.isFinite(video.duration)) {
        video.currentTime = 1e101;
        video.addEventListener('durationchange', function fix() { if (Number.isFinite(video.duration)) { video.removeEventListener('durationchange', fix); video.currentTime = 0; if (!it.durationSec) api('replays:update', it.id, { durationSec: video.duration }); } });
      }
    });
    const speed = select(['0.25', '0.5', '0.75', '1', '1.5', '2'].map((v) => ({ value: v, label: `${v}×` })), '1', (v) => { video.playbackRate = Number(v); });
    let clipFrom = null; let clipTo = null;
    const clipInfo = h('span.mono.small.muted', 'No clip range set');
    const drawClip = () => { clipInfo.textContent = clipFrom == null ? 'No clip range set' : `Clip ${tc(clipFrom)} → ${clipTo == null ? '…' : tc(clipTo)}`; };
    const marks = h('div.rows.rp-marks');
    const drawMarks = () => {
      clear(marks).append(...(it.bookmarks.length ? it.bookmarks.slice().sort((a, b) => a.t - b.t).map((b) => h('div.row',
        h('button.linklike.mono', { type: 'button', on: { click: () => { video.currentTime = b.t; video.play(); } } }, tc(b.t)), h('span.grow', b.label),
        button('', async () => { it.bookmarks = it.bookmarks.filter((x) => x !== b); await api('replays:update', it.id, { bookmarks: it.bookmarks }); drawMarks(); }, { small: true, kind: 'quiet', iconName: 'close', title: 'Remove' })))
        : [h('p.muted.small', 'No bookmarks. Add one at the current position, or press the bookmark hotkey while recording.')]));
    };
    drawMarks();
    stage.append(
      h('div.rp-head', h('h2', it.title), h('div.inline',
        button('Rename', async () => { const t = await promptDialog('Rename recording', 'Title', it.title); if (t) { await api('replays:update', it.id, { title: t }); load(it.id); } }, { small: true, iconName: 'edit' }),
        button('Export', async () => { const f = await api('replays:export', it.id); if (f) toast(`Saved ${f}`, 'ok'); }, { small: true, iconName: 'download' }),
        button('Show file', () => api('replays:reveal', it.id), { small: true, iconName: 'folder' }),
        button('Delete', async () => { if (await confirmDialog('Delete recording', `Delete “${it.title}” permanently?`, { danger: true, confirm: 'Delete' })) { await api('replays:delete', it.id); current = null; load(); } }, { small: true, kind: 'danger', iconName: 'trash' }))),
      h('div.frame.rp-frame', video),
      h('div.rp-controls', h('label.inline.small', h('span.muted', 'Speed'), speed),
        button('−5s', () => { video.currentTime = Math.max(0, video.currentTime - 5); }, { small: true }),
        button('+5s', () => { video.currentTime += 5; }, { small: true }),
        button('Frame', () => { video.pause(); video.currentTime += 1 / 60; }, { small: true, title: 'Step one frame' }),
        h('span.grow'),
        button('Bookmark here', async () => { const label = await promptDialog('Bookmark', 'Label', `Bookmark ${it.bookmarks.length + 1}`); if (label == null) return; it.bookmarks.push({ t: video.currentTime, label }); await api('replays:update', it.id, { bookmarks: it.bookmarks }); drawMarks(); }, { small: true, iconName: 'bookmark' })),
      h('div.split',
        h('section.section', h('div.section-head', h('h3', 'Bookmarks')), marks),
        h('section.section', h('div.section-head', h('h3', 'Export a clip')),
          h('p.muted.small', 'Set the start and end at the current playback position. The clip is re-encoded in real time, so a 30-second clip takes about 30 seconds.'),
          h('div.inline', button('Set start', () => { clipFrom = video.currentTime; if (clipTo != null && clipTo <= clipFrom) clipTo = null; drawClip(); }, { small: true }),
            button('Set end', () => { if (clipFrom == null || video.currentTime <= clipFrom) { toast('Set a start before the end', 'warn'); return; } clipTo = video.currentTime; drawClip(); }, { small: true }), clipInfo),
          h('div.inline', button('Create clip', async (e) => {
            if (clipFrom == null || clipTo == null) { toast('Set a start and an end first', 'warn'); return; }
            const btn = e.currentTarget; const label = btn.querySelector('span');
            try { const clip = await recorder.exportClip(it, clipFrom, clipTo, (p) => { label.textContent = `Encoding ${Math.round(Math.min(1, p) * 100)}%`; }); toast('Clip saved', 'ok'); load(clip.id); }
            catch (err) { fail(err, 'Clip failed: '); } finally { label.textContent = 'Create clip'; }
          }, { small: true, kind: 'primary', iconName: 'film' })))));
  }

  const off = [subscribe('replays', () => load()), subscribe('recording', drawRec)];
  await load();
  return () => off.forEach((f) => f && f());
}
