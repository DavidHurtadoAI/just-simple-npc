import { HAND_CUFF, HAND_TIP, paintGlove } from './hand-art';
import { TapSound } from './tap-sound';

interface Point { x: number; y: number }
interface Tap extends Point { time: number; variant: number }
interface Press { id: number; start: Point; last: Point; midpoint: Point | null }
type PointerMode = 'mouse' | 'touch';

const TAP_MS = 240;
const SPARK_VARIANTS = [
  { color: '#ffd050', accent: '#fff1b9', frames: [
    { radius: 4, length: 6, angle: .35, rays: [0, 2, 5, 7] },
    { radius: 7, length: 13, angle: .65, rays: [0, 1, 2, 3, 4, 6, 7, 8, 9] },
    { radius: 19, length: 4, angle: .15, rays: [0, 2, 5, 7, 9] },
  ] },
  { color: '#ff8968', accent: '#ffd193', frames: [
    { radius: 4, length: 7, angle: .8, rays: [1, 3, 5, 9] },
    { radius: 8, length: 12, angle: .15, rays: [0, 1, 3, 4, 5, 7, 9] },
    { radius: 17, length: 5, angle: .6, rays: [1, 3, 4, 7] },
  ] },
  { color: '#fff5db', accent: '#9de1ff', frames: [
    { radius: 5, length: 5, angle: .5, rays: [0, 3, 5, 8] },
    { radius: 7, length: 14, angle: .5, rays: [0, 2, 3, 5, 7, 8] },
    { radius: 20, length: 4, angle: .5, rays: [0, 3, 5, 8] },
  ] },
];
const GLOVE_REBOUND = [.86, 1.08, 1] as const;

function tapFrame(age: number): 0 | 1 | 2 {
  if (age < 56) return 0;
  return age < 124 ? 1 : 2;
}

export class HandPointer {
  private win: Window & typeof window;
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private glove: HTMLCanvasElement;
  private motion: MediaQueryList;
  private sound: TapSound;
  private mode: PointerMode | null = null;
  private listeners: AbortController | null = null;
  private observer: MutationObserver | null = null;
  private presentation: HTMLElement | null = null;
  private pointer: Point | null = null;
  private press: Press | null = null;
  private ink: Path2D | null = null;
  private taps: Tap[] = [];
  private frame = 0;

  constructor(private doc: Document, private workspace: HTMLElement, private npc: HTMLCanvasElement) {
    this.win = doc.defaultView!;
    this.motion = this.win.matchMedia('(prefers-reduced-motion: reduce)');
    this.canvas = this.win.createEl('canvas', { cls: 'lnp-hand-pointer', attr: { 'aria-hidden': 'true' } });
    this.canvas.hidden = true;
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Just Simple NPC needs a canvas context.');
    this.context = context;
    this.glove = paintGlove(this.win);
    this.sound = new TapSound(this.win);
  }

  get active(): boolean { return this.mode !== null; }
  get pointing(): boolean { return this.mode === 'mouse'; }

  toggle(pointer: Point | null, mode: PointerMode = 'mouse'): boolean {
    const alreadyActive = this.mode === mode;
    this.stop();
    if (alreadyActive) return false;

    this.mode = mode;
    this.pointer = pointer;
    this.doc.body.classList.toggle('lnp-touch-drawing', mode === 'touch');
    this.listeners = new this.win.AbortController();
    const options = { capture: true, signal: this.listeners.signal };
    this.win.addEventListener('pointermove', this.move, options);
    this.win.addEventListener('pointerdown', this.onPress, options);
    this.win.addEventListener('pointerup', this.onRelease, options);
    this.win.addEventListener('pointercancel', this.onCancel, options);
    this.win.addEventListener('click', this.onClick, options);
    this.win.addEventListener('dblclick', this.onDoubleClick, options);
    this.win.addEventListener('contextmenu', this.onContextMenu, options);
    this.win.addEventListener('keydown', this.onKey, options);
    this.win.addEventListener('blur', this.cancelPress, options);
    this.win.addEventListener('resize', this.refresh, options);
    if (mode === 'touch') this.win.addEventListener('touchstart', event => this.consume(event), { ...options, passive: false });
    this.doc.addEventListener('visibilitychange', this.onVisibility, options);
    this.doc.addEventListener('fullscreenchange', this.mount, options);
    // Slides also has a windowed player when requestFullscreen is denied.
    this.observer = new this.win.MutationObserver(this.mount);
    this.observer.observe(this.doc.body, { childList: true });
    this.mount();
    return true;
  }

  stop = (): void => {
    if (!this.listeners) return;
    this.listeners.abort();
    this.listeners = null;
    this.mode = null;
    this.observer?.disconnect();
    this.observer = null;
    this.presentation = null;
    this.ink = null;
    this.hide();
    this.doc.body.classList.remove('lnp-touch-drawing');
    this.canvas.remove();
  };

  private mount = (): void => {
    if (!this.active) return;
    this.presentation = this.doc.body.querySelector<HTMLElement>(':scope > .jss-presentation');
    const fullscreen = this.doc.fullscreenElement;
    const host = fullscreen instanceof this.win.HTMLElement && fullscreen !== this.doc.documentElement
      && fullscreen !== this.doc.body ? fullscreen : this.presentation ?? this.workspace;
    if (this.canvas.parentElement !== host) host.append(this.canvas);
    this.refresh();
  };

  private move = (event: PointerEvent): void => {
    const press = this.press;
    if (!this.accepts(event) || (!this.pointing && press?.id !== event.pointerId)) return;
    this.pointer = { x: event.clientX, y: event.clientY };
    if (press?.id === event.pointerId) {
      if (!this.pointing || (event.buttons & 1)) {
        for (const sample of event.getCoalescedEvents?.() ?? []) {
          this.extendStroke(press, { x: sample.clientX, y: sample.clientY });
        }
        this.extendStroke(press, this.pointer);
      } else this.cancelPress();
    }
    this.refresh();
  };

  private extendStroke(press: Press, point: Point): void {
    if (point.x === press.last.x && point.y === press.last.y) return;
    if (!press.midpoint) {
      if (this.pointing && Math.hypot(point.x - press.start.x, point.y - press.start.y) < 4) return;
      this.ink ??= new this.win.Path2D();
      this.ink.moveTo(press.start.x, press.start.y);
    }
    // Adjacent curves share the same tangent where they meet between samples.
    const midpoint = { x: (press.last.x + point.x) / 2, y: (press.last.y + point.y) / 2 };
    this.ink?.quadraticCurveTo(press.last.x, press.last.y, midpoint.x, midpoint.y);
    press.midpoint = midpoint;
    press.last = point;
  }

  private onPress = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.accepts(event)) return;
    this.consume(event);
    if (!this.pointing && (!event.isPrimary || this.press)) return;
    const point = { x: event.clientX, y: event.clientY };
    this.cancelPress();
    this.press = { id: event.pointerId, start: point, last: point, midpoint: null };
    this.pointer = point;
    this.refresh();
  };

  private onRelease = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.accepts(event)) return;
    this.consume(event);
    const press = this.press;
    if (press?.id !== event.pointerId) return;
    const point = { x: event.clientX, y: event.clientY };
    this.extendStroke(press, point);
    this.cancelPress();
    if (this.pointing) this.pointer = point;
    if (!press.midpoint) {
      if (!this.pointing) {
        this.ink ??= new this.win.Path2D();
        this.ink.moveTo(point.x, point.y);
        this.ink.lineTo(point.x + .01, point.y);
      }
      const variant = Math.floor(this.win.Math.random() * SPARK_VARIANTS.length);
      this.taps = [...this.taps.slice(-3), { ...point, time: this.win.performance.now(), variant }];
      this.sound.play();
    }
    this.refresh();
  };

  private cancelPress = (): void => {
    const press = this.press;
    if (press?.midpoint) this.ink?.lineTo(press.last.x, press.last.y);
    this.press = null;
    if (!this.pointing && this.pointer) {
      this.pointer = null;
      if (this.ink) this.refresh();
      else this.canvas.hidden = true;
    }
  };

  private onCancel = (event: PointerEvent): void => {
    if (this.press?.id === event.pointerId) this.cancelPress();
  };

  private accepts(event: PointerEvent): boolean {
    return this.pointing ? event.pointerType !== 'touch' : event.pointerType === 'touch';
  }

  private isTouchClick(event: MouseEvent): boolean {
    const source = event as MouseEvent & { sourceCapabilities?: { firesTouchEvents: boolean } | null };
    return (event.instanceOf(this.win.PointerEvent) && event.pointerType === 'touch') || source.sourceCapabilities?.firesTouchEvents === true;
  }

  private onClick = (event: MouseEvent): void => {
    if (event.button === 0 && event.detail > 0 && (this.pointing || this.isTouchClick(event))) this.consume(event);
  };

  private onDoubleClick = (event: MouseEvent): void => {
    if (event.target === this.npc.parentElement && !this.isTouchClick(event)) return;
    this.onClick(event);
  };

  private onContextMenu = (event: MouseEvent): void => {
    if (this.pointing || this.isTouchClick(event)) this.consume(event);
    if (this.pointing) this.stop();
  };

  private consume(event: Event): void { event.preventDefault(); event.stopImmediatePropagation(); }

  private onVisibility = (): void => { if (this.doc.hidden) this.hide(); else this.refresh(); };
  private onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && !this.presentation && !this.doc.fullscreenElement) {
      this.consume(event);
      this.stop();
    }
  };

  private hide(): void {
    this.sound.close();
    this.pointer = null;
    this.cancelPress();
    this.taps = [];
    this.win.cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.canvas.hidden = true;
    this.doc.body.classList.remove('lnp-hand-pointing');
  }

  refresh = (): void => {
    if (this.active && (this.pointer || this.ink) && !this.frame) this.frame = this.win.requestAnimationFrame(this.draw);
  };

  refreshSprite(): void { if (this.pointer && this.canvas.parentElement !== this.workspace) this.refresh(); }

  private draw = (now: number): void => {
    this.frame = 0;
    if (!this.pointer && !this.ink) return;
    const ratio = this.win.devicePixelRatio;
    const width = Math.ceil(this.win.innerWidth * ratio);
    const height = Math.ceil(this.win.innerHeight * ratio);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    const cssWidth = `${width / ratio}px`, cssHeight = `${height / ratio}px`;
    if (this.canvas.style.width !== cssWidth) this.canvas.style.width = cssWidth;
    if (this.canvas.style.height !== cssHeight) this.canvas.style.height = cssHeight;
    this.canvas.hidden = false;
    this.doc.body.classList.toggle('lnp-hand-pointing', this.pointing && !!this.pointer);

    const context = this.context;
    context.resetTransform();
    context.clearRect(0, 0, width, height);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.taps = this.taps.filter(tap => now - tap.time < TAP_MS);
    const tap = this.taps[this.taps.length - 1];
    const rebound = this.pointing && this.pointer && tap && !this.press && !this.motion.matches
      && Math.hypot(tap.x - this.pointer.x, tap.y - this.pointer.y) < 6 ? GLOVE_REBOUND[tapFrame(now - tap.time)] : 1;
    const glove = this.pointer ? { x: this.pointer.x - HAND_TIP.x, y: this.pointer.y - HAND_TIP.y * rebound } : null;
    if (glove) {
      const rect = this.npc.getBoundingClientRect();
      const copyNpc = this.canvas.parentElement !== this.workspace;
      const npcX = copyNpc ? 24 : rect.x;
      const npcY = copyNpc ? this.win.innerHeight - rect.height - 20 : rect.y;
      const shoulder = { x: npcX + rect.width * .62, y: npcY + rect.height * .62 };
      this.drawArm(shoulder, { x: glove.x + HAND_CUFF.x, y: glove.y + HAND_CUFF.y * rebound });
      context.imageSmoothingEnabled = false;
      if (copyNpc) context.drawImage(this.npc, npcX, npcY, rect.width, rect.height);
    }
    if (this.ink) {
      context.lineWidth = 3.5;
      context.lineJoin = 'round';
      context.lineCap = 'round';
      context.strokeStyle = '#ed2737';
      context.stroke(this.ink);
      // Keep the in-progress stroke at the fingertip while waiting for the next sample.
      const press = this.press;
      if (press?.midpoint) {
        context.beginPath();
        context.moveTo(press.midpoint.x, press.midpoint.y);
        context.lineTo(press.last.x, press.last.y);
        context.stroke();
      }
    }
    for (const tap of this.taps) this.drawTap(tap, now - tap.time);
    if (glove) context.drawImage(this.glove, glove.x, glove.y, this.glove.width, this.glove.height * rebound);
    if (this.taps.length) this.refresh();
  };

  private drawArm(start: Point, end: Point): void {
    const dx = end.x - start.x, dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length < 1) return;
    const nx = -dy / length, ny = dx / length;
    const base = .7, wrist = 2.7, middle = (base + wrist) / 2;
    const bend = { x: start.x + dx / 2, y: start.y + dy / 2 + Math.min(18, Math.abs(dx) / 16) };
    const context = this.context;
    const sleeve = context.createLinearGradient(start.x, start.y, end.x, end.y);
    sleeve.addColorStop(0, 'rgba(130, 132, 138, .18)');
    sleeve.addColorStop(.55, 'rgba(114, 118, 124, .49)');
    sleeve.addColorStop(1, 'rgba(91, 96, 104, .84)');
    context.beginPath();
    context.moveTo(start.x + nx * base, start.y + ny * base);
    context.quadraticCurveTo(bend.x + nx * middle, bend.y + ny * middle, end.x + nx * wrist, end.y + ny * wrist);
    context.lineTo(end.x - nx * wrist, end.y - ny * wrist);
    context.quadraticCurveTo(bend.x - nx * middle, bend.y - ny * middle, start.x - nx * base, start.y - ny * base);
    context.fillStyle = sleeve;
    context.fill();
  }

  private drawTap(tap: Tap, age: number): void {
    const context = this.context;
    const variant = SPARK_VARIANTS[tap.variant];
    const frame = variant.frames[this.motion.matches ? 1 : tapFrame(age)];
    const x = Math.round(tap.x), y = Math.round(tap.y);
    const outline = new this.win.Path2D(), sparks = new this.win.Path2D(), accents = new this.win.Path2D();
    for (const ray of frame.rays) {
      const angle = (ray + frame.angle) * Math.PI / 5;
      const length = frame.length - ray % 3;
      for (let step = 0; step < length; step++) {
        const distance = frame.radius + step;
        const sx = Math.round(x + Math.cos(angle) * distance);
        const sy = Math.round(y + Math.sin(angle) * distance);
        outline.rect(sx - 1, sy - 1, 3, 3);
        const rayPixels = ray % 3 ? sparks : accents;
        rayPixels.rect(sx, sy, 1, 1);
      }
    }
    context.fillStyle = '#303439';
    context.fill(outline);
    context.fillStyle = variant.color;
    context.fill(sparks);
    context.fillStyle = variant.accent;
    context.fill(accents);
  }
}
