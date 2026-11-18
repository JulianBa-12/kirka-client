/**
 * Safe Markdown subset renderer (escape-first). CommonJS + browser global (window.PolarisMarkdown).
 * Supports: # ## ### headings, paragraphs, **bold**, *em*, `code`, ``` fences, - lists, 1. lists,
 * > quotes, [text](https://… | relative.html) links, --- rules, | pipe | tables |.
 */
(function (root) {
  'use strict';
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  function inline(s) {
    let out = esc(s);
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
    out = out.replace(/\[([^\]]+)\]\(((?:https:\/\/|\/|[a-z0-9_-]+\.html)[^\s)]*)\)/gi, (m, text, href) => `<a href="${href}" rel="noopener noreferrer"${href.startsWith('https://') ? ' target="_blank"' : ''}>${text}</a>`);
    return out;
  }
  function render(md) {
    const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
    const html = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^```/.test(line)) {
        const buf = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++; html.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`); continue;
      }
      const h = /^(#{1,4})\s+(.*)$/.exec(line);
      if (h) { const n = Math.min(5, h[1].length + 1); html.push(`<h${n}>${inline(h[2])}</h${n}>`); i++; continue; }
      if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
        const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => inline(c.trim().replace(/\\\|/g, '|')));
        const head = cells(line); i += 2;
        const rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
        html.push(`<div class="md-table"><table><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      if (/^---+\s*$/.test(line)) { html.push('<hr>'); i++; continue; }
      if (/^>\s?/.test(line)) { const buf = []; while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, '')); html.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`); continue; }
      if (/^\s*[-*]\s+/.test(line)) { const buf = []; while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) buf.push(`<li>${inline(lines[i++].replace(/^\s*[-*]\s+/, ''))}</li>`); html.push(`<ul>${buf.join('')}</ul>`); continue; }
      if (/^\s*\d+\.\s+/.test(line)) { const buf = []; while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) buf.push(`<li>${inline(lines[i++].replace(/^\s*\d+\.\s+/, ''))}</li>`); html.push(`<ol>${buf.join('')}</ol>`); continue; }
      if (!line.trim()) { i++; continue; }
      const buf = [lines[i++]];
      while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>|\s*\|.*\|\s*$|\s*[-*]\s+|\s*\d+\.\s+|---+\s*$)/.test(lines[i])) buf.push(lines[i++]);
      html.push(`<p>${inline(buf.join(' '))}</p>`);
    }
    return html.join('\n');
  }
  const api = { render, escape: esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PolarisMarkdown = api;
})(typeof window !== 'undefined' ? window : globalThis);
