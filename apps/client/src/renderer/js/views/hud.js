/* hud studio — a dedicated page that hosts the hud pane of the customization module. */
import { render as renderCustomization } from './customization.js';

export function render(root, params = {}) { return renderCustomization(root, { ...params, tab: 'hud', single: true }); }
