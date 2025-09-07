import { frames, current, history } from './state.js';
import { MAX_HISTORY } from './constants.js';
import { renderFrameToDOM } from './grid.js';
import { setStatus } from './ui.js';

export function pushUndoSnapshot() {
  const h = history[current] || (history[current] = { undo: [], redo: [] });
  const snap = new Uint8ClampedArray(frames[current]);
  h.undo.push(snap);
  if (h.undo.length > MAX_HISTORY) h.undo.shift();
  h.redo.length = 0;
}
export function undo() {
  const h = history[current] || (history[current] = { undo: [], redo: [] });
  if (h.undo.length === 0) return;
  const prev = h.undo.pop();
  const cur = new Uint8ClampedArray(frames[current]);
  h.redo.push(cur);
  frames[current] = prev;
  renderFrameToDOM(current);
  setStatus('空闲');
}
export function redo() {
  const h = history[current] || (history[current] = { undo: [], redo: [] });
  if (h.redo.length === 0) return;
  const next = h.redo.pop();
  const cur = new Uint8ClampedArray(frames[current]);
  h.undo.push(cur);
  frames[current] = next;
  renderFrameToDOM(current);
  setStatus('空闲');
}
