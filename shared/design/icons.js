/**
 * Polaris icon set — drawn on a 20×20 grid, 1.5px strokes, square caps.
 * Works as CommonJS (backend/main) and as a browser global (window.PolarisIcons).
 * Usage: icon('home') -> '<svg ...>...</svg>'
 */
(function (root) {
  'use strict';
  const P = {
    home: 'M3 9.5 10 3.5l7 6V17H12v-4.5H8V17H3z',
    play: 'M6 3.8v12.4L16 10z',
    sliders: 'M4 5h7M15 5h1M4 10h2M10 10h6M4 15h9M17 15h-0M11 3.5v3M6 8.5v3M13 13.5v3',
    brush: 'M15.5 3.5 9 10l1 1 6.5-6.5zM8.5 11.5c-2 0-3 1.2-3 3 0 1-.7 1.6-1.5 2 3 .6 6-.4 6-3.2z',
    box: 'M3 6.5 10 3l7 3.5v7L10 17l-7-3.5zM3 6.5 10 10l7-3.5M10 10v7',
    store: 'M3.5 7.5 5 3.5h10l1.5 4M3.5 7.5h13M4.5 7.5V16.5h11V7.5M8 16.5V12h4v4.5',
    users: 'M7.5 9.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2.5 16.5c.5-3 2.4-4.5 5-4.5s4.5 1.5 5 4.5M13 3.7a3 3 0 0 1 0 5.6M14.5 12.3c1.6.6 2.6 2 3 4.2',
    chart: 'M3 16.5h14M5 13.5V10M9 13.5V5.5M13 13.5V8M17 13.5V3.5',
    film: 'M3 4h14v12H3zM6 4v12M14 4v12M3 8h3M3 12h3M14 8h3M14 12h3',
    gauge: 'M3.3 14.5a7.5 7.5 0 1 1 13.4 0M10 11.5l3.5-4.5M10 11.5a.5.5 0 1 0 0 .01',
    layers: 'M10 3 17 7l-7 4-7-4zM3 10.5l7 4 7-4M3 14l7 4 7-4',
    cube: 'M10 2.8 16.5 6.5v7L10 17.2 3.5 13.5v-7zM10 10l6.5-3.5M10 10 3.5 6.5M10 10v7.2',
    map: 'M3 5.5 7.5 3.5l5 2 4.5-2v11l-4.5 2-5-2-4.5 2zM7.5 3.5v11M12.5 5.5v11',
    plug: 'M7 3v4M13 3v4M5 7h10v3a5 5 0 0 1-10 0zM10 15v2.5',
    download: 'M10 3v9.5M6 8.5l4 4 4-4M3.5 16.5h13',
    gear: 'M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4',
    globe: 'M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM2.5 10h15M10 2.5c2 2 3 4.5 3 7.5s-1 5.5-3 7.5c-2-2-3-4.5-3-7.5s1-5.5 3-7.5z',
    star: 'M10 2.5v15M2.5 10h15M10 2.5l1.3 6.2L17.5 10l-6.2 1.3L10 17.5l-1.3-6.2L2.5 10l6.2-1.3z',
    compass: 'M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM12.8 7.2l-1.6 4-4 1.6 1.6-4z',
    bell: 'M5 13.5V9a5 5 0 0 1 10 0v4.5l1.5 2h-13zM8.5 17.5h3',
    shield: 'M10 2.5 16 5v4.5c0 4-2.6 6.8-6 8-3.4-1.2-6-4-6-8V5z',
    flag: 'M4.5 17.5V3M4.5 3.5h10l-2 3.5 2 3.5h-10',
    heart: 'M10 16.5S3 12.3 3 7.6A3.6 3.6 0 0 1 10 6a3.6 3.6 0 0 1 7 1.6c0 4.7-7 8.9-7 8.9z',
    bolt: 'M11 2.5 4.5 11H10l-1 6.5L15.5 9H10z',
    crosshair: 'M10 2.5v5M10 12.5v5M2.5 10h5M12.5 10h5M10 10.01v-.02',
    image: 'M3 4h14v12H3zM3 13l4-4 4 4 2-2 4 4M13 7.5a.5.5 0 1 0 0 .01',
    message: 'M3 4h14v9.5H8l-4 3v-3H3z',
    minimize: 'M5 10h10',
    maximize: 'M5 5h10v10H5z',
    restore: 'M7 4h9v9M4 7h9v9H4z',
    close: 'M5 5l10 10M15 5 5 15',
    search: 'M8.5 14a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM12.5 12.5 17 17',
    plus: 'M10 4v12M4 10h12',
    minus: 'M4 10h12',
    check: 'M4 10.5 8 14.5 16 5.5',
    trash: 'M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l.8 11h7.4l.8-11',
    edit: 'M13.5 3.5l3 3L7 16H4v-3z',
    copy: 'M7 7h9v9H7zM4 13V4h9',
    upload: 'M10 13V3.5M6 7.5l4-4 4 4M3.5 16.5h13',
    external: 'M11 3.5h5.5V9M16.5 3.5 9 11M14 12v4.5H3.5V6H8',
    chevronRight: 'M8 5l5 5-5 5',
    chevronDown: 'M5 8l5 5 5-5',
    chevronLeft: 'M12 5l-5 5 5 5',
    grip: 'M7.5 5v.01M12.5 5v.01M7.5 10v.01M12.5 10v.01M7.5 15v.01M12.5 15v.01',
    eye: 'M2.5 10s2.7-5 7.5-5 7.5 5 7.5 5-2.7 5-7.5 5-7.5-5-7.5-5zM10 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    eyeOff: 'M3 3l14 14M8.3 5.2A7.7 7.7 0 0 1 10 5c4.8 0 7.5 5 7.5 5a12 12 0 0 1-2 2.6M5.4 6.5A12.4 12.4 0 0 0 2.5 10s2.7 5 7.5 5c1.2 0 2.3-.3 3.2-.8',
    lock: 'M5 9h10v8H5zM7 9V6.5a3 3 0 0 1 6 0V9',
    refresh: 'M16 6.5A6.5 6.5 0 0 0 4 8M4 3.5V8h4.5M4 13.5A6.5 6.5 0 0 0 16 12M16 16.5V12h-4.5',
    pause: 'M6.5 4v12M13.5 4v12',
    record: 'M10 14.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z',
    bookmark: 'M5.5 3h9v14l-4.5-3.5L5.5 17z',
    pencil: 'M3.5 16.5l1-4 9-9 3 3-9 9z',
    eraser: 'M7 16.5h9M3.5 12.5l7-7 5 5-6 6H7.5z',
    bucket: 'M4 9l6-6 6 6-6 6zM16 12s1.5 2 1.5 3a1.5 1.5 0 0 1-3 0c0-1 1.5-3 1.5-3z',
    pipette: 'M14.5 3.5l2 2-2.5 2.5-2-2zM12 6 4.5 13.5V15.5H6.5L14 8',
    undo: 'M7 5 3.5 8.5 7 12M3.5 8.5H12a4.5 4.5 0 0 1 0 9H9',
    redo: 'M13 5l3.5 3.5L13 12M16.5 8.5H8a4.5 4.5 0 0 0 0 9h3',
    grid: 'M3 3h14v14H3zM3 7.7h14M3 12.3h14M7.7 3v14M12.3 3v14',
    rotate: 'M15.5 7.5A6 6 0 1 0 16 12M16 3.5v4h-4',
    folder: 'M3 5h5l1.5 2H17v9H3z',
    info: 'M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM10 9v5M10 6v.01',
    alert: 'M10 3 18 16.5H2zM10 8v4M10 14.5v.01',
    logout: 'M8 3.5H3.5v13H8M12 6.5 15.5 10 12 13.5M15.5 10H7',
    database: 'M10 6.5c3.6 0 6.5-1 6.5-2.2S13.6 2 10 2 3.5 3 3.5 4.3 6.4 6.5 10 6.5zM3.5 4.3v11.4C3.5 17 6.4 18 10 18s6.5-1 6.5-2.3V4.3M3.5 10c0 1.3 2.9 2.3 6.5 2.3s6.5-1 6.5-2.3',
    server: 'M3 3.5h14v5H3zM3 11.5h14v5H3zM6 6h.01M6 14h.01',
    code: 'M7 6l-4 4 4 4M13 6l4 4-4 4',
    palette: 'M10 17.5a7.5 7.5 0 1 1 7.5-7.5c0 2-1.6 3-3.2 3H12.5a1.5 1.5 0 0 0-1 2.6c.7.8.2 1.9-1.5 1.9zM6.5 9.5v.01M9 6v.01M13 6.5v.01',
    key: 'M7 13a4 4 0 1 1 3.4-6.1L17 7v3h-2v2h-2.5l-1.6-1.9A4 4 0 0 1 7 13z',
    activity: 'M2.5 10h3l2-5 4 10 2-5h4',
    archive: 'M3 4h14v3.5H3zM4 7.5V16h12V7.5M8 10.5h4',
    clock: 'M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM10 6v4l3 2',
    send: 'M17 3 3 9l5.5 2.5L11 17z',
    block: 'M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM4.7 4.7l10.6 10.6',
    userPlus: 'M8 9.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2.5 16.5c.5-3 2.6-4.5 5.5-4.5 1.3 0 2.4.3 3.3.9M15 11v6M12 14h6',
  };
  function icon(name, opts) {
    const o = opts || {};
    const size = o.size || 18;
    const d = P[name] || P.star;
    const cls = o.className ? ` class="${o.className}"` : '';
    return `<svg${cls} width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="${o.stroke || 1.5}" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><path d="${d}"/></svg>`;
  }
  const api = { icon, paths: P, names: Object.keys(P) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PolarisIcons = api;
})(typeof window !== 'undefined' ? window : globalThis);
