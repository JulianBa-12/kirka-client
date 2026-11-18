/* Replay recorder: captures the Polaris window (including the game view) with MediaRecorder.
 * Kirka.io has no replay API, so Polaris records video instead of match data.
 * Audio is not captured on Linux (Chromium window capture provides video only). */
import { api, store, toast, emit } from './store.js';

let rec = null;       // { id, mr, stream, startedAt, bookmarks, chain, timer, size }
const ind = () => document.getElementById('rec-indicator');

export function init() {
  setInterval(() => {
    if (!rec) return;
    const sec = (Date.now() - rec.startedAt) / 1000;
    const el = ind();
    el.textContent = `REC ${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')} · ${(rec.size / 1048576).toFixed(1)} MB`;
    if (sec > store.settings.replays.maxMinutes * 60) { toast(`Recording stopped at the ${store.settings.replays.maxMinutes}-minute limit`, 'warn'); stop(); }
  }, 500);
}

export const isRecording = () => !!rec;
export const state = () => (rec ? { startedAt: rec.startedAt, bookmarks: rec.bookmarks.slice(), size: rec.size } : null);

function pickMime(codec) {
  const list = codec === 'vp8' ? ['video/webm;codecs=vp8', 'video/webm'] : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return list.find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

export async function start() {
  if (rec) return;
  const cfg = store.settings.replays;
  let stream;
  try { stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: cfg.fps }, audio: false }); }
  catch (e) { toast(`Recording could not start: ${e.message}. Window capture may be unavailable on this desktop session.`, 'error', 7000); return; }
  let id;
  try { id = await api('replays:start', { inMatch: store.game.inMatch }); }
  catch (e) { stream.getTracks().forEach((t) => t.stop()); toast(e.message, 'error'); return; }
  const mime = pickMime(cfg.codec);
  const mr = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: cfg.bitrateMbps * 1e6 });
  rec = { id, mr, stream, startedAt: Date.now(), bookmarks: [], chain: Promise.resolve(), size: 0, inMatch: store.game.inMatch };
  mr.ondataavailable = (e) => {
    if (!e.data || !e.data.size || !rec) return;
    const r = rec;
    r.chain = r.chain.then(async () => { const buf = new Uint8Array(await e.data.arrayBuffer()); r.size = await api('replays:chunk', r.id, buf); }).catch((err) => { toast(`Recording write failed: ${err.message}`, 'error'); });
  };
  stream.getVideoTracks()[0].addEventListener('ended', () => { if (rec) stop(); });
  mr.start(1000);
  ind().hidden = false;
  toast('Recording started', 'ok', 2000);
  emit('recording', true);
}

export async function stop() {
  if (!rec) return null;
  const r = rec;
  await new Promise((resolve) => { r.mr.onstop = resolve; try { r.mr.stop(); } catch { resolve(); } });
  r.stream.getTracks().forEach((t) => t.stop());
  rec = null; ind().hidden = true;
  await r.chain;
  try {
    const item = await api('replays:finish', r.id, { durationSec: (Date.now() - r.startedAt) / 1000, bookmarks: r.bookmarks, inMatch: r.inMatch });
    toast(`Saved replay “${item.title}”`, 'ok');
    emit('recording', false); emit('replays');
    return item;
  } catch (e) { toast(`Recording could not be saved: ${e.message}`, 'error'); emit('recording', false); return null; }
}

export function bookmark(label) {
  if (!rec) { toast('Start a recording first to add bookmarks', 'warn', 2500); return; }
  const t = (Date.now() - rec.startedAt) / 1000;
  rec.bookmarks.push({ t, label: label || `Bookmark ${rec.bookmarks.length + 1}` });
  toast(`Bookmark at ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`, 'info', 1500);
}

/** Export a clip [from,to] (seconds) of an existing replay by re-recording the played-back segment. */
export async function exportClip(item, from, to, onProgress) {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous'; video.src = item.url; video.muted = true; video.preload = 'auto';
  await new Promise((res, rej) => { video.onloadedmetadata = res; video.onerror = () => rej(new Error('Could not load the replay')); });
  video.currentTime = from;
  await new Promise((res) => { video.onseeked = res; });
  const stream = video.captureStream();
  const id = await api('replays:start', { clipOf: item.id });
  const mr = new MediaRecorder(stream, { mimeType: pickMime(store.settings.replays.codec) || undefined, videoBitsPerSecond: store.settings.replays.bitrateMbps * 1e6 });
  let chain = Promise.resolve();
  mr.ondataavailable = (e) => { if (e.data && e.data.size) chain = chain.then(async () => api('replays:chunk', id, new Uint8Array(await e.data.arrayBuffer()))); };
  const done = new Promise((res) => { mr.onstop = res; });
  mr.start(1000);
  await video.play();
  await new Promise((res) => {
    const tick = () => { if (onProgress) onProgress((video.currentTime - from) / (to - from)); if (video.currentTime >= to || video.ended) res(); else requestAnimationFrame(tick); };
    tick();
  });
  video.pause(); mr.stop(); await done; await chain;
  stream.getTracks().forEach((t) => t.stop());
  const bookmarks = (item.bookmarks || []).filter((b) => b.t >= from && b.t <= to).map((b) => ({ t: b.t - from, label: b.label }));
  return api('replays:finish', id, { title: `${item.title} (clip)`.slice(0, 80), durationSec: to - from, bookmarks, clipOf: item.id });
}
