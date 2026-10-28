import {compileExpression} from './expression.js';
export {compileExpression} from './expression.js';
const CACHE = new Map();

export function validateExpression(input) {
  try { compileExpression(input); return null; } catch (error) { return error.message; }
}

export function getMathDefaults(type) {
  const sizes = {
    cube: [220, 190], pyramid: [220, 210], cylinder: [150, 220], cone: [170, 220],
    axes: [330, 300], numberline: [380, 70], graph: [380, 330],
  };
  const [w, h] = sizes[type] || [220, 180];
  return { w, h, ...(type === 'graph' ? { expr: 'x^2', graphView: normalizeGraphView() } : {}) };
}

const clamp = (n, low, high) => Math.max(low, Math.min(high, n));

/** Mathematical viewport stored on the graph, independent from the board zoom. */
export function normalizeGraphView(view) {
  return {
    centerX: Number.isFinite(view?.centerX) ? clamp(view.centerX, -1e6, 1e6) : 0,
    centerY: Number.isFinite(view?.centerY) ? clamp(view.centerY, -1e6, 1e6) : 0,
    spanX: Number.isFinite(view?.spanX) ? clamp(view.spanX, .02, 20000) : 10,
  };
}

function viewport(o, graph = true) {
  const x = Number.isFinite(o.x) ? o.x : 0, y = Number.isFinite(o.y) ? o.y : 0;
  const w = Number.isFinite(o.w) ? clamp(o.w, 2, 1e7) : 380;
  const h = Number.isFinite(o.h) ? clamp(o.h, 2, 1e7) : 330;
  const pad = Math.min(28, w * .09, h * .09), topPad = graph ? Math.min(34, h * .16) : pad;
  const left = x + pad, right = x + w - pad, top = y + topPad, bottom = y + h - pad;
  const { centerX, centerY, spanX } = normalizeGraphView(graph ? o.graphView : undefined);
  const scale = (right - left) / spanX;
  // cx/cy are the board coordinates of the mathematical origin (0,0).
  const cx = (left + right) / 2 - centerX * scale;
  const cy = (top + bottom) / 2 + centerY * scale;
  const spanY = (bottom - top) / scale;
  return { left, right, top, bottom, cx, cy, scale, centerX, centerY, spanX,
    xMin: centerX - spanX / 2, xMax: centerX + spanX / 2,
    yMin: centerY - spanY / 2, yMax: centerY + spanY / 2 };
}

export function getGraphViewport(o) { return viewport(o); }

/** factor > 1 zooms in, preserving the mathematical point under p (board coordinates). */
export function zoomGraphAt(o, p, factor) {
  const v = getGraphViewport(o);
  if (!Number.isFinite(factor) || factor <= 0) return o.graphView = normalizeGraphView(o.graphView);
  const px = Number.isFinite(p?.x) ? p.x : (v.left + v.right) / 2;
  const py = Number.isFinite(p?.y) ? p.y : (v.top + v.bottom) / 2;
  const mathematicalX = v.centerX + (px - (v.left + v.right) / 2) / v.scale;
  const mathematicalY = v.centerY - (py - (v.top + v.bottom) / 2) / v.scale;
  const spanX = clamp(v.spanX / factor, .02, 20000);
  const scale = (v.right - v.left) / spanX;
  o.graphView = normalizeGraphView({
    centerX: mathematicalX - (px - (v.left + v.right) / 2) / scale,
    centerY: mathematicalY + (py - (v.top + v.bottom) / 2) / scale,
    spanX,
  });
  return o.graphView;
}

export function resetGraphView(o) { return o.graphView = normalizeGraphView(); }

function poly(ctx, points, close = false) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  if (close) ctx.closePath();
  ctx.stroke();
}

function face(ctx, points, color, opacity = 0.055) {
  ctx.save(); ctx.fillStyle = color; ctx.globalAlpha *= opacity;
  ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath(); ctx.fill(); ctx.restore();
}

function hidden(ctx, points) {
  ctx.save(); ctx.globalAlpha *= 0.55; ctx.setLineDash([6, 5]); poly(ctx, points); ctx.restore();
}

function arrow(ctx, x1, y1, x2, y2, size = 7) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  poly(ctx, [[x1, y1], [x2, y2]]);
  poly(ctx, [[x2 - size * Math.cos(angle - 0.45), y2 - size * Math.sin(angle - 0.45)],
    [x2, y2], [x2 - size * Math.cos(angle + 0.45), y2 - size * Math.sin(angle + 0.45)]]);
}

function cube(ctx, o) {
  const { x, y, w, h } = o, dx = w * .27, dy = h * .24;
  const A = [x, y + h], B = [x + w - dx, y + h], C = [x + w - dx, y + dy], D = [x, y + dy];
  const E = [x + dx, y + h - dy], F = [x + w, y + h - dy], G = [x + w, y], H = [x + dx, y];
  if (o.fill) {
    face(ctx, [A, B, C, D], o.color, .055);
    face(ctx, [D, C, G, H], o.color, .1);
    face(ctx, [B, F, G, C], o.color, .15);
  }
  hidden(ctx, [A, E, F]); hidden(ctx, [E, H]);
  poly(ctx, [A, B, C, D], true); poly(ctx, [D, H, G, C]); poly(ctx, [G, F, B]);
}

function pyramid(ctx, o) {
  const { x, y, w, h } = o;
  const T = [x + w * .49, y], A = [x, y + h * .74], B = [x + w * .62, y + h];
  const C = [x + w, y + h * .72], D = [x + w * .38, y + h * .46];
  if (o.fill) { face(ctx, [T, A, B], o.color, .055); face(ctx, [T, B, C], o.color, .12); }
  hidden(ctx, [A, D, C]); hidden(ctx, [D, T]);
  poly(ctx, [T, A, B, C, T]); poly(ctx, [T, B]);
}

function cylinder(ctx, o) {
  const { x, y, w, h } = o, rx = w / 2, ry = Math.min(h * .12, w * .18), cx = x + rx;
  if (o.fill) {
    ctx.save(); ctx.globalAlpha *= .06; ctx.fillStyle = o.color;
    ctx.beginPath(); ctx.ellipse(cx, y + ry, rx, ry, 0, Math.PI, 0);
    ctx.lineTo(x + w, y + h - ry); ctx.ellipse(cx, y + h - ry, rx, ry, 0, 0, Math.PI);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  poly(ctx, [[x, y + ry], [x, y + h - ry]]);
  poly(ctx, [[x + w, y + ry], [x + w, y + h - ry]]);
  ctx.beginPath(); ctx.ellipse(cx, y + ry, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.save(); ctx.globalAlpha *= .55; ctx.setLineDash([6, 5]);
  ctx.beginPath(); ctx.ellipse(cx, y + h - ry, rx, ry, 0, Math.PI, Math.PI * 2); ctx.stroke(); ctx.restore();
  ctx.beginPath(); ctx.ellipse(cx, y + h - ry, rx, ry, 0, 0, Math.PI); ctx.stroke();
}

function cone(ctx, o) {
  const { x, y, w, h } = o, rx = w / 2, ry = Math.min(h * .1, w * .16), cx = x + rx, cy = y + h - ry;
  // Tangency points of a line from the apex to the projected base ellipse.
  const sinTheta = -ry / (cy - y), cosTheta = Math.sqrt(1 - sinTheta * sinTheta);
  const theta = Math.asin(sinTheta), left = [cx - rx * cosTheta, cy + ry * sinTheta], right = [cx + rx * cosTheta, cy + ry * sinTheta];
  if (o.fill) {
    ctx.save(); ctx.globalAlpha *= .07; ctx.fillStyle = o.color;
    ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(...right);
    ctx.ellipse(cx, cy, rx, ry, 0, theta, Math.PI - theta); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  ctx.save(); ctx.globalAlpha *= .55; ctx.setLineDash([6, 5]);
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, Math.PI - theta, Math.PI * 2 + theta); ctx.stroke(); ctx.restore();
  poly(ctx, [left, [cx, y], right]);
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, theta, Math.PI - theta); ctx.stroke();
}

function niceStep(minimum) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1e-15, minimum)));
  const normalized = minimum / magnitude;
  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
}

function tickLabel(value, step = 1) {
  if (Math.abs(value) < step * 1e-7) return '0';
  const digits = clamp(Math.ceil(-Math.log10(step)), 0, 12);
  if (Math.abs(value) >= 1e7 || Math.abs(value) < 1e-5) {
    return value.toExponential(clamp(Math.ceil(Math.log10(Math.abs(value) / step)), 0, 10)).replace(/\.0+(?=e)/, '');
  }
  return value.toFixed(digits).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
}

function tickValues(min, max, step) {
  const first = Math.ceil(min / step - 1e-9) * step;
  const count = clamp(Math.floor((max - first) / step + 1e-7) + 1, 0, 40);
  return Array.from({ length: count }, (_, i) => first + i * step);
}

function coordinateSystem(ctx, o, withGraph = false) {
  const v = viewport(o, withGraph);
  const { left, right, top, bottom, cx, cy, scale, xMin, xMax, yMin, yMax } = v;
  const plotWidth = right - left, plotHeight = bottom - top;
  const xStep = withGraph ? niceStep((xMax - xMin) / clamp(Math.floor(plotWidth / 42), 2, 30)) : 1;
  const yStep = niceStep((yMax - yMin) / clamp(Math.floor(plotHeight / 34), 2, 30));
  const xs = tickValues(xMin, xMax, xStep), ys = tickValues(yMin, yMax, yStep);
  const pixelX = value => left + (value - xMin) * scale;
  const pixelY = value => bottom - (value - yMin) * scale;
  const xAxisVisible = yMin <= 0 && yMax >= 0, yAxisVisible = xMin <= 0 && xMax >= 0;
  const horizontal = xAxisVisible ? cy : bottom;
  const vertical = yAxisVisible ? cx : left;
  ctx.save();
  ctx.setLineDash([]); ctx.lineWidth = .7;
  ctx.strokeStyle = '#dfe8e8';
  for (const value of xs) poly(ctx, [[pixelX(value), top], [pixelX(value), bottom]]);
  for (const value of ys) poly(ctx, [[left, pixelY(value)], [right, pixelY(value)]]);
  if (withGraph) { ctx.beginPath(); ctx.rect(left, top, plotWidth, plotHeight); ctx.stroke(); }
  ctx.strokeStyle = o.color || '#243b43'; ctx.fillStyle = o.color || '#243b43'; ctx.lineWidth = 1.2;
  if (xAxisVisible) arrow(ctx, left, cy, right, cy, 6);
  if (yAxisVisible) arrow(ctx, cx, bottom, cx, top, 6);
  ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const value of xs) {
    if (Math.abs(value) < xStep * 1e-7 && yAxisVisible) continue;
    const px = pixelX(value);
    if (px < left + 8 || px > right - 8) continue;
    poly(ctx, [[px, horizontal - 3], [px, horizontal + 3]]);
    ctx.fillText(tickLabel(value, xStep), px, horizontal + 6);
  }
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const value of ys) {
    if (Math.abs(value) < yStep * 1e-7 && xAxisVisible) continue;
    const py = pixelY(value);
    if (py < top + 12 || py > bottom - 8) continue;
    poly(ctx, [[vertical - 3, py], [vertical + 3, py]]);
    ctx.fillText(tickLabel(value, yStep), vertical - 7, py);
  }
  if (xAxisVisible && yAxisVisible) ctx.fillText('0', cx - 7, cy + 11);
  ctx.font = 'italic 14px Georgia, serif'; ctx.textAlign = 'center';
  ctx.fillText('x', right + 10, clamp(horizontal - 10, top + 8, bottom - 6));
  ctx.fillText('y', clamp(vertical + 12, left + 8, right - 8), top - 5);
  ctx.restore();
  return v;
}

function numberline(ctx, o) {
  const pad = Math.min(15, o.w * .1), start = o.x + pad, end = o.x + o.w - pad, cy = o.y + o.h * .42, scale = (end - start) / 10;
  ctx.save(); ctx.setLineDash([]); ctx.lineWidth = Math.min(o.width || 2, 3);
  arrow(ctx, start - 4, cy, end + 5, cy);
  ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let n = -4; n <= 4; n++) {
    const px = (start + end) / 2 + n * scale;
    poly(ctx, [[px, cy - 5], [px, cy + 5]]); ctx.fillText(String(n), px, cy + 10);
  }
  ctx.font = 'italic 14px Georgia, serif'; ctx.fillText('x', end, cy - 20); ctx.restore();
}

function graph(ctx, o) {
  const grid = coordinateSystem(ctx, o, true), expr = o.expr || 'x^2';
  ctx.save(); ctx.setLineDash([]); ctx.fillStyle = o.color || '#167d8d';
  ctx.font = '500 15px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const title = /^\s*y\s*=/i.test(expr) ? expr : 'y = ' + expr;
  ctx.fillText(title, o.x + 14, o.y + 5, Math.max(30, o.w - 28));
  let fn;
  try {
    if (!CACHE.has(expr)) {
      if (CACHE.size >= 60) CACHE.delete(CACHE.keys().next().value);
      CACHE.set(expr, compileExpression(expr));
    }
    fn = CACHE.get(expr);
  } catch {
    ctx.fillStyle = '#b75d49'; ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('Проверьте формулу', o.x + 14, o.y + o.h - 16); ctx.restore(); return;
  }
  ctx.beginPath(); ctx.rect(grid.left, grid.top, grid.right - grid.left, grid.bottom - grid.top); ctx.clip();
  ctx.strokeStyle = o.color || '#167d8d'; ctx.lineWidth = Math.max(1.6, o.width || 2.4);
  ctx.setLineDash(o.dashed ? [7, 5] : []); ctx.beginPath();
  const count = Math.max(350, Math.min(1400, Math.ceil(o.w * 2)));
  const verticalRange = grid.bottom - grid.top;
  let refinements = 0;
  function sample(valueX) {
    const valueY = fn(valueX);
    const px = grid.left + (valueX - grid.xMin) * grid.scale;
    const py = grid.bottom - (valueY - grid.yMin) * grid.scale;
    return { valueX, px, py, finite: Number.isFinite(valueY) && Number.isFinite(px) && Number.isFinite(py) };
  }
  function segment(a, b, depth = 0) {
    const mid = sample(a.valueX + (b.valueX - a.valueX) / 2);
    if (!a.finite && !b.finite && !mid.finite) return;
    if (a.finite && b.finite && mid.finite) {
      const error = Math.abs(mid.py - (a.py / 2 + b.py / 2));
      // A steep but continuous line still crosses the viewport and must be visible.
      // A pole fails this midpoint-linearity test and is split instead of joined.
      const sufficientlyLinear = error <= 1.1;
      const lastLevelAcceptable = depth >= 7 && error <= Math.max(1.1, verticalRange * .01)
        && Math.abs(a.py - b.py) < verticalRange * .5;
      if (sufficientlyLinear || lastLevelAcceptable) {
        if ((a.py < grid.top && b.py < grid.top && mid.py < grid.top)
          || (a.py > grid.bottom && b.py > grid.bottom && mid.py > grid.bottom)) return;
        ctx.moveTo(a.px, a.py); ctx.lineTo(b.px, b.py); return;
      }
    }
    if (depth < 7 && refinements < 6000) {
      refinements++;
      segment(a, mid, depth + 1); segment(mid, b, depth + 1);
    }
  }
  let previous = sample(grid.xMin);
  for (let i = 1; i <= count; i++) {
    const next = sample(grid.xMin + (grid.xMax - grid.xMin) * i / count);
    segment(previous, next); previous = next;
  }
  ctx.stroke(); ctx.restore();
}

/** Draws mathematical objects in the caller's world-coordinate transform. */
export function drawMathObject(ctx, object) {
  const draw = { cube, pyramid, cylinder, cone, axes: coordinateSystem, numberline, graph }[object.type];
  if (!draw) return false;
  const defaults = getMathDefaults(object.type);
  const o = { color: '#243b43', width: 2, fill: false, dashed: false, x: 0, y: 0, ...defaults, ...object };
  if (![o.x, o.y, o.w, o.h, o.x + o.w, o.y + o.h].every(Number.isFinite) || o.w <= 1 || o.h <= 1) return true;
  ctx.save(); ctx.strokeStyle = o.color; ctx.fillStyle = o.color;
  ctx.lineWidth = Math.max(.5, Math.min(20, o.width || 2)); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.setLineDash(o.dashed ? [7, 5] : []);
  try { draw(ctx, o); } finally { ctx.restore(); }
  return true;
}
