export const DEFAULT_W = 32;
export const DEFAULT_H = 32;
export const MAX_HISTORY = 100;
export const COLORS = [
  'transparent', '#000000', '#ffffff', '#ff4757', '#ffa502',
  '#ffdd59', '#2ed573', '#1e90ff', '#5352ed', '#a55eea', '#636e72'
];

// 小工具
export const h2 = n => n.toString(16).padStart(2, '0');
export function toHex8FromRGBA(r, g, b, a) { return `#${h2(r)}${h2(g)}${h2(b)}${h2(a)}`; }
export function download(filename, blobOrText, mime) {
  const blob = blobOrText instanceof Blob ? blobOrText : new Blob([blobOrText], { type: mime || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
