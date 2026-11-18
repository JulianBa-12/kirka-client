/* Images hosted on the Polaris server are fetched through the main process (which only allows
 * the configured server's /files/ path) and shown as blob: URLs. */
import { h } from './dom.js';
import { api } from './store.js';

const cache = new Map();
export function remoteImg(url, { className = '', alt = '' } = {}) {
  const img = h(`img${className ? `.${className.split(' ').join('.')}` : ''}`, { alt, loading: 'lazy' });
  if (!url) { img.classList.add('is-missing'); return img; }
  if (cache.has(url)) { img.src = cache.get(url); return img; }
  api('server:image', url).then((r) => {
    const u = URL.createObjectURL(new Blob([r.data], { type: r.type }));
    cache.set(url, u); img.src = u;
  }).catch(() => img.classList.add('is-missing'));
  return img;
}
