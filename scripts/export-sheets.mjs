import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { drawSprite } from '../src/sprite.ts';
import { CLIPS, SHEET_VERSION, SHEET_WIDTH, SHEET_HEIGHT, templatePose, cellName } from '../src/sheet-layout.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, 'docs/custom-npc');
fs.mkdirSync(folder, { recursive: true });
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = crc & 1 ? 0xedb88320 ^ crc >>> 1 : crc >>> 1; }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]), result = Buffer.alloc(body.length + 8);
  result.writeUInt32BE(data.length); body.copy(result, 4); result.writeUInt32BE(crc32(body), body.length + 4); return result;
}
function png(width, height, pixels) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) rows.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function enlarged(pixels, scale) {
  const width = SHEET_WIDTH * scale, height = SHEET_HEIGHT * scale, result = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const from = (Math.floor(y / scale) * SHEET_WIDTH + Math.floor(x / scale)) * 4;
    result.set(pixels.subarray(from, from + 4), (y * width + x) * 4);
  }
  return result;
}
for (const character of ['pip', 'arden', 'nova']) {
  const pixels = new Uint8ClampedArray(SHEET_WIDTH * SHEET_HEIGHT * 4);
  for (let index = 0; index < 60; index++) {
    const frame = new Uint8ClampedArray(16 * 24 * 4), pose = templatePose(index);
    const context = { fillStyle: '', imageSmoothingEnabled: false, clearRect() { frame.fill(0); }, fillRect(x, y) {
      const rgb = this.fillStyle.slice(1).match(/../g).map(value => parseInt(value, 16));
      frame.set([...rgb, 255], (y * 16 + x) * 4);
    } };
    drawSprite(context, { ...pose, character });
    for (let y = 0; y < 24; y++) {
      const at = ((Math.floor(index / 8) * 24 + y) * SHEET_WIDTH + index % 8 * 16) * 4;
      pixels.set(frame.subarray(y * 16 * 4, (y + 1) * 16 * 4), at);
    }
  }
  fs.writeFileSync(path.join(folder, `${character}-native.png`), png(SHEET_WIDTH, SHEET_HEIGHT, pixels));
  fs.writeFileSync(path.join(folder, `${character}-template.png`), png(1024, 1536, enlarged(pixels, 8)));
}
const empty = new Uint8ClampedArray(SHEET_WIDTH * SHEET_HEIGHT * 4);
fs.writeFileSync(path.join(folder, 'blank-native.png'), png(SHEET_WIDTH, SHEET_HEIGHT, empty));
const guide = enlarged(empty, 8);
for (let y = 0; y < 1536; y++) for (let x = 0; x < 1024; x++) {
  const edge = x % 128 === 0 || y % 192 === 0;
  guide.set(edge ? [95, 67, 107, 255] : [255, 0, 255, 255], (y * 1024 + x) * 4);
}
fs.writeFileSync(path.join(folder, 'blank-grid-guide.png'), png(1024, 1536, guide));
const colors = ['#f7d8b7', '#d9e3d1', '#cbdce6', '#e4d7eb', '#e5ddb8', '#c6e1d7', '#eed3d7', '#d8d6ed'];
let cells = '';
for (let index = 0; index < 64; index++) {
  const x = index % 8 * 128, y = Math.floor(index / 8) * 192;
  const entry = Object.entries(CLIPS).find(([, clip]) => index >= clip.start && index < clip.start + clip.frames);
  const action = entry?.[0] ?? 'reserved';
  cells += `<rect x="${x}" y="${y}" width="128" height="192" fill="${colors[Math.floor(index / 8)]}" stroke="#716879"/><text x="${x + 64}" y="${y + 86}" text-anchor="middle" font-size="23" font-weight="bold">${cellName(index)}</text><text x="${x + 64}" y="${y + 114}" text-anchor="middle" font-size="15">${action}</text>`;
}
fs.writeFileSync(path.join(folder, 'layout-guide.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536" viewBox="0 0 1024 1536"><g font-family="system-ui,sans-serif" fill="#302a38">${cells}</g></svg>\n`);
// A bitmap font keeps the PNG guide reproducible without a graphics runtime.
const font = {
  A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],
  C:['01111','10000','10000','10000','10000','10000','01111'],D:['11110','10001','10001','10001','10001','10001','11110'],
  E:['11111','10000','10000','11110','10000','10000','11111'],F:['11111','10000','10000','11110','10000','10000','10000'],
  G:['01111','10000','10000','10111','10001','10001','01111'],H:['10001','10001','10001','11111','10001','10001','10001'],
  1:['00100','01100','00100','00100','00100','00100','01110'],2:['01110','10001','00001','00010','00100','01000','11111'],
  3:['11110','00001','00001','01110','00001','00001','11110'],4:['00010','00110','01010','10010','11111','00010','00010'],
  5:['11111','10000','10000','11110','00001','00001','11110'],6:['01110','10000','10000','11110','10001','10001','01110'],
  7:['11111','00001','00010','00100','01000','01000','01000'],8:['01110','10001','10001','01110','10001','10001','01110']
};
const labeled = new Uint8ClampedArray(1024 * 1536 * 4);
for (let index = 0; index < 64; index++) {
  const left = index % 8 * 128, top = Math.floor(index / 8) * 192;
  const color = colors[Math.floor(index / 8)].slice(1).match(/../g).map(value => parseInt(value, 16));
  for (let y = 0; y < 192; y++) for (let x = 0; x < 128; x++) labeled.set(x === 0 || y === 0 ? [113,104,121,255] : [...color,255], ((top + y) * 1024 + left + x) * 4);
  for (const [letter, symbol] of [...cellName(index)].entries()) for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (font[symbol][y][x] === '1') {
    for (let dy = 0; dy < 5; dy++) for (let dx = 0; dx < 5; dx++) labeled.set([48,42,56,255], ((top + 78 + y * 5 + dy) * 1024 + left + 37 + letter * 30 + x * 5 + dx) * 4);
  }
}
fs.writeFileSync(path.join(folder, 'layout-guide.png'), png(1024, 1536, labeled));
fs.writeFileSync(path.join(folder, 'layout-v1.json'), JSON.stringify({ version: SHEET_VERSION, columns: 8, rows: 8, frameWidth: 16, frameHeight: 24, width: 128, height: 192, aiWidth: 1024, aiHeight: 1536, clips: CLIPS, reserved: ['E8', 'F8', 'G8', 'H8'], directionalOrder: ['left', 'right', 'up-left', 'up-right'] }, null, 2) + '\n');
console.log('Exported three native sheets, three AI templates, a blank sheet, a grid guide and the format definition.');
