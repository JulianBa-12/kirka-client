import { boot } from '../core/chrome.js';
import { $ } from '../core/dom.js';
import { catalog } from '../core/items.js';

const { community } = await boot('plugins');
$('[data-bind="rules"]').textContent = community.marketplaceRules || '';

await catalog($('[data-bind="catalog"]'), { kinds: ['plugin'], view: 'plugins', community, noun: 'plugin directory', pageSize: 25 });
