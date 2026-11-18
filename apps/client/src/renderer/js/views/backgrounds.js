/* backgrounds studio — a dedicated page that hosts the backgrounds pane of the customization module. */
import { render as renderCustomization } from './customization.js';

export function render(root, params = {}) { return renderCustomization(root, { ...params, tab: 'backgrounds', single: true }); }
