const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const toDate = (v) => { const d = v instanceof Date ? v : new Date(v); return Number.isNaN(d.getTime()) ? null : d; };

/** "14 Nov 2026" */
export function date(v) {
  const d = toDate(v); if (!d) return '—';
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
/** "2026-11-14" */
export function isoDate(v) { const d = toDate(v); return d ? d.toISOString().slice(0, 10) : ''; }
/** "14.11" + "2026" split for index columns */
export function dateParts(v) {
  const d = toDate(v); if (!d) return { day: '—', month: '', year: '' };
  return { day: String(d.getDate()).padStart(2, '0'), month: MONTHS[d.getMonth()].toUpperCase(), year: String(d.getFullYear()) };
}

export function relative(v) {
  const d = toDate(v); if (!d) return '';
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const hr = Math.round(m / 60); if (hr < 24) return `${hr} h ago`;
  const days = Math.round(hr / 24); if (days < 30) return `${days} d ago`;
  return date(d);
}

export function bytes(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return '—';
  if (v < 1024) return `${v} B`;
  const units = ['KB', 'MB', 'GB'];
  let x = v / 1024; let i = 0;
  while (x >= 1024 && i < units.length - 1) { x /= 1024; i++; }
  return `${x.toFixed(x >= 100 ? 0 : 1)} ${units[i]}`;
}

export function number(n) { const v = Number(n); return Number.isFinite(v) ? v.toLocaleString('en-US') : '—'; }

/** sha512 in the manifest is base64; sha512sum prints hex. */
export function base64ToHex(b64) {
  try {
    const bin = atob(String(b64).trim());
    let out = '';
    for (let i = 0; i < bin.length; i++) out += bin.charCodeAt(i).toString(16).padStart(2, '0');
    return out;
  } catch { return ''; }
}

export function initials(user) {
  const s = (user && (user.displayName || user.username)) || '?';
  return s.trim().slice(0, 1).toUpperCase();
}

export function pad(n, w = 2) { return String(n).padStart(w, '0'); }

const PLATFORM = { 'linux-appimage': 'AppImage', 'linux-deb': 'Debian package' };
export function platformLabel(p) { return PLATFORM[p] || p; }
