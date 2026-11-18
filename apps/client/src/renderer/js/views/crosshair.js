/* crosshair studio — a dedicated page that hosts the crosshair pane of the customization module. */
import { render as renderCustomization } from './customization.js';

export function render(root, params = {}) { return renderCustomization(root, { ...params, tab: 'crosshair', single: true }); }
