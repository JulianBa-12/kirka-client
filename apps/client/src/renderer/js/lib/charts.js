/* Minimal canvas charts. Null values are drawn as gaps — nothing is interpolated or invented. */

function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'; }

function setup(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || canvas.parentElement.clientWidth || 300;
  const hgt = canvas.clientHeight || 140;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hgt * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(hgt * dpr); }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, hgt);
  return { ctx, w, h: hgt };
}

/**
 * lineChart(canvas, { series:[{ values:[n|null], color, label }], min, max, unit, labels? })
 */
export function lineChart(canvas, { series, min = 0, max = null, unit = '', yTicks = 3, xLabels = null }) {
  const { ctx, w, h } = setup(canvas);
  const pad = { l: 38, r: 8, t: 8, b: xLabels ? 18 : 6 };
  const all = series.flatMap((s) => s.values).filter((v) => v != null && Number.isFinite(v));
  let hi = max != null ? max : Math.max(1, ...all) * 1.15;
  let lo = min;
  if (hi <= lo) hi = lo + 1;
  const n = Math.max(2, ...series.map((s) => s.values.length));
  const X = (i) => pad.l + (i / (n - 1)) * (w - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b);
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillStyle = css('--c-text3'); ctx.strokeStyle = css('--c-line'); ctx.lineWidth = 1;
  for (let i = 0; i <= yTicks; i++) {
    const v = lo + ((hi - lo) * i) / yTicks; const y = Math.round(Y(v)) + 0.5;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.globalAlpha = i === 0 ? 1 : 0.45; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(`${v >= 100 ? Math.round(v) : v.toFixed(v < 10 ? 1 : 0)}${unit}`, pad.l - 6, y);
  }
  if (xLabels) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const step = Math.max(1, Math.ceil(xLabels.length / 8));
    xLabels.forEach((l, i) => { if (i % step === 0) ctx.fillText(l, X(i), h - pad.b + 5); });
  }
  for (const s of series) {
    ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 1.5; ctx.beginPath();
    let pen = false;
    s.values.forEach((v, i) => {
      if (v == null || !Number.isFinite(v)) { pen = false; return; }
      const x = X(i); const y = Y(Math.min(hi, Math.max(lo, v)));
      if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
    });
    ctx.stroke();
    if (s.dots) { ctx.fillStyle = s.color; s.values.forEach((v, i) => { if (v != null) { ctx.fillRect(X(i) - 2, Y(v) - 2, 4, 4); } }); }
  }
  if (!all.length) {
    ctx.fillStyle = css('--c-text3'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '12px Satoshi, sans-serif';
    ctx.fillText('No measurements yet', (w + pad.l) / 2, h / 2);
  }
}

/** barChart(canvas, { values:[n|null], labels:[str], color, unit }) */
export function barChart(canvas, { values, labels, color, unit = '' }) {
  const { ctx, w, h } = setup(canvas);
  const pad = { l: 34, r: 6, t: 8, b: 18 };
  const real = values.filter((v) => v != null);
  const hi = Math.max(1, ...real) * 1.1;
  const bw = (w - pad.l - pad.r) / Math.max(1, values.length);
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillStyle = css('--c-text3'); ctx.strokeStyle = css('--c-line');
  ctx.beginPath(); ctx.moveTo(pad.l, h - pad.b + 0.5); ctx.lineTo(w - pad.r, h - pad.b + 0.5); ctx.stroke();
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(`${Math.round(hi)}${unit}`, pad.l - 5, pad.t + 4);
  const step = Math.max(1, Math.ceil(values.length / 10));
  values.forEach((v, i) => {
    const x = pad.l + i * bw;
    if (v != null) { const bh = (v / hi) * (h - pad.t - pad.b); ctx.fillStyle = color; ctx.fillRect(x + bw * 0.18, h - pad.b - bh, Math.max(1, bw * 0.64), bh); }
    if (labels && i % step === 0) { ctx.fillStyle = css('--c-text3'); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(labels[i], x + bw / 2, h - pad.b + 5); }
  });
}

export function sparkline(canvas, values, color) {
  const { ctx, w, h } = setup(canvas);
  const real = values.filter((v) => v != null);
  if (!real.length) return;
  const hi = Math.max(...real) * 1.1 || 1; const lo = 0;
  ctx.strokeStyle = color; ctx.lineWidth = 1.25; ctx.beginPath();
  let pen = false;
  values.forEach((v, i) => { if (v == null) { pen = false; return; } const x = (i / Math.max(1, values.length - 1)) * w; const y = h - 1 - ((v - lo) / (hi - lo)) * (h - 2); if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y); });
  ctx.stroke();
}
