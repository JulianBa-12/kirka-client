'use strict';
/**
 * Validator for Owner-published CSS overrides.
 *
 * Remote CSS is powerful enough to exfiltrate data (url() beacons, attribute
 * selectors) or hide security-relevant UI, so overrides are deliberately limited:
 *   - selectors must target Polaris-scoped hooks: `.pl-*`, `[data-pl-*]`, or `:root`
 *     (`:root` may only declare custom properties `--*`)
 *   - no at-rules except @media and @keyframes
 *   - no url(), image-set(), expression(), javascript:, behavior, -moz-binding, @import, @font-face
 *   - no `content:` with attr() (prevents reflecting attribute data)
 *   - size limit
 * Returns { ok, css, errors }. `css` is the normalized stylesheet.
 */

const MAX_BYTES = 64 * 1024;
const FORBIDDEN_VALUE = /(url\s*\(|image-set\s*\(|expression\s*\(|javascript:|vbscript:|behavior\s*:|-moz-binding|@import|attr\s*\(|\\[0-9a-f]|<\/?style|<\/?script|data:)/i;
const ALLOWED_SELECTOR_PART = /^(:root|\.pl-[a-z0-9_-]+|\[data-pl-[a-z0-9_-]+(=("[^"]{0,64}"|'[^']{0,64}'|[a-z0-9_-]{1,64}))?\]|::?(hover|active|focus|focus-visible|focus-within|disabled|checked|first-child|last-child|before|after|placeholder|not\([^()]*\)|nth-child\([0-9n+\-\s]*\)))+$/i;
const ALLOWED_PROPERTY = /^(--[a-z0-9-]{1,64}|[a-z-]{2,40})$/;

function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }

function checkSelector(sel, errors) {
  const parts = sel.trim().split(/\s*[>+~\s]\s*/).filter(Boolean);
  if (!parts.length) { errors.push(`empty selector`); return false; }
  for (const p of parts) {
    if (!ALLOWED_SELECTOR_PART.test(p)) { errors.push(`selector "${sel.trim()}" is not allowed (use .pl-* or [data-pl-*] hooks)`); return false; }
  }
  return true;
}

function checkDeclarations(body, isRoot, errors, ctx) {
  const out = [];
  for (const raw of body.split(';')) {
    const decl = raw.trim();
    if (!decl) continue;
    const idx = decl.indexOf(':');
    if (idx < 1) { errors.push(`${ctx}: malformed declaration "${decl.slice(0, 40)}"`); continue; }
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (!ALLOWED_PROPERTY.test(prop)) { errors.push(`${ctx}: property "${prop}" is not allowed`); continue; }
    if (isRoot && !prop.startsWith('--')) { errors.push(`${ctx}: :root may only set custom properties (--*)`); continue; }
    if (FORBIDDEN_VALUE.test(value)) { errors.push(`${ctx}: value of "${prop}" contains a forbidden construct`); continue; }
    if (value.length > 500) { errors.push(`${ctx}: value of "${prop}" is too long`); continue; }
    out.push(`  ${prop}: ${value};`);
  }
  return out;
}

function parseBlocks(css, errors, depth = 0) {
  const out = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open === -1) { if (css.slice(i).trim()) errors.push('trailing content outside of a rule'); break; }
    const head = css.slice(i, open).trim();
    // find matching close brace
    let level = 1, j = open + 1;
    while (j < css.length && level > 0) { if (css[j] === '{') level++; else if (css[j] === '}') level--; j++; }
    if (level !== 0) { errors.push('unbalanced braces'); break; }
    const body = css.slice(open + 1, j - 1);
    if (head.startsWith('@')) {
      const m = /^@(media|keyframes)\b(.*)$/i.exec(head);
      if (!m) { errors.push(`at-rule "${head.split(/\s/)[0]}" is not allowed`); }
      else if (FORBIDDEN_VALUE.test(m[2])) { errors.push(`at-rule condition is not allowed`); }
      else if (m[1].toLowerCase() === 'media') {
        if (depth > 0) errors.push('nested @media is not allowed');
        else { const inner = parseBlocks(body, errors, depth + 1); out.push(`@media${m[2]} {\n${inner.join('\n')}\n}`); }
      } else {
        const name = m[2].trim();
        if (!/^pl-[a-z0-9_-]{1,40}$/i.test(name)) errors.push(`@keyframes name must start with "pl-"`);
        else {
          const frames = [];
          body.replace(/([^{}]+)\{([^{}]*)\}/g, (_, sel, decls) => {
            const s = sel.trim();
            if (!/^((from|to|\d{1,3}%)\s*,?\s*)+$/.test(s)) { errors.push(`invalid keyframe selector "${s}"`); return ''; }
            frames.push(`  ${s} {\n${checkDeclarations(decls, false, errors, `@keyframes ${name}`).map((d) => '  ' + d).join('\n')}\n  }`);
            return '';
          });
          out.push(`@keyframes ${name} {\n${frames.join('\n')}\n}`);
        }
      }
    } else {
      if (body.includes('{')) { errors.push(`nested rules are not allowed in "${head}"`); }
      else {
        const selectors = head.split(',').map((x) => x.trim()).filter(Boolean);
        const okSel = selectors.filter((sel) => checkSelector(sel, errors));
        if (okSel.length === selectors.length && okSel.length) {
          const isRoot = okSel.every((x) => x === ':root');
          if (okSel.includes(':root') && !isRoot) errors.push(':root cannot be combined with other selectors');
          else out.push(`${okSel.join(', ')} {\n${checkDeclarations(body, isRoot, errors, head).join('\n')}\n}`);
        }
      }
    }
    i = j;
  }
  return out;
}

function sanitizeCss(input) {
  const errors = [];
  if (typeof input !== 'string') return { ok: false, css: '', errors: ['CSS must be a string'] };
  if (input.length > MAX_BYTES) return { ok: false, css: '', errors: ['CSS is larger than 64 KB'] };
  const css = stripComments(input);
  if (css.includes('<')) errors.push('HTML markup ("<") is not allowed in CSS');
  const blocks = parseBlocks(css, errors);
  return { ok: errors.length === 0, css: blocks.join('\n\n'), errors };
}

module.exports = { sanitizeCss };
