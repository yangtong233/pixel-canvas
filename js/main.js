import { download } from './constants.js';
import {
  dom, setCSSGridSize, resetState, setTool, setBrushSize, setShowGridLines,
  setDrawing, setEraseMode, setStartDraw, clearStart,
  setCurrent, setSize, replaceFrames, setHistoryAll, ensureHistory,
  W, H, frames, current, history,
  tool, brushSize, isDrawing, eraseMode, startDraw,
} from './state.js';
import {
  buildGrid, sizeOverlayToGrid, xyOfCellEl, clearOverlay,
  captureCurrentFromDOM, renderFrameToDOM, newEmptyFrameRGBA, drawEraseOverlayCell
} from './grid.js';
import { initSwatches, setActiveSwatch, msg, setStatus, flashStatus } from './ui.js';
import { pushUndoSnapshot, undo, redo } from './history.js';
import { currentPainter, floodFill, drawLine, paintRect, getColorAt, resetStrokeVisit } from './draw.js';
import {
  renderSidebar, exportFramesJSON, exportPNG, exportGIF,
  buildCurrentFramePayload, isValidPayloadForCurrentCanvas, applyPayloadToCurrent
} from './io.js';

// 镜像模式
import { setMirrorMode, mirrorMode } from './state.js';

let internalClipboardText = '';

/* 记录最近一次指针所在的网格坐标（用于滚轮时更新预览） */
let lastPointerCell = null;

/* ====== 预览区域 DOM（直接在 main.js 获取，不要求 state.js 里有） ====== */
const pv = {
  canvas: document.getElementById('previewCanvas'),
  playBtn: document.getElementById('previewPlay'),
  stopBtn: document.getElementById('previewStop'),
  fpsSel: document.getElementById('previewFps'),
  scaleSel: document.getElementById('previewScale'),
  pingpong: document.getElementById('previewPingpong'),
};

/* ====== 预览状态 ====== */
let previewTimer = null;
let previewPlaying = false;
let previewIndex = 0;
let previewDir = +1;

function drawPreviewFrame() {
  if (!pv.canvas || !frames.length) return;
  const c = pv.canvas;
  const ctx = c.getContext('2d');
  const scale = Math.max(1, parseInt(pv.scaleSel?.value || '4', 10));
  const targetW = W * scale, targetH = H * scale;
  if (c.width !== targetW || c.height !== targetH) {
    c.width = targetW;
    c.height = targetH;
  }
  ctx.imageSmoothingEnabled = false;

  // 离屏 1:1 贴像素，再整体缩放，保持像素风
  const tmp = document.createElement('canvas');
  tmp.width = W; tmp.height = H;
  const tctx = tmp.getContext('2d');
  tctx.putImageData(new ImageData(frames[previewIndex], W, H), 0, 0);

  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(tmp, 0, 0, c.width, c.height);
}

function stepPreview() {
  if (!previewPlaying) return;
  if (frames.length > 0) {
    previewIndex += previewDir;
    const pingpong = !!pv.pingpong?.checked;
    if (pingpong) {
      if (previewIndex >= frames.length - 1) { previewIndex = frames.length - 1; previewDir = -1; }
      else if (previewIndex <= 0) { previewIndex = 0; previewDir = +1; }
    } else {
      if (previewIndex >= frames.length) previewIndex = 0;
    }
  }
  drawPreviewFrame();
}

function startPreview() {
  if (previewPlaying || !pv.fpsSel) return;
  previewPlaying = true;
  const fps = Math.max(1, parseInt(pv.fpsSel.value || '8', 10));
  previewTimer = window.setInterval(stepPreview, 1000 / fps);
  if (pv.playBtn) pv.playBtn.textContent = '⏸ 暂停';
}

function pausePreview() {
  if (!previewPlaying) return;
  previewPlaying = false;
  window.clearInterval(previewTimer);
  if (pv.playBtn) pv.playBtn.textContent = '▶ 播放';
}

function stopPreview() {
  pausePreview();
  previewIndex = current;   // 回到当前帧
  previewDir = +1;
  drawPreviewFrame();
}

function togglePreview() {
  if (previewPlaying) pausePreview(); else startPreview();
}

/* ===== 初始化 ===== */
function init() {
  setCSSGridSize(W, H);
  buildGrid();
  resetState(W, H);
  renderFrameToDOM(0);
  initSwatches();
  setStatus('空闲');

  window.addEventListener('resize', () => requestAnimationFrame(sizeOverlayToGrid));
  bindUI();
  renderFramesList();

  // 初始预览画一遍（如果没放预览 DOM，这里自动跳过）
  previewIndex = current;
  drawPreviewFrame();
}

/* ===== 侧栏帧列表 ===== */
function renderFramesList() {
  const addBtn = renderSidebar((i) => {
    captureCurrentFromDOM();
    setCurrent(i);
    renderFramesList();
    renderFrameToDOM(current);
    setStatus('空闲');

    // 切帧后预览也跳到该帧
    previewIndex = current;
    drawPreviewFrame();
  });
  addBtn.onclick = () => addFrame(true);
}

function addFrame(copyFromCurrent = true) {
  captureCurrentFromDOM();
  const src = copyFromCurrent ? frames[current] : null;
  const f = src ? new Uint8ClampedArray(src) : new Uint8ClampedArray(W * H * 4);
  frames.splice(current + 1, 0, f);
  setCurrent(current + 1);
  renderFramesList();
  renderFrameToDOM(current);
  ensureHistory(current);
  history[current].undo.length = 0;
  history[current].redo.length = 0;
  flashStatus('（已新增帧）');

  previewIndex = current;
  drawPreviewFrame();
}

/* ===== 事件绑定 ===== */
function bindUI() {
  // 工具切换
  dom.toolSeg.addEventListener('click', (e) => {
    const btn = e.target.closest('button'); if (!btn) return;
    document.querySelectorAll('#toolSeg button').forEach(b => b.classList.toggle('active', b === btn));
    setTool(btn.dataset.tool);
    const map = { brush: '画笔', bucket: '填充', line: '直线', rect: '矩形', 'stroke-rect': '描边矩形', picker: '吸管', lighten: '变亮', darken: '变暗' };
    flashStatus(`工具：${map[btn.dataset.tool] || btn.dataset.tool}`);
  });

  dom.brushSizeEl.addEventListener('input', e => setBrushSize(parseInt(e.target.value, 10) || 1));
  dom.gridLinesEl.addEventListener('change', () => {
    setShowGridLines(dom.gridLinesEl.checked);
    dom.grid.setAttribute('data-gridlines', dom.gridLinesEl.checked ? 'on' : 'off');
    flashStatus(`网格线：${dom.gridLinesEl.checked ? '显示' : '隐藏'}`);
  });

  // 镜像模式
  if (dom.mirrorModeSel) {
    dom.mirrorModeSel.addEventListener('change', () => {
      setMirrorMode(dom.mirrorModeSel.value);
      const labelMap = { none: '无', x: '左右镜像', y: '上下镜像', xy: '四向镜像', central: '中心对称' };
      flashStatus(`镜像模式：${labelMap[dom.mirrorModeSel.value] || '无'}`);
    });
  }

  // 撤销/重做
  dom.undoBtn.addEventListener('click', undo);
  dom.redoBtn.addEventListener('click', redo);

  // 帧操作
  dom.addFrameBtn.addEventListener('click', () => addFrame(true));
  dom.copyBtn.addEventListener('click', copyCurrentFrameToClipboard);
  dom.pasteBtn.addEventListener('click', () => pasteFromClipboardOrInternal());
  dom.deleteFrameBtn.addEventListener('click', deleteCurrentFrame);
  dom.clearFrameBtn.addEventListener('click', () => {
    pushUndoSnapshot();
    frames[current] = newEmptyFrameRGBA();
    renderFrameToDOM(current);
    renderFramesList();
    flashStatus('（已清空）');
    drawPreviewFrame();
  });

  // 画布尺寸
  dom.applySizeBtn.addEventListener('click', () => {
    const newW = Math.max(1, Math.min(256, parseInt(dom.wInput.value, 10) || 32));
    const newH = Math.max(1, Math.min(256, parseInt(dom.hInput.value, 10) || 32));
    if (newW === W && newH === H) return;
    resetState(newW, newH);
    buildGrid(); renderFramesList(); renderFrameToDOM(0);
    msg(`尺寸已应用：${newW}×${newH}，所有帧已重置`);
    setStatus('空闲');
    previewIndex = current;
    drawPreviewFrame();
  });

  // 导出
  dom.exportJsonBtn.addEventListener('click', () => {
    captureCurrentFromDOM();
    exportFramesJSON();
  });
  dom.exportPngBtn.addEventListener('click', () => {
    captureCurrentFromDOM();
    const scale = Math.max(1, parseInt(dom.scaleSel.value, 10) || 8);
    exportPNG(scale);
  });
  dom.exportGifBtn.addEventListener('click', () => {
    captureCurrentFromDOM();
    const fps = Math.max(1, parseInt(dom.fpsSel.value, 10) || 8);
    exportGIF(fps);
  });

  // 导入
  dom.importJsonBtn.addEventListener('click', () => dom.importJsonFile.click());
  dom.importJsonFile.addEventListener('change', onImportJson);

  // 绘制事件
  dom.grid.addEventListener('pointerdown', onPointerDown);
  dom.grid.addEventListener('pointermove', onPointerMove);
  dom.grid.addEventListener('pointerup', onPointerUp);
  dom.grid.addEventListener('pointercancel', onPointerCancel);
  dom.grid.addEventListener('lostpointercapture', onPointerCancel);
  window.addEventListener('blur', onPointerCancel);
  dom.grid.addEventListener('contextmenu', e => e.preventDefault());

  // 滚轮调半径（在画布上滚动即可；绘制中也生效）
  dom.grid.addEventListener('wheel', onWheelChangeBrushRadius, { passive: false });

  // 键盘
  window.addEventListener('keydown', onKeyDown);

  // 预览绑定（元素存在才绑定）
  if (pv.playBtn) {
    pv.playBtn.addEventListener('click', togglePreview);
    pv.stopBtn?.addEventListener('click', stopPreview);
    pv.fpsSel?.addEventListener('change', () => { if (previewPlaying) { pausePreview(); startPreview(); } });
    pv.scaleSel?.addEventListener('change', drawPreviewFrame);
    pv.pingpong?.addEventListener('change', () => { previewDir = +1; });

    // 空格/Enter 快捷播放（输入框聚焦时不触发）
    window.addEventListener('keydown', (e) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.key === ' ' || e.key === 'Enter') {
        // 避免和其它快捷键冲突：只有预览面板在页面上时响应
        if (document.getElementById('previewPanel')) {
          togglePreview();
          e.preventDefault();
        }
      }
    });
  }
}

async function onImportJson(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  try {
    const text = await file.text();
    const obj = JSON.parse(text);
    if (!isValidPayloadForCurrentCanvas(obj)) {
      msg('导入失败：文件不匹配当前画布尺寸/帧数');
      return;
    }
    pushUndoSnapshot();
    applyPayloadToCurrent(obj);
    renderFrameToDOM(current);
    renderFramesList();
    flashStatus('已导入 JSON');
    previewIndex = current;
    drawPreviewFrame();
  } catch (err) {
    console.error(err);
    msg('导入失败：不是有效的 JSON 导出文件');
  }
}

/* ===== 指针事件 ===== */
function onPointerDown(e) {
  if (!e.target.classList.contains('cell')) return;

  resetStrokeVisit();

  const rightClick = (e.button === 2);
  setEraseMode(rightClick);
  pushUndoSnapshot();
  setDrawing(true);
  try { dom.grid.setPointerCapture(e.pointerId); } catch { }

  const pos = xyOfCellEl(e.target); if (!pos) return;
  lastPointerCell = { x: pos.x, y: pos.y };

  // 吸管（Alt 或当前工具 = picker）
  if (e.altKey || tool === 'picker') {
    setStatus('取色');
    const { r, g, b, a } = getColorAt(pos.x, pos.y);
    if (a === 0) setActiveSwatch('transparent');
    else setActiveSwatch('#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join(''));
    setDrawing(false); setEraseMode(false); clearOverlay(); flashStatus('取色');
    return;
  }

  // 橡皮（右键）
  if (rightClick) {
    drawEraseOverlayCell(pos.x, pos.y, brushSize);
    currentPainter(true)(pos.x, pos.y);
    setStatus('擦除中');
    return;
  }

  // 形状/填充/画笔（含变亮/变暗）
  if (tool === 'line' || tool === 'rect' || tool === 'stroke-rect') {
    setStartDraw({ x: pos.x, y: pos.y });
    const map = { line: '绘制线段中', rect: '绘制矩形中', 'stroke-rect': '描边矩形中' };
    setStatus(map[tool]);
    return;
  }
  if (tool === 'bucket') {
    floodFill(pos.x, pos.y);
    captureCurrentFromDOM();
    setDrawing(false); setEraseMode(false); clearOverlay(); flashStatus('填充中');

    // 预览刷新
    previewIndex = current;
    drawPreviewFrame();
    return;
  }
  currentPainter(false)(pos.x, pos.y);
  setStatus('绘画中');
}

function onPointerMove(e) {
  if (!isDrawing) return;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  if (!el?.classList?.contains('cell')) return;
  const pos = xyOfCellEl(el); if (!pos) return;

  const prev = lastPointerCell;
  const curr = { x: pos.x, y: pos.y };

  if (eraseMode) {
    drawEraseOverlayCell(curr.x, curr.y, brushSize);
    const painter = currentPainter(true);
    if (prev) drawLine(prev.x, prev.y, curr.x, curr.y, painter);
    else painter(curr.x, curr.y);
    lastPointerCell = curr;
    return;
  }

  clearOverlay();
  const painter = currentPainter(false);

  if (tool === 'line' || tool === 'rect' || tool === 'stroke-rect') {
    renderFrameToDOM(current);
    if (startDraw) {
      if (tool === 'line') drawLine(startDraw.x, startDraw.y, curr.x, curr.y, painter);
      else paintRect(startDraw.x, startDraw.y, curr.x, curr.y, tool === 'rect', painter);
    }
  } else if (tool !== 'bucket') {
    if (prev) drawLine(prev.x, prev.y, curr.x, curr.y, painter);
    else painter(curr.x, curr.y);
  }

  lastPointerCell = curr;
}

function onPointerUp(e) {
  if (!isDrawing) return;
  setDrawing(false);
  try { dom.grid.releasePointerCapture(e.pointerId); } catch { }
  if (startDraw && !eraseMode) {
    captureCurrentFromDOM();
  } else if (!startDraw) {
    captureCurrentFromDOM();
  }
  setEraseMode(false); clearOverlay(); setStatus('空闲'); setStartDraw(null);
  lastPointerCell = null;

  resetStrokeVisit();

  // 结束笔划后，同步预览
  previewIndex = current;
  drawPreviewFrame();
}
function onPointerCancel() {
  setDrawing(false); setStartDraw(null); setEraseMode(false);
  clearOverlay(); setStatus('空闲');
  lastPointerCell = null;

  resetStrokeVisit();
}

/* ===== 滚轮调半径 ===== */
function onWheelChangeBrushRadius(e) {
  const overGrid = e.currentTarget === dom.grid;
  if (!overGrid) return;

  const tag = (document.activeElement?.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;

  if (e.ctrlKey || e.metaKey) return;
  e.preventDefault();

  const delta = Math.sign(e.deltaY);
  const next = Math.max(1, Math.min(16, brushSize - delta));
  if (next !== brushSize) {
    setBrushSize(next);
    flashStatus(`画笔半径：${next}`);
    if (lastPointerCell) {
      if (eraseMode) drawEraseOverlayCell(lastPointerCell.x, lastPointerCell.y, next);
    }
  }
}

/* ===== 复制/粘贴/删除/键盘等 ===== */
async function copyCurrentFrameToClipboard() {
  captureCurrentFromDOM();
  const payload = buildCurrentFramePayload();
  const text = JSON.stringify(payload);
  internalClipboardText = text;

  try {
    await navigator.clipboard.writeText(text);
    flashStatus('已复制帧到系统剪贴板');
  } catch {
    flashStatus('已复制帧到内部剪贴板（系统剪贴板不可用）');
  }
}
async function pasteFromClipboardOrInternal() {
  let text = null;

  try {
    text = await navigator.clipboard.readText();
  } catch {
    // 系统剪贴板不可用时，退回内部存储
  }
  if (!text) text = internalClipboardText;

  if (!text) {
    msg('没有可粘贴的内容');
    return;
  }

  try {
    const obj = JSON.parse(text);
    if (!isValidPayloadForCurrentCanvas(obj)) {
      msg('粘贴失败：内容不匹配当前画布');
      return;
    }
    pushUndoSnapshot();
    applyPayloadToCurrent(obj);
    renderFrameToDOM(current);
    renderFramesList();
    flashStatus('已粘贴帧');
    drawPreviewFrame();
  } catch (err) {
    console.error(err);
    msg('粘贴失败：剪贴板不是有效的导出内容');
  }
}
function deleteCurrentFrame() {
  if (frames.length <= 1) { msg('至少需要保留一帧'); return; }
  pushUndoSnapshot();
  frames.splice(current, 1);
  setCurrent(Math.max(0, current - 1));
  renderFrameToDOM(current);
  renderFramesList();
  flashStatus('已删除当前帧');
  previewIndex = current;
  drawPreviewFrame();
}

/* ===== 键盘 ===== */
async function onKeyDown(e) {
  const k = e.key.toLowerCase();

  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && k === 'z') { e.preventDefault(); undo(); return; }
  if ((e.ctrlKey || e.metaKey) && (k === 'y' || (e.shiftKey && k === 'z'))) { e.preventDefault(); redo(); return; }

  if (k === 'b') selectTool('brush');
  if (k === 'f') selectTool('bucket');
  if (k === 'l') selectTool('line');
  if (k === 'r') selectTool('rect');

  // 镜像模式：M 键循环
  if (k === 'm') {
    const order = ['none', 'x', 'y', 'xy', 'central'];
    const idx = order.indexOf(mirrorMode);
    const next = order[(idx + 1) % order.length];
    setMirrorMode(next);
    if (dom.mirrorModeSel) dom.mirrorModeSel.value = next;
    const labelMap = { none: '无', x: '左右镜像', y: '上下镜像', xy: '四向镜像', central: '中心对称' };
    flashStatus(`镜像模式：${labelMap[next] || '无'}`);
    return;
  }

  // 画笔半径快捷键： [ / ]
  if (k === '[' || k === ']') {
    const delta = (k === '[' ? -1 : 1);
    const next = Math.max(1, Math.min(16, brushSize + delta));
    if (next !== brushSize) {
      setBrushSize(next);
      flashStatus(`画笔半径：${next}`);
    }
    return;
  }

  // 删除帧（Delete/Backspace）
  if (k === 'delete' || k === 'backspace') {
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    e.preventDefault();
    deleteCurrentFrame();
    return;
  }

  // 复制（Ctrl/Cmd + C）
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && k === 'c') {
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    e.preventDefault();
    await copyCurrentFrameToClipboard();
    return;
  }

  // 粘贴（Ctrl/Cmd + V）
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && k === 'v') {
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    const text = await capturePasteViaHiddenTextarea();
    if (text) {
      try {
        const obj = JSON.parse(text);
        if (isValidPayloadForCurrentCanvas(obj)) {
          pushUndoSnapshot();
          applyPayloadToCurrent(obj);
          renderFrameToDOM(current);
          renderFramesList();
          flashStatus('已粘贴帧');
          drawPreviewFrame();
          return;
        }
      } catch { /* ignore */ }
    }
    await pasteFromClipboardOrInternal();
  }
}
function selectTool(t) {
  setTool(t);
  document.querySelectorAll('#toolSeg button')
    .forEach(b => b.classList.toggle('active', b.dataset.tool === t));
}

/* ===== 辅助：用隐藏 textarea 捕获系统粘贴 ===== */
async function capturePasteViaHiddenTextarea() {
  // 若有剪贴板权限则直接读
  try {
    const txt = await navigator.clipboard.readText();
    if (txt) return txt;
  } catch { /* ignore */ }

  return new Promise((resolve) => {
    const ta = document.createElement('textarea');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();

    function cleanup() {
      ta.removeEventListener('paste', onPaste);
      document.body.removeChild(ta);
    }
    function onPaste(ev) {
      ev.preventDefault();
      const data = (ev.clipboardData || window.clipboardData);
      const text = data?.getData('text') || '';
      cleanup();
      resolve(text);
    }

    ta.addEventListener('paste', onPaste, { once: true });
    document.execCommand('paste');
    setTimeout(() => { cleanup(); resolve(''); }, 50);
  });
}

/* 启动 */
init();
