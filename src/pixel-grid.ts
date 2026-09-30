export const SPRITE_WIDTH = 16;
export const SPRITE_HEIGHT = 24;
export const FOOT_ROW = 23;
export interface PixelMetrics { ratio: number; physicalCell: number; cell: number; width: number; height: number }

/** Saved size keys stay compatible; enlargement always uses whole screen pixels. */
export function pixelMetrics(size: number, deviceRatio: number): PixelMetrics {
  const ratio = Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1;
  const enlargement = size <= 1 ? 1 : size < 2 ? 2 : 3;
  const physicalCell = Math.max(1, Math.round(enlargement * ratio));
  const cell = physicalCell / ratio;
  return { ratio, physicalCell, cell, width: SPRITE_WIDTH * cell, height: SPRITE_HEIGHT * cell };
}
export function snapToPixel(value: number, ratio: number): number { return Math.round(value * ratio) / ratio; }

/** Paint on the native grid, then copy each cell to an exact square of screen pixels. */
export class PixelSurface {
  readonly canvas: HTMLCanvasElement;
  readonly source: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  private output: CanvasRenderingContext2D;
  private alignment = { x: 0, y: 0 };
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.source = canvas.ownerDocument.createElement('canvas');
    this.source.width = SPRITE_WIDTH; this.source.height = SPRITE_HEIGHT;
    const source = this.source.getContext('2d'), output = canvas.getContext('2d');
    if (!source || !output) throw new Error('Just Simple NPC needs a canvas context.');
    this.context = source; this.output = output;
  }
  resize(metrics: PixelMetrics): void {
    const width = SPRITE_WIDTH * metrics.physicalCell, height = SPRITE_HEIGHT * metrics.physicalCell;
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
    this.canvas.style.width = `${metrics.width}px`; this.canvas.style.height = `${metrics.height}px`;
  }
  present(): void {
    this.output.imageSmoothingEnabled = false;
    this.output.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.output.drawImage(this.source, 0, 0, this.canvas.width, this.canvas.height);
  }
  /** Flex/grid layouts can also place previews between physical pixels. */
  align(ratio: number): void {
    const rect = this.canvas.getBoundingClientRect();
    this.alignment.x += snapToPixel(rect.left, ratio) - rect.left;
    this.alignment.y += snapToPixel(rect.top, ratio) - rect.top;
    this.canvas.style.transform = `translate(${this.alignment.x}px, ${this.alignment.y}px)`;
  }
}
