import { boot } from '../core/chrome.js';
import { $ } from '../core/dom.js';
import { catalog } from '../core/items.js';

const { community } = await boot('resources');
$('[data-bind="rules"]').textContent = community.marketplaceRules || '';

await catalog($('[data-bind="catalog"]'), { kinds: ['background','resource','crosshair','hud','theme'], view: 'table', community, noun: 'resource library', pageSize: 25 });
