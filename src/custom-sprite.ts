import { SHEET_WIDTH, SHEET_HEIGHT, sheetFrame } from './sheet-layout';
import { pngDimensions, prepareSheet, type BackgroundMode } from './sheet-pixels';
import type { SpritePose } from './sprite';

export class CustomSprite {
  readonly canvas: HTMLCanvasElement;
  readonly scale: number;
  readonly removedBackground: boolean;
  private constructor(doc: Document, result: ReturnType<typeof prepareSheet>) {
    this.canvas = doc.body.createEl('canvas'); this.canvas.remove();
    this.canvas.width = SHEET_WIDTH; this.canvas.height = SHEET_HEIGHT;
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('A canvas context is required to load your companion.');
    const image = context.createImageData(SHEET_WIDTH, SHEET_HEIGHT); image.data.set(result.pixels); context.putImageData(image, 0, 0);
    this.scale = result.scale; this.removedBackground = result.removedBackground;
  }
  static async load(data: ArrayBuffer, doc: Document, mode: BackgroundMode): Promise<CustomSprite> {
    if (data.byteLength > 12 * 1024 * 1024) throw new Error('Use a PNG smaller than 12 MB.');
    const dimensions = pngDimensions(data), win = doc.defaultView as Window & typeof window;
    const image = doc.body.createEl('img'); image.remove();
    const url = win.URL.createObjectURL(new Blob([data], { type: 'image/png' }));
    try {
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('The PNG could not be decoded.')); image.src = url; });
      if (image.naturalWidth !== dimensions.width || image.naturalHeight !== dimensions.height) throw new Error('The PNG dimensions do not match its header.');
      const canvas = doc.body.createEl('canvas'); canvas.remove(); canvas.width = dimensions.width; canvas.height = dimensions.height;
      const context = canvas.getContext('2d'); if (!context) throw new Error('A canvas context is required to decode the PNG.');
      context.drawImage(image, 0, 0);
      return new CustomSprite(doc, prepareSheet(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, mode));
    } finally { image.onload = null; image.onerror = null; image.src = ''; win.URL.revokeObjectURL(url); }
  }
  draw(context: CanvasRenderingContext2D, pose: SpritePose): void {
    const frame = sheetFrame(pose); context.clearRect(0, 0, 16, 24); context.imageSmoothingEnabled = false;
    context.save();
    if (frame.mirror) { context.translate(16, 0); context.scale(-1, 1); }
    context.drawImage(this.canvas, frame.index % 8 * 16, Math.floor(frame.index / 8) * 24, 16, 24, 0, 0, 16, 24);
    context.restore();
  }
}
