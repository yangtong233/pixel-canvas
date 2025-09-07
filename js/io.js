import { download, toHex8FromRGBA } from './constants.js';
import { dom } from './state.js';
import { W, H, frames, current } from './state.js';
import { renderFrameToDOM } from './grid.js';
import { msg } from './ui.js';

/* ========= Sidebar thumbnails ========= */
export function renderSidebar(onSelect) {
  dom.framesEl.innerHTML = '';
  frames.forEach((buf, i) => {
    const item = document.createElement('div');
    item.className = 'frame-item' + (i === current ? ' active' : '');
    const thumb = document.createElement('div'); thumb.className = 'thumb';
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(W, H); img.data.set(buf); ctx.putImageData(img, 0, 0);
    thumb.appendChild(c);

    const meta = document.createElement('div'); meta.className = 'frame-meta';
    const title = document.createElement('div'); title.className = 'frame-title'; title.textContent = `Frame ${i + 1}`;
    meta.appendChild(title);

    item.appendChild(thumb); item.appendChild(meta);
    item.onclick = () => onSelect(i);
    dom.framesEl.appendChild(item);
  });
  const addBtn = document.createElement('button');
  addBtn.type = 'button'; addBtn.className = 'add-frame'; addBtn.innerHTML = '<strong>＋</strong> 新增帧';
  dom.framesEl.appendChild(addBtn);
  return addBtn;
}

/* ========= JSON import/export helpers for the current canvas ========= */
export function buildCurrentFramePayload() {
  const arr = [];
  const buf = frames[current];
  for (let i = 0; i < W * H; i++) {
    const off = i * 4;
    arr[i] = toHex8FromRGBA(buf[off], buf[off + 1], buf[off + 2], buf[off + 3]);
  }
  return { w: W, h: H, frames: [arr] };
}

export function isValidPayloadForCurrentCanvas(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const w = obj?.w ?? obj?.width ?? obj?.n;
  const h = obj?.h ?? obj?.height ?? obj?.n;
  if (w !== W || h !== H) return false;
  let fa = Array.isArray(obj.frames) ? obj.frames : (Array.isArray(obj.pixels) ? [obj.pixels] : null);
  if (!fa || !Array.isArray(fa[0])) return false;
  if (fa[0].length !== W * H) return false;
  return fa[0].every(v => typeof v === 'string' && /^#[0-9a-fA-F]{8}$/.test(v));
}

export function applyPayloadToCurrent(obj) {
  const arr = (Array.isArray(obj.frames) ? obj.frames[0] : obj.pixels);
  const buf = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const hex = (arr[i] || '#00000000').toLowerCase();
    const r = parseInt(hex.slice(1, 3) || '00', 16);
    const g = parseInt(hex.slice(3, 5) || '00', 16);
    const b = parseInt(hex.slice(5, 7) || '00', 16);
    const a = parseInt(hex.slice(7, 9) || '00', 16);
    const off = i * 4; buf[off] = r; buf[off + 1] = g; buf[off + 2] = b; buf[off + 3] = a;
  }
  frames[current] = buf; renderFrameToDOM(current);
}

/* ========= PNG 导出 ========= */
export function exportPNG(scale = 8) {
  const n = frames.length;
  if (n <= 1) {
    // 单帧：原样导出
    const c = document.createElement('canvas'); c.width = W * scale; c.height = H * scale;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
    const base = document.createElement('canvas'); base.width = W; base.height = H;
    base.getContext('2d').putImageData(new ImageData(frames[current], W, H), 0, 0);
    ctx.drawImage(base, 0, 0, c.width, c.height);
    c.toBlob(b => {
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      download(`pixel-${W}x${H}-x${scale}-${ts}.png`, b || new Blob(), 'image/png');
      msg('PNG 已导出');
    }, 'image/png');
    return;
  }

  // 多帧：导出雪碧图（固定 1 行 n 列）
  const cols = n;
  const rows = 1;

  const sheetW = W * cols;
  const sheetH = H * rows;

  const c = document.createElement('canvas'); c.width = sheetW * scale; c.height = sheetH * scale;
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;

  // 用一个 1:1 的离屏画布贴像素，再按 scale 绘制到大画布
  const tile = document.createElement('canvas'); tile.width = W; tile.height = H;
  const tctx = tile.getContext('2d');

  for (let f = 0; f < n; f++) {
    const col = f;          // 直接按列平铺
    const row = 0;          // 始终第 0 行
    tctx.clearRect(0, 0, W, H);
    tctx.putImageData(new ImageData(frames[f], W, H), 0, 0);
    ctx.drawImage(
      tile,
      col * W * scale,
      row * H * scale,
      W * scale,
      H * scale
    );
  }

  c.toBlob(b => {
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    download(`spritesheet-${n}f-${W}x${H}-row1x${cols}-x${scale}-${ts}.png`, b || new Blob(), 'image/png');
    msg(`雪碧图已导出（1 行 × ${cols} 列，共 ${n} 帧）`);
  }, 'image/png');
}

// === 新增：仅构造全部帧像素的十六进制数组，不做下载 ===
export function framesToHexArrays() {
  const all = frames.map(buf => {
    const arr = [];
    for (let i = 0; i < W * H; i++) {
      const off = i * 4;
      arr.push(toHex8FromRGBA(buf[off], buf[off + 1], buf[off + 2], buf[off + 3]));
    }
    return arr;
  });
  return all;
}

export function exportFramesHex() {
  const all = framesToHexArrays();
  const payload = { w: W, h: H, frames: all };
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  download(`frames-${frames.length}f-${W}x${H}-${ts}.json`, blob, 'application/json');
  msg('帧数据已导出为 JSON');
}

export function exportFramesJSON() {
  const payload = { w: W, h: H, frames: framesToHexArrays() };
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json;charset=utf-8' });
  download(`pixels-${W}x${H}-${frames.length}f-${ts}.json`, blob, 'application/json;charset=utf-8');
  msg('JSON 已导出');
}

function writeU16LE(out, n) { out.push(n & 0xFF, (n >> 8) & 0xFF); }

function buildGlobalPalette() {
  const pal = [];
  pal.push([0, 0, 0]);
  const steps = [0, 51, 102, 153, 204, 255];
  for (let r of steps) for (let g of steps) for (let b of steps) pal.push([r, g, b]);
  for (let i = 0; i < 24; i++) { const v = Math.round(i * 255 / 23); pal.push([v, v, v]); }
  while (pal.length < 256) pal.push([0, 0, 0]);
  return pal;
}
const GLOBAL_PALETTE = buildGlobalPalette();

function dist2(r1, g1, b1, r2, g2, b2) { const dr = r1 - r2, dg = g1 - g2, db = b1 - b2; return dr * dr + dg * dg + db * db; }

function mapRGBAtoIndex(r, g, b, a) {
  if (a < 128) return 0;
  const q = v => Math.round(v / 51) * 51;
  const rq = q(r), gq = q(g), bq = q(b);
  const ri = Math.round(r / 51), gi = Math.round(g / 51), bi = Math.round(b / 51);
  const fastIdx = 1 + (ri * 6 + gi) * 6 + bi;
  if (GLOBAL_PALETTE[fastIdx][0] === rq && GLOBAL_PALETTE[fastIdx][1] === gq && GLOBAL_PALETTE[fastIdx][2] === bq) return fastIdx;

  let bestI = 1, bestD = 1e9;
  for (let i = 1; i < 256; i++) {
    const [pr, pg, pb] = GLOBAL_PALETTE[i];
    const d = dist2(r, g, b, pr, pg, pb);
    if (d < bestD) { bestD = d; bestI = i; if (d === 0) break; }
  }
  return bestI;
}

function lzwEncode(indices) {
  const minCodeSize = 8;                 // 256色 -> 8
  const clearCode = 1 << minCodeSize;  // 256
  const endCode = clearCode + 1;     // 257

  // 输出缓冲（LSB-first 比特流）
  const bytes = [];
  let cur = 0, bits = 0;
  const pushBits = (code, size) => {
    cur |= (code << bits);
    bits += size;
    while (bits >= 8) {
      bytes.push(cur & 0xFF);
      cur >>= 8;
      bits -= 8;
    }
  };

  // 初始化字典：0..255
  let dict = new Map();
  const resetDict = () => {
    dict = new Map();
    for (let i = 0; i < clearCode; i++) dict.set(i.toString(), i);
  };
  resetDict();

  // 码长 / 下一个可分配码
  let codeSize = minCodeSize + 1;   // 9
  let nextCode = endCode + 1;       // 258

  // 先发 CLEAR
  pushBits(clearCode, codeSize);

  // 主循环：流式编码 + 同步输出
  let prefix = indices[0].toString();

  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const pk = prefix + ',' + k;
    if (dict.has(pk)) {
      prefix = pk;
    } else {
      // 输出已有串的码
      pushBits(dict.get(prefix), codeSize);

      // 加入新串
      dict.set(pk, nextCode++);
      // 码表满 2^codeSize 时，码长+1（最多12）
      if (nextCode === (1 << codeSize) && codeSize < 12) codeSize++;

      prefix = k.toString();

      // 字典满4096，必须发 CLEAR 并复位
      if (nextCode === 4096) {
        pushBits(clearCode, codeSize);
        resetDict();
        codeSize = minCodeSize + 1;
        nextCode = endCode + 1;
      }
    }
  }

  if (prefix) pushBits(dict.get(prefix), codeSize);
  pushBits(endCode, codeSize);

  // 把剩余比特刷出去
  if (bits > 0) bytes.push(cur & 0xFF);

  // 切分成 <=255 的子块
  const blocks = [];
  for (let i = 0; i < bytes.length; i += 255) {
    blocks.push(bytes.slice(i, i + 255));
  }
  return { minCodeSize, blocks };
}


function encodeGIF(framesRGBA, delayCS) {
  const out = [];

  out.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);
  writeU16LE(out, W); writeU16LE(out, H);
  out.push(0b10000111);
  out.push(0x00);
  out.push(0x00);

  for (let i = 0; i < 256; i++) {
    const [r, g, b] = GLOBAL_PALETTE[i];
    out.push(r, g, b);
  }

  out.push(0x21, 0xFF, 0x0B,
    0x4E, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2E, 0x30,
    0x03, 0x01, 0x00, 0x00, 0x00
  );

  for (const buf of framesRGBA) {
    out.push(0x21, 0xF9, 0x04,
      0b00001001,
      delayCS & 0xFF, (delayCS >> 8) & 0xFF,
      0x00,
      0x00
    );

    out.push(0x2C, 0x00, 0x00, 0x00, 0x00);
    writeU16LE(out, W); writeU16LE(out, H);
    out.push(0x00);

    const idx = new Uint8Array(W * H);
    for (let i = 0, j = 0; i < buf.length; i += 4, j++) {
      idx[j] = mapRGBAtoIndex(buf[i], buf[i + 1], buf[i + 2], buf[i + 3]);
    }

    const { minCodeSize, blocks } = lzwEncode(idx);
    out.push(minCodeSize);
    for (const b of blocks) { out.push(b.length, ...b); }
    out.push(0x00);
  }

  out.push(0x3B);
  return new Blob([new Uint8Array(out)], { type: 'image/gif' });
}

export function exportGIF(fps) {
  const delayCS = Math.max(2, Math.round(100 / Math.max(1, fps)));
  const blob = encodeGIF(frames, delayCS);
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  download(`anim-${frames.length}f-${W}x${H}-${fps}fps-${ts}.gif`, blob, 'image/gif');
  msg('GIF 已导出');
}
