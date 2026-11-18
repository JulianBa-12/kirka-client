/* Smart Setup — first-run wizard. Reads real system information (CPU cores, memory, GPU
 * feature status, display size), derives recommendations and lets the player accept or decline
 * each one individually. Nothing is applied before "Finish". */
import { h, icon, clear, select } from './dom.js';
import { api, store, updateSettings, toast, fail, t } from './store.js';
import { LANGUAGES, setLanguage } from './i18n.js';

function recommendations(sys) {
  const gpuOk = sys.gpuFeatureStatus && /^enabled/.test(sys.gpuFeatureStatus.webgl || '') && /^enabled/.test(sys.gpuFeatureStatus.gpu_compositing || '');
  const lowEnd = sys.totalMemoryMB < 8192 || sys.cores <= 4 || !gpuOk;
  const w = window.screen.width * (window.devicePixelRatio || 1);
  const out = [];
  out.push(lowEnd
    ? { id: 'perf', title: 'Use the “Performance” profile', why: `${sys.cores} CPU threads, ${Math.round(sys.totalMemoryMB / 1024)} GB memory${gpuOk ? '' : ', WebGL not fully hardware accelerated'} — the lightest profile leaves the most headroom for the game.`, apply: (s) => { s.performance.profile = 'performance'; s.performance.animatedBackgrounds = false; s.appearance.motion = false; s.appearance.decorativeEffects = false; }, restart: false }
    : { id: 'perf', title: 'Keep the “Balanced” profile', why: `${sys.cores} CPU threads and ${Math.round(sys.totalMemoryMB / 1024)} GB memory are enough for light interface animations.`, apply: (s) => { s.performance.profile = 'balanced'; }, restart: false });
  out.push({ id: 'fps', title: 'Unlock the frame rate', why: 'Kirka.io is otherwise capped to the display refresh rate. Takes effect after a restart.', apply: (s) => { s.performance.fpsUnlock = true; }, restart: true, skip: store.settings.performance.fpsUnlock });
  if (!gpuOk) out.push({ id: 'hwa', title: 'Keep hardware acceleration on', why: `Chromium reports WebGL as “${(sys.gpuFeatureStatus || {}).webgl || 'unknown'}”. Turning acceleration off rarely helps; try a driver update first. Decline to turn it off.`, apply: () => {}, decline: (s) => { s.performance.hardwareAcceleration = false; }, declineRestart: true });
  if (w >= 2560) out.push({ id: 'scale', title: 'Larger interface (110 %)', why: `Your display is ${Math.round(w)} px wide.`, apply: (s) => { s.appearance.uiScale = 1.1; } });
  else if (w < 1400) out.push({ id: 'dense', title: 'Compact density', why: `Your display is ${Math.round(w)} px wide — compact rows show more at once.`, apply: (s) => { s.appearance.density = 'compact'; } });
  out.push({ id: 'backup', title: 'Daily automatic backups', why: 'Keeps the last 7 snapshots of settings, profiles, workspaces and journal locally. Restorable from the Backup Vault.', apply: (s) => { s.backups.auto = true; } });
  out.push({ id: 'live', title: 'Receive live updates from the Polaris server', why: 'Configuration, announcements and maintenance notices arrive instantly when a server is configured. No data about your games is sent.', apply: (s) => { s.realtime.enabled = true; }, decline: (s) => { s.realtime.enabled = false; } });
  return out.filter((r) => !r.skip);
}

export async function smartSetup() {
  let step = 0; let sys = null; let recs = []; const choice = {};
  let lang = store.settings.general.language || 'en';
  const body = h('div.setup-body'); const steps = h('ol.setup-steps');
  const back = h('button.btn.btn-ghost', { type: 'button' }, t('Back'));
  const next = h('button.btn.btn-primary', { type: 'button' }, t('Continue'));
  const skip = h('button.btn.btn-quiet', { type: 'button' }, t('Skip setup'));
  const box = h('div.setup', { role: 'dialog', 'aria-label': 'Smart Setup' }, h('div.setup-head', h('div.pl-label', 'Polaris'), h('h1', t('Smart Setup'))), steps, body, h('div.setup-foot', skip, h('span.grow'), back, next));
  const overlay = h('div.setup-overlay', box);
  const NAMES = ['Welcome', 'Your system', 'Import', 'Finish'];
  const finish = async (apply) => {
    let restart = false;
    try {
      await updateSettings((s) => {
        s.general.language = lang; s.onboardingDone = true;
        if (apply) for (const r of recs) { if (choice[r.id] === true) { r.apply(s); if (r.restart) restart = true; } else if (choice[r.id] === false && r.decline) { r.decline(s); if (r.restart || r.declineRestart) restart = true; } }
      }, { immediate: true });
    } catch (e) { fail(e); }
    overlay.remove();
    if (restart) toast(t('Some choices take effect after a restart (Settings → Advanced → Restart).'), 'warn', 8000); else if (apply) toast(t('Setup complete'), 'ok');
  };
  skip.onclick = () => finish(false);
  back.onclick = () => { if (step > 0) { step--; draw(); } };
  next.onclick = async () => { if (step === 3) return finish(true); step++; draw(); };

  async function draw() {
    clear(steps).append(NAMES.map((n, i) => h(`li${i === step ? '.is-on' : i < step ? '.is-done' : ''}`, t(n))));
    back.disabled = step === 0; next.textContent = t(step === 3 ? 'Finish' : 'Continue');
    clear(body);
    if (step === 0) {
      body.append(h('p.text2', t('Polaris is a desktop client for Kirka.io. It loads the official game and adds a custom crosshair, HUD overlays, local cosmetics, recording and performance tools around it.')),
        h('div.note', h('b', t('What Polaris does not do')), ' ', t('No cheats, aimbots, wallhacks or automation. Polaris does not read game memory, change hitboxes or touch your Kirka account, inventory or KC. Skins you create here are local cosmetics.')),
        h('label.field', h('span.field-label', t('Language')), select(LANGUAGES, lang, (v) => { lang = v; setLanguage(v); draw(); })),
        h('p.small.muted', t('Usage statistics and crash reports are off. You can opt in under Settings → Privacy.')));
    } else if (step === 1) {
      if (!sys) { body.append(h('p.muted', t('Reading system information…'))); try { sys = await api('metrics:system'); recs = recommendations(sys); for (const r of recs) if (!(r.id in choice)) choice[r.id] = true; } catch (e) { body.append(h('div.note.note-danger', e.message)); return; } clear(body); }
      body.append(h('div.setup-sys.mono.small', h('span', sys.cpuModel), h('span', `${sys.cores} threads`), h('span', `${Math.round(sys.totalMemoryMB / 1024)} GB RAM`), h('span', `WebGL: ${(sys.gpuFeatureStatus || {}).webgl || 'unknown'}`), sys.gpuRenderer ? h('span', sys.gpuRenderer) : null),
        h('p.small.muted', t('Recommendations based on this machine. Accept or decline each one — nothing changes until you press Finish.')),
        h('div.setup-recs', recs.map((r) => {
          const yes = h('button.btn.btn-ghost.btn-sm', { type: 'button' }, icon('check', 13), t('Accept'));
          const no = h('button.btn.btn-ghost.btn-sm', { type: 'button' }, icon('close', 13), t('Decline'));
          const mark = () => { yes.classList.toggle('is-on', choice[r.id] === true); no.classList.toggle('is-on', choice[r.id] === false); };
          yes.onclick = () => { choice[r.id] = true; mark(); }; no.onclick = () => { choice[r.id] = false; mark(); }; mark();
          return h('div.setup-rec', h('div', h('div.row-title', t(r.title), r.restart ? h('span.badge.badge-muted', t('restart')) : r.declineRestart ? h('span.badge.badge-muted', t('restart if declined')) : null), h('div.row-desc', t(r.why))), h('div.inline', yes, no));
        })));
    } else if (step === 2) {
      body.append(h('p.text2', t('Coming from another installation? Import a Polaris settings export or a Backup Vault file. Otherwise continue.')),
        h('div.inline',
          h('button.btn', { type: 'button', on: { click: async () => { try { const r = await api('settings:import'); if (r) { store.settings = r.settings; toast(t('Settings imported'), 'ok'); } } catch (e) { fail(e); } } } }, icon('upload', 14), t('Import settings export')),
          h('button.btn', { type: 'button', on: { click: async () => { try { const r = await api('backups:import'); if (r) toast(t('Backup added to the vault — restore it from Tools → Backup Vault'), 'ok', 6000); } catch (e) { fail(e); } } } }, icon('archive', 14), t('Import backup file'))));
    } else {
      const acc = recs.filter((r) => choice[r.id]);
      body.append(h('p.text2', t('Ready. These changes will be applied:')),
        h('ul.setup-summary', h('li', `${t('Language')}: ${(LANGUAGES.find((l) => l.value === lang) || {}).label}`), acc.map((r) => h('li', t(r.title))), recs.filter((r) => choice[r.id] === false && r.decline).map((r) => h('li', `${t('Declined')}: ${t(r.title)}`))),
        h('p.small.muted', `${store.settings.commands.paletteKey} ${t('opens the Command Center from anywhere — search any page, action or setting.')}`));
    }
  }
  document.body.append(overlay);
  draw();
}
