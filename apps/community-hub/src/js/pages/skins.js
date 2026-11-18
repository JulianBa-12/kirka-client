import { boot } from '../core/chrome.js';
import { $ } from '../core/dom.js';
import { catalog } from '../core/items.js';

const { community } = await boot('skins');
$('[data-bind="rules"]').textContent = community.marketplaceRules || '';
if (community.requireApproval) $('[data-bind="facts"]').insertAdjacentHTML('beforeend', '<li>Review <strong>Moderated</strong></li>');
await catalog($('[data-bind="catalog"]'), { kinds: ['skin'], view: 'sheet', community, noun: 'skin gallery', pageSize: 30 });
