import { dom, W, H, frames, current, setCSSGridSize, showGridLines, mirrorMode } from './state.js';

let cellsCache = [];
export function sizeOverlayToGrid() {
  const rect = dom.gridWrap.getBoundingClientRect();
  dom.overlay.width = rect.width;
  dom.overlay.height = rect.height;
}
export function buildGrid() {
  dom.grid.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (let i = 0; i < W * H; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.style.backgroundColor = 'transparent';
    frag.appendChild(cell);
  }
  dom.grid.appendChild(frag);
  setCSSGridSize(W, H);
  dom.grid.setAttribute('data-gridlines', showGridLines ? 'on' : 'off');
  cellsCache = Array.from(dom.grid.querySelectorAll('.cell'));
  sizeOverlayToGrid();
}
export function getCells() { return cellsCache; }
export function rgbaOf(cell) {
  const cs = getComputedStyle(cell).backgroundColor;
  const m = cs.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([.\d]+))?\)/i);
  if (!m) return [0, 0, 0, 0];
  return [Number(m[1]), Number(m[2]), Number(m[3]), Math.round((m[4] === undefined ? 1 : Number(m[4])) * 255)];
}
export function setCellRGBA(cell, r, g, b, a) {
  if (a === 0) cell.style.backgroundColor = 'transparent';
  else cell.style.backgroundColor = `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
}
export function newEmptyFrameRGBA() { return new Uint8ClampedArray(W * H * 4); }

export function captureCurrentFromDOM() {
  const cells = getCells();
  const buf = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < cells.length; i++) {
    const [r, g, b, a] = rgbaOf(cells[i]);
    const off = i * 4; buf[off] = r; buf[off + 1] = g; buf[off + 2] = b; buf[off + 3] = a;
  }
  frames[current] = buf;
}
export function renderFrameToDOM(idx) {
  const buf = frames[idx] || newEmptyFrameRGBA();
  const cells = getCells();
  for (let i = 0; i < cells.length; i++) {
    const off = i * 4; setCellRGBA(cells[i], buf[off], buf[off + 1], buf[off + 2], buf[off + 3]);
  }
}
export function clearOverlay() {
  const ctx = dom.overlay.getContext('2d');
  ctx.clearRect(0, 0, dom.overlay.width, dom.overlay.height);
}

function overlayMirroredCenters(cx, cy) {
  const rect = dom.gridWrap.getBoundingClientRect();
  const cellW = rect.width / W;
  const cellH = rect.height / H;

  const pts = [];
  // 原点
  pts.push([(cx + 0.5) * cellW, (cy + 0.5) * cellH]);

  if (mirrorMode === 'x' || mirrorMode === 'xy') {
    const mx = (W - 1) - cx; pts.push([(mx + 0.5) * cellW, (cy + 0.5) * cellH]);
  }
  if (mirrorMode === 'y' || mirrorMode === 'xy') {
    const my = (H - 1) - cy; pts.push([(cx + 0.5) * cellW, (my + 0.5) * cellH]);
  }
  if (mirrorMode === 'xy') {
    const mx = (W - 1) - cx, my = (H - 1) - cy;
    pts.push([(mx + 0.5) * cellW, (my + 0.5) * cellH]);
  }
  if (mirrorMode === 'central') {
    const mx = (W - 1) - cx, my = (H - 1) - cy;
    pts.push([(mx + 0.5) * cellW, (my + 0.5) * cellH]);
  }
  if (mirrorMode === 'diag') {
    // ↘：格子中心交换 (cx, cy) -> (cy, cx)
    const mx = cy, my = cx;
    pts.push([(mx + 0.5) * cellW, (my + 0.5) * cellH]);
  }
  if (mirrorMode === 'anti') {
    // ↗：(cx, cy) -> (W-1 - cy, H-1 - cx)
    const mx = (W - 1) - cy, my = (H - 1) - cx;
    pts.push([(mx + 0.5) * cellW, (my + 0.5) * cellH]);
  }

  // 去重
  const seen = new Set();
  const out = [];
  for (const [x, y] of pts) {
    const k = x.toFixed(2) + ',' + y.toFixed(2);
    if (!seen.has(k)) { seen.add(k); out.push([x, y]); }
  }
  return out;
}

export function drawEraseOverlayCell(cx, cy, brushSize) {
  const ctx = dom.overlay.getContext('2d');
  ctx.clearRect(0, 0, dom.overlay.width, dom.overlay.height);

  const rect = dom.gridWrap.getBoundingClientRect();
  const cellW = rect.width / W;
  const cellH = rect.height / H;
  const rCells = (brushSize - 1);
  const rPx = Math.max(cellW, cellH) * rCells + Math.min(cellW, cellH) * 0.5;

  ctx.save();
  const centers = overlayMirroredCenters(cx, cy);
  for (const [centerX, centerY] of centers) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, Math.max(1, rPx), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.stroke();
  }
  ctx.restore();
}

export function xyOfCellEl(el) {
  const cells = getCells();
  const idx = cells.indexOf(el); if (idx < 0) return null;
  const x = idx % W, y = (idx / W) | 0; return { x, y, idx };
}
