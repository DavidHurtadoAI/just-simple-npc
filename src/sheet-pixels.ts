import { SHEET_WIDTH, SHEET_HEIGHT, USED_FRAMES, cellName } from './sheet-layout.ts';

export type BackgroundMode = 'transparent' | 'auto' | 'magenta';
export function sheetScale(width: number, height: number): number {
  const scale = width / SHEET_WIDTH;
  if (!Number.isInteger(scale) || scale < 1 || scale > 16 || height !== SHEET_HEIGHT * scale) {
    throw new Error('Use an 8 × 8 sheet: 128 × 192 pixels, or a whole-number enlargement such as 1024 × 1536. Maximum: 2048 × 3072.');
  }
  return scale;
}
export function pngDimensions(data: ArrayBuffer): { width: number; height: number } {
  const bytes = new Uint8Array(data), signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || !signature.every((value, i) => bytes[i] === value) || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') {
    throw new Error('Choose a PNG file. Renaming a JPEG or GIF does not convert it to PNG.');
  }
  const view = new DataView(data), width = view.getUint32(16), height = view.getUint32(20);
  sheetScale(width, height); return { width, height };
}
function border(frame: number): number[] {
  const x = frame % 8 * 16, y = Math.floor(frame / 8) * 24, result: number[] = [];
  for (let col = 0; col < 16; col++) result.push((y * SHEET_WIDTH + x + col) * 4, ((y + 23) * SHEET_WIDTH + x + col) * 4);
  for (let row = 1; row < 23; row++) result.push(((y + row) * SHEET_WIDTH + x) * 4, ((y + row) * SHEET_WIDTH + x + 15) * 4);
  return result;
}
function corners(frame: number): number[] {
  const edges = border(frame); return [edges[0], edges[1], edges[30], edges[31]];
}

/** Decode onto our native grid and remove only background connected to frame edges. */
export function prepareSheet(source: Uint8ClampedArray, width: number, height: number, mode: BackgroundMode): { pixels: Uint8ClampedArray; scale: number; removedBackground: boolean } {
  const scale = sheetScale(width, height);
  if (source.length !== width * height * 4) throw new Error('The PNG pixel data is incomplete.');
  const pixels = new Uint8ClampedArray(SHEET_WIDTH * SHEET_HEIGHT * 4);
  for (let y = 0; y < SHEET_HEIGHT; y++) for (let x = 0; x < SHEET_WIDTH; x++) {
    const from = (Math.floor((y + .5) * scale) * width + Math.floor((x + .5) * scale)) * 4, to = (y * SHEET_WIDTH + x) * 4;
    if (source[from + 3] >= 128) { pixels.set(source.subarray(from, from + 3), to); pixels[to + 3] = 255; }
  }
  const opaqueCorners = Array.from({ length: USED_FRAMES }, (_, frame) => corners(frame)).flat().filter(at => pixels[at + 3] > 0);
  let key: number[] | null = mode === 'magenta' ? [255, 0, 255] : null;
  const matches = (at: number, color: number[]) => color.every((value, channel) => Math.abs(pixels[at + channel] - value) <= 24);
  if (mode === 'auto' && opaqueCorners.length) {
    const sample = opaqueCorners[0]; key = Array.from(pixels.subarray(sample, sample + 3));
    const edges = Array.from({ length: USED_FRAMES }, (_, frame) => border(frame)).flat();
    if (!opaqueCorners.every(at => matches(at, key!)) || edges.filter(at => pixels[at + 3] === 0 || matches(at, key!)).length / edges.length < .8) {
      throw new Error('The background is not one flat color. A painted checkerboard is not transparency. Regenerate with real alpha or a solid #FF00FF background.');
    }
  }
  let removedBackground = false;
  if (key) for (let frame = 0; frame < 64; frame++) {
    const left = frame % 8 * 16, top = Math.floor(frame / 8) * 24;
    const queue = border(frame).filter(at => pixels[at + 3] > 0 && matches(at, key));
    const visited = new Set<number>();
    for (let head = 0; head < queue.length; head++) {
      const at = queue[head]; if (visited.has(at)) continue; visited.add(at);
      if (pixels[at + 3] === 0 || !matches(at, key)) continue;
      pixels.fill(0, at, at + 4); removedBackground = true;
      const pixel = at / 4, x = pixel % SHEET_WIDTH, y = Math.floor(pixel / SHEET_WIDTH);
      if (x > left) queue.push(at - 4); if (x < left + 15) queue.push(at + 4);
      if (y > top) queue.push(at - SHEET_WIDTH * 4); if (y < top + 23) queue.push(at + SHEET_WIDTH * 4);
    }
  }
  for (let frame = 0; frame < USED_FRAMES; frame++) {
    let filled = 0;
    const left = frame % 8 * 16, top = Math.floor(frame / 8) * 24;
    for (let y = top; y < top + 24; y++) for (let x = left; x < left + 16; x++) if (pixels[(y * SHEET_WIDTH + x) * 4 + 3]) filled++;
    if (!filled) throw new Error(`Frame ${cellName(frame)} is empty. Fill every animation cell from A1 through D8; E8–H8 are reserved.`);
    if (corners(frame).some(at => pixels[at + 3] > 0)) throw new Error(`Frame ${cellName(frame)} has an opaque corner. Keep the sprite inside its cell and use real transparency or remove its solid background.`);
  }
  // Reserved cells never influence rendering or background detection.
  for (let frame = USED_FRAMES; frame < 64; frame++) {
    const left = frame % 8 * 16, top = Math.floor(frame / 8) * 24;
    for (let y = top; y < top + 24; y++) pixels.fill(0, (y * SHEET_WIDTH + left) * 4, (y * SHEET_WIDTH + left + 16) * 4);
  }
  return { pixels, scale, removedBackground };
}
