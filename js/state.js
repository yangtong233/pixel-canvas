import { DEFAULT_W, DEFAULT_H } from './constants.js';

export const dom = {
  gridWrap: document.getElementById('gridWrap'),
  grid: document.getElementById('grid'),
  overlay: document.getElementById('overlay'),
  framesEl: document.getElementById('frames'),
  toastWrap: document.getElementById('toastWrap'),
  toolSeg: document.getElementById('toolSeg'),
  brushSizeEl: document.getElementById('brushSize'),
  gridLinesEl: document.getElementById('gridLines'),
  undoBtn: document.getElementById('undoBtn'),
  redoBtn: document.getElementById('redoBtn'),
  copyBtn: document.getElementById('copyFrame'),
  pasteBtn: document.getElementById('pasteFrame'),
  clearFrameBtn: document.getElementById('clearFrame'),
  deleteFrameBtn: document.getElementById('deleteFrame'),
  addFrameBtn: document.getElementById('addFrame'),
  swatchesEl: document.getElementById('swatches'),
  colorPicker: document.getElementById('picker'),
  hexInput: document.getElementById('hexInput'),
  exportJsonBtn: document.getElementById('exportJson'),
  importJsonBtn: document.getElementById('importJsonBtn'),
  importJsonFile: document.getElementById('importJsonFile'),
  exportPngBtn: document.getElementById('exportPng'),
  exportGifBtn: document.getElementById('exportGif'),
  scaleSel: document.getElementById('scaleSel'),
  fpsSel: document.getElementById('fpsSel'),
  wInput: document.getElementById('wInput'),
  hInput: document.getElementById('hInput'),
  applySizeBtn: document.getElementById('applySize'),
  statusText: document.getElementById('statusText'),

  // 镜像模式选择
  mirrorModeSel: document.getElementById('mirrorMode'),
  // 动画播放
  previewCanvas: document.getElementById('previewCanvas'),
  previewPlayBtn: document.getElementById('previewPlay'),
  previewStopBtn: document.getElementById('previewStop'),
  previewFpsSel: document.getElementById('previewFps'),
  previewScaleSel: document.getElementById('previewScale'),
  previewPingpong: document.getElementById('previewPingpong'),
};

export let W = DEFAULT_W;
export let H = DEFAULT_H;

export function setCSSGridSize(w, h) {
  document.documentElement.style.setProperty('--w', String(w));
  document.documentElement.style.setProperty('--h', String(h));
}

export let frames = [];
export let current = 0;
export let history = [];
export function ensureHistory(idx) {
  if (!history[idx]) history[idx] = { undo: [], redo: [] };
  return history[idx];
}

export function resetState(newW, newH) {
  W = newW | 0;
  H = newH | 0;
  setCSSGridSize(W, H);
  frames = [new Uint8ClampedArray(W * H * 4)];
  current = 0;
  history = [{ undo: [], redo: [] }];
  if (dom?.wInput) dom.wInput.value = String(W);
  if (dom?.hInput) dom.hInput.value = String(H);
}

/* ===== 统一的 setter ===== */
export function setCurrent(i) {
  current = Math.max(0, Math.min(i | 0, Math.max(0, frames.length - 1)));
}
export function setSize(newW, newH) {
  W = newW | 0;
  H = newH | 0;
  setCSSGridSize(W, H);
  if (dom?.wInput) dom.wInput.value = String(W);
  if (dom?.hInput) dom.hInput.value = String(H);
}
export function replaceFrames(newFrames) { frames = newFrames; }
export function setHistoryAll(h) { history = h; }

/* ===== 其它 UI/绘制相关状态 ===== */
export let showGridLines = true;
export let isDrawing = false;
export let tool = 'brush';
export let brushColor = '#000000';
export let brushSize = 1;
export let startDraw = null;
export let eraseMode = false;

/**
 * 镜像模式：
 * - 'none'      不镜像
 * - 'x'         左右镜像（水平轴对称）
 * - 'y'         上下镜像（垂直轴对称）
 * - 'xy'        四向镜像（x+y）
 * - 'central'   中心对称（关于画布中心点 180° 对称）
 * - 'diag'      主对角线镜像（↘，左上到右下）
 * - 'anti'      副对角线镜像（↗，左下到右上）
 */
export let mirrorMode = 'none';

export function setTool(t) { tool = t; }
export function setBrushSize(n) {
  const v = Math.max(1, n | 0);
  brushSize = v;
  if (dom?.brushSizeEl && dom.brushSizeEl.value !== String(v)) {
    dom.brushSizeEl.value = String(v);
  }
}
export function setShowGridLines(v) { showGridLines = !!v; }
export function setDrawing(v) { isDrawing = !!v; }
export function setEraseMode(v) { eraseMode = !!v; }
export function setStartDraw(pt) { startDraw = pt; }
export function clearStart() { startDraw = null; }
export function setBrushColor(hex) { brushColor = hex; }
export function setMirrorMode(mode) {
  if (!['none', 'x', 'y', 'xy', 'central', 'diag', 'anti'].includes(mode)) mode = 'none';
  mirrorMode = mode;
}

export const state = () => ({
  W, H, frames, current, history,
  showGridLines, isDrawing, tool, brushColor, brushSize, startDraw, eraseMode,
  mirrorMode
});
