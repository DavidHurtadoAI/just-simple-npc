type AnimationWindow = Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame' | 'setTimeout' | 'clearTimeout' | 'performance'>;

/** Wake near the next deadline instead of polling on every display frame. */
export class AnimationLoop {
  private frame = 0;
  private timer = 0;
  private deadline = 0;
  private interval = 0;
  private win: AnimationWindow;
  private tick: (time: number) => void;
  constructor(win: AnimationWindow, tick: (time: number) => void) { this.win = win; this.tick = tick; }
  get pending(): boolean { return !!(this.frame || this.timer); }
  wake(): void {
    if (this.frame) { this.deadline = 0; this.interval = 0; return; }
    this.cancel();
    this.request();
  }
  schedule(time: number, interval: number): void {
    this.win.cancelAnimationFrame(this.frame); this.win.clearTimeout(this.timer);
    this.frame = 0; this.timer = 0;
    this.deadline = this.interval === interval ? this.deadline + interval : time + interval;
    this.interval = interval;
    const now = this.win.performance.now();
    if (this.deadline < now) this.deadline = now + interval;
    // A small lead lets requestAnimationFrame align the deadline to a refresh.
    this.timer = this.win.setTimeout(() => { this.timer = 0; this.request(); }, Math.max(0, this.deadline - now - 8));
  }
  private request(): void {
    this.frame = this.win.requestAnimationFrame(time => {
      this.frame = 0;
      if (this.deadline && time + .001 < this.deadline) { this.request(); return; }
      this.tick(time);
    });
  }
  cancel(): void {
    this.win.cancelAnimationFrame(this.frame); this.win.clearTimeout(this.timer);
    this.frame = 0; this.timer = 0; this.deadline = 0; this.interval = 0;
  }
}

interface Preview {
  canvas: HTMLCanvasElement;
  visible: boolean;
  align: boolean;
  paint(time: number, align: boolean, reduced: boolean): void;
  removed(): void;
}

/** One clock and one visibility observer per settings document. */
export class PreviewAnimator {
  private win: Window & typeof window;
  private loop: AnimationLoop;
  private previews = new Map<HTMLCanvasElement, Preview>();
  private intersection: IntersectionObserver | null = null;
  private resize: ResizeObserver | null = null;
  private motion: MediaQueryList;
  private start: number;
  private destroyed = false;
  private disposers: (() => void)[] = [];
  private doc: Document;
  private empty: () => void;
  constructor(doc: Document, empty: () => void) {
    this.doc = doc; this.empty = empty;
    this.win = doc.defaultView!;
    this.motion = this.win.matchMedia('(prefers-reduced-motion: reduce)');
    this.start = this.win.performance.now();
    this.loop = new AnimationLoop(this.win, time => this.tick(time));
    if (this.win.IntersectionObserver) this.intersection = new this.win.IntersectionObserver(entries => {
      for (const entry of entries) {
        const preview = this.previews.get(entry.target as HTMLCanvasElement);
        if (preview) { preview.visible = entry.isIntersecting; preview.align = true; }
      }
      this.sync();
    });
    if (this.win.ResizeObserver) this.resize = new this.win.ResizeObserver(() => this.realign());
    this.listen(this.doc, 'visibilitychange', () => this.sync());
    this.listen(this.win, 'focus', () => this.sync());
    this.listen(this.win, 'blur', () => this.sync());
    this.listen(this.win, 'resize', () => this.realign());
    this.listen(this.doc, 'scroll', () => this.realign(), true);
    this.listen(this.motion, 'change', () => { this.loop.cancel(); this.sync(); });
  }
  add(canvas: HTMLCanvasElement, paint: Preview['paint'], removed: () => void): () => void {
    const preview: Preview = { canvas, paint, removed, align: true, visible: !this.intersection };
    this.previews.set(canvas, preview);
    this.intersection?.observe(canvas); this.resize?.observe(canvas);
    this.sync();
    return () => this.remove(preview);
  }
  private listen(target: EventTarget, name: string, callback: () => void, capture = false): void {
    target.addEventListener(name, callback, capture);
    this.disposers.push(() => target.removeEventListener(name, callback, capture));
  }
  private realign(): void {
    for (const preview of this.previews.values()) preview.align = true;
    this.sync();
  }
  private active(): boolean { return !this.doc.hidden && this.doc.hasFocus(); }
  private sync(): void {
    if (this.destroyed) return;
    if (!this.active() || !Array.from(this.previews.values()).some(preview => preview.visible)) this.loop.cancel();
    else if (!this.loop.pending) this.loop.wake();
  }
  private tick(time: number): void {
    if (this.destroyed || !this.active()) { this.loop.cancel(); return; }
    for (const preview of this.previews.values()) {
      if (!preview.canvas.isConnected) { this.remove(preview); continue; }
      if (!preview.visible) continue;
      preview.paint(this.motion.matches ? .8 : .8 + (time - this.start) / 1000, preview.align, this.motion.matches);
      preview.align = false;
    }
    if (!this.destroyed && !this.motion.matches && Array.from(this.previews.values()).some(preview => preview.visible)) this.loop.schedule(time, 100);
  }
  private remove(preview: Preview): void {
    if (!this.previews.delete(preview.canvas)) return;
    this.intersection?.unobserve(preview.canvas); this.resize?.unobserve(preview.canvas);
    preview.removed();
    if (!this.previews.size) {
      this.destroyed = true; this.loop.cancel();
      this.intersection?.disconnect(); this.resize?.disconnect();
      for (const dispose of this.disposers) dispose();
      this.disposers.length = 0; this.empty();
    } else this.sync();
  }
}
