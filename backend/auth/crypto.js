'use strict';
/**
 * Password hashing (scrypt, memory-hard; parameters encoded in the hash so they
 * can be raised later) and RFC 6238 TOTP for two-factor authentication.
 */
const crypto = require('crypto');

const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64, maxmem: 96 * 1024 * 1024 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password.normalize('NFKC'), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  try {
    const [alg, N, r, p, saltB64, hashB64] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, { N: +N, r: +r, p: +p, maxmem: SCRYPT.maxmem });
    return crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}

// A pre-computed hash used to equalize timing when the username does not exist.
const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString('hex'));

/* ---------- base32 (RFC 4648) ---------- */
const ALPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { out += ALPH[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += ALPH[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(str) {
  const clean = str.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0, value = 0; const out = [];
  for (const ch of clean) { const idx = ALPH.indexOf(ch); if (idx < 0) throw new Error('invalid base32'); value = (value << 5) | idx; bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}

function totpAt(secretB32, counter) {
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', base32Decode(secretB32)).update(buf).digest();
  const off = h[h.length - 1] & 0xf;
  const code = ((h[off] & 0x7f) << 24 | h[off + 1] << 16 | h[off + 2] << 8 | h[off + 3]) % 1e6;
  return String(code).padStart(6, '0');
}

/** Verifies a 6-digit code within ±1 step (30 s). */
function verifyTotp(secretB32, code, at = Date.now()) {
  if (!/^\d{6}$/.test(String(code || ''))) return false;
  const step = Math.floor(at / 30000);
  for (const d of [-1, 0, 1]) {
    const expect = totpAt(secretB32, step + d);
    if (crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(String(code)))) return true;
  }
  return false;
}

const newTotpSecret = () => base32Encode(crypto.randomBytes(20));

module.exports = { hashPassword, verifyPassword, DUMMY_HASH, verifyTotp, totpAt, newTotpSecret, base32Encode, base32Decode };
