import { COLORS } from './constants.js';
import { dom, setBrushColor } from './state.js';

export function msg(t, delay = 2200) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.style.setProperty('--out-delay', (delay / 1000) + 's');
  el.textContent = t;
  dom.toastWrap.appendChild(el);
  setTimeout(() => el.remove(), delay + 350);
}
export function setStatus(t) { dom.statusText.textContent = t; }
export function flashStatus(t, dur = 1400) {
  const prev = dom.statusText.textContent;
  setStatus(t);
  setTimeout(() => { if (dom.statusText.textContent === t) setStatus('空闲'); }, dur);
}

export function renderSwatches() {
  const frag = document.createDocumentFragment();
  COLORS.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.dataset.color = c;
    if (c === 'transparent') b.title = '透明';
    else b.style.background = c;
    if (i === 1) b.classList.add('active'); // 默认 #000000
    frag.appendChild(b);
  });
  dom.swatchesEl.appendChild(frag);
}
export function setActiveSwatch(color) {
  document.querySelectorAll('.swatch')
    .forEach(el => el.classList.toggle('active', el.dataset.color === color));
  if (color !== 'transparent') {
    dom.colorPicker.value = color.length === 7 ? color : '#000000';
    dom.hexInput.value = (color.startsWith('#') ? color.slice(1) : color).toUpperCase();
  }
  setBrushColor(color);
}

export function bindColorPickers() {
  dom.swatchesEl.addEventListener('click', e => {
    const sw = e.target.closest('.swatch'); if (!sw) return;
    setActiveSwatch(sw.dataset.color);
  });
  dom.colorPicker.addEventListener('input', e => {
    const hex = e.target.value;
    setActiveSwatch(hex);
  });
  dom.hexInput.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    let v = e.target.value.trim();
    if (v.startsWith('#')) v = v.slice(1);
    if (!/^[0-9a-fA-F]{6}$/.test(v)) { msg('请输入 6 位十六进制颜色，如 1A2B3C'); return; }
    const hex = '#' + v.toUpperCase();
    dom.colorPicker.value = hex;
    setActiveSwatch(hex);
  });
}

export function initSwatches() {
  renderSwatches();
  bindColorPickers();
  setActiveSwatch('#000000');
  dom.hexInput.value = '000000';
}
