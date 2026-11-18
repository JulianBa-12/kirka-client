/**
 * Polaris crosshair renderer — one implementation for the Crosshair Studio preview
 * (shell) and the in-game overlay (game preload). UMD: window.PolarisCrosshair / module.exports.
 * draw(ctx, cfg, timeMs) draws centred on the canvas, in CSS pixels.
 */
(function (root) {
  'use strict';
  function animScale(cfg, t) {
    if (cfg.style !== 'animated' || cfg.animation === 'none') return { scale: 1, rot: 0, alpha: 1 };
    const sp = cfg.animationSpeed || 1;
    const ph = (t / 1000) * sp * Math.PI * 2;
    if (cfg.animation === 'pulse') return { scale: 1 + 0.18 * Math.max(0, Math.sin(ph)), rot: 0, alpha: 1 };
    if (cfg.animation === 'spin') return { scale: 1, rot: ((t / 1000) * sp * 90) % 360, alpha: 1 };
    if (cfg.animation === 'breathe') return { scale: 1, rot: 0, alpha: 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(ph)) };
    return { scale: 1, rot: 0, alpha: 1 };
  }

  function draw(ctx, cfg, t) {
    const dpr = ctx.canvas.__dpr || 1;
    const w = ctx.canvas.width / dpr; const h = ctx.canvas.height / dpr;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!cfg || cfg.enabled === false) { ctx.restore(); return; }
    const a = animScale(cfg, t || 0);
    ctx.translate(Math.round(w / 2), Math.round(h / 2));
    ctx.rotate(((cfg.rotation || 0) + a.rot) * Math.PI / 180);
    ctx.globalAlpha = Math.max(0, Math.min(1, (cfg.opacity == null ? 1 : cfg.opacity) * a.alpha));
    const size = cfg.size * a.scale; const th = cfg.thickness; const gap = cfg.gap * a.scale;
    const ol = cfg.outline ? cfg.outlineThickness : 0;

    const shapes = [];
    const bar = (x, y, bw, bh) => shapes.push(['rect', x, y, bw, bh]);
    switch (cfg.shape) {
      case 'dot': break;
      case 'circle': shapes.push(['ring', size, th]); break;
      case 'square': shapes.push(['square', size, th]); break;
      case 'x':
        shapes.push(['diag', size, th, gap]); break;
      case 'chevron': shapes.push(['chevron', size, th, gap]); break;
      case 'star': shapes.push(['star', size, th, gap]); break;
      case 'cross': default:
        if (!cfg.tStyle) bar(-th / 2, -gap - size, th, size);
        bar(-th / 2, gap, th, size);
        bar(-gap - size, -th / 2, size, th);
        bar(gap, -th / 2, size, th);
    }

    const paint = (stroke) => {
      for (const s of shapes) {
        ctx.beginPath();
        if (s[0] === 'rect') {
          if (stroke) ctx.rect(s[1] - ol, s[2] - ol, s[3] + ol * 2, s[4] + ol * 2); else ctx.rect(s[1], s[2], s[3], s[4]);
          ctx.fill();
        } else if (s[0] === 'ring') {
          ctx.lineWidth = s[2] + (stroke ? ol * 2 : 0); ctx.arc(0, 0, s[1], 0, Math.PI * 2); ctx.stroke();
        } else if (s[0] === 'square') {
          ctx.lineWidth = s[2] + (stroke ? ol * 2 : 0); ctx.strokeRect(-s[1], -s[1], s[1] * 2, s[1] * 2);
        } else if (s[0] === 'diag') {
          ctx.lineWidth = s[2] + (stroke ? ol * 2 : 0); ctx.lineCap = 'butt';
          const g = s[3] * 0.7071; const e = (s[3] + s[1]) * 0.7071;
          for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { ctx.moveTo(sx * g, sy * g); ctx.lineTo(sx * e, sy * e); }
          ctx.stroke();
        } else if (s[0] === 'chevron') {
          ctx.lineWidth = s[2] + (stroke ? ol * 2 : 0); ctx.lineJoin = 'miter';
          ctx.moveTo(-s[1], s[3] + s[1] * 0.8); ctx.lineTo(0, s[3]); ctx.lineTo(s[1], s[3] + s[1] * 0.8); ctx.stroke();
        } else if (s[0] === 'star') {
          // four-point "north star" built from two thin diamonds
          const L = s[1] + s[3]; const W = Math.max(1, s[2]) + (stroke ? ol : 0);
          ctx.moveTo(0, -L); ctx.lineTo(W, 0); ctx.lineTo(0, L); ctx.lineTo(-W, 0); ctx.closePath();
          ctx.moveTo(-L * 0.8, 0); ctx.lineTo(0, W); ctx.lineTo(L * 0.8, 0); ctx.lineTo(0, -W); ctx.closePath();
          ctx.fill('nonzero');
          if (stroke) { ctx.lineWidth = ol; ctx.stroke(); }
        }
      }
      if (cfg.dot || cfg.shape === 'dot') {
        const r = (cfg.shape === 'dot' ? Math.max(cfg.dotSize, cfg.size / 4) : cfg.dotSize) / 2 + (stroke ? ol : 0);
        ctx.beginPath(); ctx.arc(0, 0, Math.max(0.5, r), 0, Math.PI * 2);
        if (!stroke) ctx.fillStyle = cfg.dotColor || cfg.color;
        ctx.fill();
      }
    };
    if (ol > 0) { ctx.fillStyle = cfg.outlineColor; ctx.strokeStyle = cfg.outlineColor; paint(true); }
    ctx.fillStyle = cfg.color; ctx.strokeStyle = cfg.color; paint(false);
    ctx.restore();
  }

  function sizeCanvas(canvas, cssW, cssH) {
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    canvas.__dpr = dpr;
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`; canvas.style.height = `${cssH}px`;
  }
  const isAnimated = (cfg) => !!(cfg && cfg.style === 'animated' && cfg.animation !== 'none');
  const api = { draw, sizeCanvas, isAnimated };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PolarisCrosshair = api;
})(typeof self !== 'undefined' ? self : this);
