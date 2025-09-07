import { W, H, brushSize, brushColor, mirrorMode, tool } from './state.js';
import { rgbaOf, setCellRGBA, getCells } from './grid.js';

function forEachInBrush(cx, cy, r, fn) {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      if (dx * dx + dy * dy <= r * r) fn(x, y);
    }
  }
}

export function getColorAt(x, y) {
  const cells = getCells();
  const idx = y * W + x; const [r, g, b, a] = rgbaOf(cells[idx]); return { r, g, b, a };
}

/** 计算镜像后的坐标集合（包含原点），去重 */
function mirroredPoints(x, y) {
  const pts = [];
  const push = (px, py) => {
    if (px < 0 || px >= W || py < 0 || py >= H) return;
    pts.push([px, py]);
  };

  // 原点
  push(x, y);

  if (mirrorMode === 'x' || mirrorMode === 'xy') {
    const mx = (W - 1) - x; push(mx, y);
  }
  if (mirrorMode === 'y' || mirrorMode === 'xy') {
    const my = (H - 1) - y; push(x, my);
  }
  if (mirrorMode === 'xy') {
    const mx = (W - 1) - x, my = (H - 1) - y; push(mx, my);
  }
  if (mirrorMode === 'central') {
    const cx = (W - 1) - x, cy = (H - 1) - y; push(cx, cy);
  }
  if (mirrorMode === 'diag') {
    // 主对角线 ↘ ：(x, y) -> (y, x)
    const dx = y, dy = x;
    push(dx, dy);
  }
  if (mirrorMode === 'anti') {
    // 副对角线 ↗ ：(x, y) -> (W-1 - y, H-1 - x)
    const ax = (W - 1) - y;
    const ay = (H - 1) - x;
    push(ax, ay);
  }

  // 去重
  const seen = new Set();
  const out = [];
  for (const [px, py] of pts) {
    const k = px + ',' + py;
    if (!seen.has(k)) { seen.add(k); out.push([px, py]); }
  }
  return out;
}

/* ====== 一次笔划内“已处理像素”集合，防止重复变亮/变暗 ====== */
let strokeVisited = new Set();
/** 在 pointerdown 时调用，pointerup/cancel 时也调用一次 */
export function resetStrokeVisit() { strokeVisited.clear(); }

/* ====== 填充保持原逻辑（不镜像） ====== */
export function floodFill(sx, sy) {
  const { r: tr, g: tg, b: tb, a: ta } = getColorAt(sx, sy);
  const isTransparent = (typeof brushColor === 'string' && brushColor.toLowerCase() === 'transparent');
  const R = isTransparent ? 0 : parseInt(brushColor.slice(1, 3), 16);
  const G = isTransparent ? 0 : parseInt(brushColor.slice(3, 5), 16);
  const B = isTransparent ? 0 : parseInt(brushColor.slice(5, 7), 16);
  const A = isTransparent ? 0 : 255;

  if (tr === R && tg === G && tb === B && ta === A) return;

  const cells = getCells();
  const eq = (x, y) => { const [r, g, b, a] = rgbaOf(cells[y * W + x]); return r === tr && g === tg && b === tb && a === ta; };
  const paint = (x, y) => { setCellRGBA(cells[y * W + x], R, G, B, A); };

  const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.pop();
    if (!eq(x, y)) continue;
    let xl = x, xr = x;
    while (xl - 1 >= 0 && eq(xl - 1, y)) xl--;
    while (xr + 1 < W && eq(xr + 1, y)) xr++;
    for (let i = xl; i <= xr; i++) {
      paint(i, y);
      if (y - 1 >= 0 && eq(i, y - 1)) q.push([i, y - 1]);
      if (y + 1 < H && eq(i, y + 1)) q.push([i, y + 1]);
    }
  }
}

/** 返回一个包含镜像/工具逻辑的 painter */
export function currentPainter(erase = false) {
  const cells = getCells();
  const r = brushSize - 1;
  const isTransparent = (typeof brushColor === 'string' && brushColor.toLowerCase() === 'transparent');

  // 橡皮 or 透明画笔
  if (erase || isTransparent) {
    return (x, y) => forEachInBrush(x, y, r, (px, py) => {
      for (const [qx, qy] of mirroredPoints(px, py)) {
        const idx = qy * W + qx; setCellRGBA(cells[idx], 0, 0, 0, 0);
      }
    });
  }

  // 变亮 / 变暗
  if (tool === 'lighten' || tool === 'darken') {
    const delta = (tool === 'lighten') ? +24 : -24;
    return (x, y) => forEachInBrush(x, y, r, (px, py) => {
      for (const [qx, qy] of mirroredPoints(px, py)) {
        const key = qx + ',' + qy;
        if (strokeVisited.has(key)) continue;
        strokeVisited.add(key);

        const idx = qy * W + qx;
        const [R0, G0, B0, A0] = rgbaOf(cells[idx]);
        if (A0 === 0) continue;
        const clamp = v => Math.max(0, Math.min(255, v | 0));
        const R = clamp(R0 + delta);
        const G = clamp(G0 + delta);
        const B = clamp(B0 + delta);
        setCellRGBA(cells[idx], R, G, B, A0);
      }
    });
  }

  // 普通画笔（按当前颜色着色）
  const hex = brushColor; // '#RRGGBB'
  const R = parseInt(hex.slice(1, 3), 16), G = parseInt(hex.slice(3, 5), 16), B = parseInt(hex.slice(5, 7), 16);
  return (x, y) => forEachInBrush(x, y, r, (px, py) => {
    for (const [qx, qy] of mirroredPoints(px, py)) {
      const idx = qy * W + qx; setCellRGBA(cells[idx], R, G, B, 255);
    }
  });
}

/* 直线与矩形仍旧依赖 painter，以获得镜像能力 */
export function drawLine(x0, y0, x1, y1, painter) {
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
  while (true) {
    painter(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

export function paintRect(x0, y0, x1, y1, filled, painter) {
  const minx = Math.max(0, Math.min(x0, x1)), maxx = Math.min(W - 1, Math.max(x0, x1));
  const miny = Math.max(0, Math.min(y0, y1)), maxy = Math.min(H - 1, Math.max(y0, y1));

  if (filled) {
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) painter(x, y);
  } else {
    for (let x = minx; x <= maxx; x++) { painter(x, miny); painter(x, maxy); }
    for (let y = miny + 1; y <= maxy - 1; y++) { painter(minx, y); painter(maxx, y); }
  }
}
