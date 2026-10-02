import { abbreviate, clamp, fanLayout, nextAction, CHARACTERS, type Action, type Brain, type Settings } from './core';
import { drawSprite, lookDirection } from './sprite';
import { FOOT_ROW, PixelSurface, pixelMetrics, snapToPixel, type PixelMetrics } from './pixel-grid';
import { advanceFall, LANDING_SECONDS, type FallState } from './physics';

interface Grab { pointerId: number; startX: number; startY: number; originX: number; originHeight: number; active: boolean }

export interface FanCommand { id: string; name: string; label: string; icon?: string; available: boolean }
export interface CompanionHost {
  settings(): Settings;
  commands(): FanCommand[];
  execute(id: string): void;
  configure(): void;
  decorateIcon(el: HTMLElement, icon: string): void;
}

export class Companion {
  readonly root: HTMLElement;
  readonly actor: HTMLButtonElement;
  readonly canvas: HTMLCanvasElement;
  readonly fan: HTMLElement;
  private surface: PixelSurface;
  private metrics!: PixelMetrics;
  private win: Window & typeof window;
  private frame = 0;
  private destroyed = false;
  private lastFrame = 0;
  private elapsed = 0;
  private actionElapsed = 0;
  private lastAction: Action | null = null;
  private lookSide = 1;
  private lastPaint = 0;
  private x = 240;
  private height = 0;
  private fall: FallState | null = null;
  private landingRemaining = 0;
  private grab: Grab | null = null;
  private suppressClickUntil = 0;
  private floor = 0;
  private left = 18;
  private right = 800;
  private pointer = { x: -9999, y: -9999 };
  private nearby = false;
  private focused = false;
  private hovered = false;
  private opened = false;
  private pinned = false;
  private hoverTimer = 0;
  private closeTimer = 0;
  private attentionUntil = 0;
  private ignoreHoverUntil = 0;
  private previousFocus: HTMLElement | null = null;
  private fanBox = { left: 0, right: 0, top: 0, bottom: 0 };
  private motion: MediaQueryList;
  private brain: Brain = { action: 'walk', remaining: 9, destination: 430, direction: 1 };
  private disposers: (() => void)[] = [];

  constructor(private doc: Document, private host: CompanionHost) {
    this.win = doc.defaultView!;
    this.motion = this.win.matchMedia('(prefers-reduced-motion: reduce)');
    this.root = doc.body.createDiv({ cls: 'lnp-root' });
    this.actor = this.root.createEl('button', { cls: 'lnp-actor' });
    this.actor.type = 'button'; this.actor.setAttribute('aria-label', 'Pip — favorite commands');
    this.actor.setAttribute('aria-haspopup', 'menu'); this.actor.setAttribute('aria-expanded', 'false');
    this.actor.title = 'Pip · hover for your commands';
    this.canvas = this.actor.createEl('canvas');
    this.canvas.setAttribute('aria-hidden', 'true'); this.actor.append(this.canvas);
    this.surface = new PixelSurface(this.canvas);
    this.fan = this.root.createDiv({ cls: 'lnp-fan' });
    this.fan.setAttribute('role', 'menu'); this.fan.setAttribute('aria-label', 'Favorite commands'); this.fan.hidden = true;
    this.root.append(this.actor, this.fan); this.doc.body.append(this.root);
    this.measure(); this.x = clamp(this.win.innerWidth * .42, this.left, this.right); this.place();
    this.listen(this.doc, 'pointermove', event => this.onPointer(event as PointerEvent));
    this.listen(this.doc, 'pointerdown', event => {
      if (this.opened && !this.root.contains(event.target as Node)) this.close(false);
    });
    this.listen(this.actor, 'pointerenter', () => {
      this.hovered = true; this.nearby = true; this.cancelClose();
      if (this.grab || this.fall || this.landingRemaining > 0 || this.win.performance.now() < this.ignoreHoverUntil) return;
      this.clearHover();
      this.hoverTimer = this.win.setTimeout(() => { if (this.hovered) this.open(false); }, this.host.settings().hoverDelay);
    });
    this.listen(this.actor, 'pointerleave', () => { this.hovered = false; this.clearHover(); });
    this.listen(this.actor, 'pointerdown', event => this.startGrab(event as PointerEvent));
    this.listen(this.doc, 'pointerup', event => this.releaseGrab(event as PointerEvent));
    this.listen(this.doc, 'pointercancel', event => this.releaseGrab(event as PointerEvent));
    this.listen(this.actor, 'lostpointercapture', event => this.releaseGrab(event as PointerEvent));
    this.listen(this.actor, 'click', event => {
      if ((event as MouseEvent).detail !== 0 && this.win.performance.now() < this.suppressClickUntil) { event.preventDefault(); return; }
      if (this.grab || this.fall || this.landingRemaining > 0) return;
      if (!this.opened) this.open((event as MouseEvent).detail === 0);
      else { this.pinned = true; if ((event as MouseEvent).detail === 0) this.focusFirst(); }
    });
    this.listen(this.actor, 'contextmenu', event => { event.preventDefault(); if (!this.grab?.active) { this.close(false); this.host.configure(); } });
    this.listen(this.actor, 'focus', () => { this.focused = true; });
    this.listen(this.actor, 'blur', () => { this.focused = false; });
    this.listen(this.fan, 'pointerenter', () => this.cancelClose());
    this.listen(this.fan, 'keydown', event => this.onMenuKey(event as KeyboardEvent));
    this.listen(this.doc, 'keydown', event => {
      if (this.grab && (event as KeyboardEvent).key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.releaseGrab(); return; }
      if (this.opened && (event as KeyboardEvent).key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(true); }
    }, true);
    this.listen(this.win, 'resize', () => { this.measure(); this.place(); if (this.opened) this.layoutFan(); });
    this.listen(this.win, 'blur', () => { this.releaseGrab(); this.pointer = { x: -9999, y: -9999 }; this.close(false); this.clearHover(); });
    this.listen(this.win, 'focus', () => { this.lastFrame = 0; });
    this.listen(this.doc, 'visibilitychange', () => { if (this.doc.hidden) { this.releaseGrab(); this.close(false); this.clearHover(); } this.lastFrame = 0; });
    this.listen(this.motion, 'change', () => { if (this.motion.matches && this.fall) this.land(); this.lastPaint = 0; });
    this.frame = this.win.requestAnimationFrame(time => this.tick(time));
  }

  private listen(target: EventTarget, name: string, fn: (event: Event) => void, capture = false): void {
    target.addEventListener(name, fn, capture); this.disposers.push(() => target.removeEventListener(name, fn, capture));
  }
  private clearHover(): void { this.win.clearTimeout(this.hoverTimer); this.hoverTimer = 0; }
  private cancelClose(): void { this.win.clearTimeout(this.closeTimer); this.closeTimer = 0; }
  private measure(): void {
    this.metrics = pixelMetrics(this.host.settings().scale, this.win.devicePixelRatio);
    this.surface.resize(this.metrics);
    this.lastPaint = 0;
    const bar = this.doc.querySelector<HTMLElement>('.status-bar');
    const rect = bar?.getBoundingClientRect();
    this.floor = rect && rect.height > 0 ? rect.top + 1 : this.win.innerHeight - 9;
    this.left = 18; this.right = Math.max(this.left, this.win.innerWidth - this.actorWidth() - 18);
    this.x = clamp(this.x, this.left, this.right);
    this.height = clamp(this.height, 0, this.maxLift());
    if (this.fall) this.fall.height = this.height;
  }
  private maxLift(): number {
    const pad = (Math.max(44, this.metrics.height) - this.metrics.height) / 2;
    return Math.max(0, this.floor - FOOT_ROW * this.metrics.cell - pad - 8);
  }
  private place(): void {
    const { width, height: imageHeight, cell, ratio } = this.metrics;
    const height = Math.max(44, imageHeight), topPad = (height - imageHeight) / 2;
    const actorLeft = snapToPixel(this.x, ratio), actorTop = snapToPixel(this.floor - this.height - FOOT_ROW * cell - topPad, ratio);
    this.actor.style.width = `${this.actorWidth()}px`; this.actor.style.height = `${height}px`;
    this.canvas.style.left = `${snapToPixel(actorLeft + (this.actorWidth() - width) / 2, ratio) - actorLeft}px`;
    this.canvas.style.top = `${snapToPixel(actorTop + topPad, ratio) - actorTop}px`;
    this.actor.style.transform = `translate(${actorLeft}px, ${actorTop}px)`;
    const name = CHARACTERS.find(character => character.id === this.host.settings().character)!.name;
    this.actor.setAttribute('aria-label', `${name} — drag to move, hover for favorite commands`); this.actor.title = `${name} · drag to move · hover for your commands`;
  }
  private actorWidth(): number { return Math.max(40, this.metrics.width); }
  private startGrab(event: PointerEvent): void {
    if (event.button !== 0 || this.grab || this.destroyed) return;
    event.preventDefault(); this.clearHover(); this.cancelClose();
    this.grab = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      originX: this.x, originHeight: this.height, active: false };
    // Document listeners also handle older hosts and synthetic test pointers.
    try { this.actor.setPointerCapture(event.pointerId); } catch { /* No active pointer to capture. */ }
  }
  private releaseGrab(event?: PointerEvent): void {
    const grab = this.grab;
    if (!grab || event && event.pointerId !== grab.pointerId) return;
    this.grab = null; this.root.dataset.dragging = 'false';
    if (this.actor.hasPointerCapture(grab.pointerId)) this.actor.releasePointerCapture(grab.pointerId);
    if (!grab.active) return;
    this.suppressClickUntil = this.win.performance.now() + 600;
    this.hovered = false; this.clearHover(); this.ignoreHoverUntil = this.win.performance.now() + 600;
    if (this.motion.matches || this.height === 0) this.land();
    else this.fall = { height: this.height, velocity: 0 };
    this.lastPaint = 0;
  }
  private land(): void {
    this.fall = null; this.height = 0; this.landingRemaining = LANDING_SECONDS;
    this.lastPaint = 0; this.place();
  }
  private onPointer(event: PointerEvent): void {
    if (this.grab && event.pointerId === this.grab.pointerId) {
      this.pointer = { x: event.clientX, y: event.clientY };
      const dx = event.clientX - this.grab.startX, dy = event.clientY - this.grab.startY;
      if (!this.grab.active && Math.hypot(dx, dy) >= 6) {
        this.grab.active = true; this.close(false); this.fall = null; this.landingRemaining = 0;
        this.root.dataset.dragging = 'true'; this.lastPaint = 0;
      }
      if (this.grab.active) {
        event.preventDefault(); this.x = clamp(this.grab.originX + dx, this.left, this.right);
        this.height = clamp(this.grab.originHeight - dy, 0, this.maxLift()); this.place();
      }
      return;
    }
    if (event.pointerType === 'touch') return;
    this.pointer = { x: event.clientX, y: event.clientY };
    this.updateAttention();
    if (this.opened && !this.pinned) {
      const box = this.fanBox;
      const safe = event.clientX >= box.left - 20 && event.clientX <= box.right + 20 && event.clientY >= box.top - 18 && event.clientY <= box.bottom + 18;
      if (safe || this.root.contains(event.target as Node)) this.cancelClose();
      else if (!this.closeTimer) this.closeTimer = this.win.setTimeout(() => this.close(false), 450);
    }
  }
  private updateAttention(): void {
    const dx = this.pointer.x - (this.x + this.actorWidth() / 2);
    const dy = this.pointer.y - (this.floor - this.height - 17 * this.metrics.cell);
    const distance = Math.hypot(dx, dy);
    const approaching = distance < this.host.settings().proximity;
    if (approaching || this.hovered || this.focused || this.opened) this.attentionUntil = this.win.performance.now() + 750;
    this.nearby = approaching || this.hovered || this.focused || this.opened || this.win.performance.now() < this.attentionUntil;
  }
  private tick(time: number): void {
    if (this.destroyed) return;
    if (this.metrics.ratio !== this.win.devicePixelRatio) this.refresh();
    const dt = this.lastFrame ? Math.min(.1, (time - this.lastFrame) / 1000) : 0;
    this.lastFrame = time;
    const active = !this.doc.hidden && this.doc.hasFocus();
    if (active) {
      this.elapsed += dt;
      this.updateAttention();
      if (!this.grab && this.fall) {
        this.fall = advanceFall(this.fall, dt); this.height = this.fall.height;
        if (this.height === 0) this.land();
        this.place();
      } else if (!this.grab && this.landingRemaining > 0) {
        this.landingRemaining = Math.max(0, this.landingRemaining - dt);
        if (this.landingRemaining === 0) this.brain = { action: 'idle', remaining: 1.2, destination: this.x, direction: this.brain.direction };
      } else if (!this.grab && !this.nearby && !this.motion.matches) {
        this.brain.remaining -= dt;
        if (this.brain.remaining <= 0) this.brain = nextAction(this.x, this.left, this.right);
        if (this.brain.action === 'walk') {
          const distance = this.brain.destination - this.x;
          this.brain.direction = distance >= 0 ? 1 : -1;
          this.x += this.brain.direction * Math.min(Math.abs(distance), this.host.settings().speed * dt);
          if (Math.abs(distance) < 1) { this.brain.action = 'look'; this.brain.remaining = 2.5; }
          this.place();
        }
      }
    }
    const action = this.grab?.active ? this.height > 0 ? 'held' : 'idle' : this.fall ? 'fall'
      : this.landingRemaining > 0 ? 'land' : this.opened ? 'offer' : this.nearby ? 'watch' : this.motion.matches ? 'idle' : this.brain.action;
    if (action !== this.lastAction) { this.lastAction = action; this.actionElapsed = 0; }
    else if (active) this.actionElapsed += dt;
    if ((active && time - this.lastPaint >= 80) || !this.lastPaint) {
      const gazeX = (this.pointer.x - this.x - this.actorWidth() / 2) / 40;
      const gazeY = (this.pointer.y - this.floor + this.height + 17 * this.metrics.cell) / (20 * this.metrics.cell);
      if (Math.abs(gazeX) > .12) this.lookSide = Math.sign(gazeX);
      this.root.dataset.action = action;
      this.root.dataset.character = this.host.settings().character;
      this.root.dataset.look = lookDirection(gazeX, gazeY, this.lookSide);
      drawSprite(this.surface.context, { action, character: this.host.settings().character, time: this.elapsed, actionTime: this.actionElapsed,
        direction: action === 'watch' || action === 'offer' ? this.lookSide : this.brain.direction,
        gazeX, gazeY, reduced: this.motion.matches });
      this.surface.present();
      this.lastPaint = time;
    }
    this.frame = this.win.requestAnimationFrame(next => this.tick(next));
  }

  open(keyboard = false): void {
    if (this.destroyed || this.grab || this.fall || this.landingRemaining > 0) return;
    this.clearHover(); this.cancelClose();
    if (!this.opened) this.previousFocus = this.doc.activeElement instanceof this.win.HTMLElement ? this.doc.activeElement : null;
    this.opened = true; this.pinned = keyboard; this.nearby = true; this.lastPaint = 0;
    this.actor.setAttribute('aria-expanded', 'true');
    this.fan.replaceChildren();
    const commands = this.host.commands();
    if (!commands.length) {
      const button = this.fan.createEl('button', { cls: 'lnp-bubble lnp-empty' }); button.type = 'button';
      button.textContent = 'Choose your commands'; button.setAttribute('role', 'menuitem');
      button.addEventListener('click', () => { this.close(false); this.host.configure(); }); this.fan.append(button);
    } else {
      for (const [index, command] of commands.entries()) {
        const button = this.fan.createEl('button', { cls: 'lnp-bubble' }); button.type = 'button';
        button.setAttribute('role', 'menuitem'); button.setAttribute('aria-label', command.name);
        button.title = command.available ? command.name : `${command.name} · command unavailable`;
        button.dataset.command = command.id; button.dataset.index = `${index}`;
        button.disabled = !command.available;
        const icon = button.createSpan({ cls: 'lnp-command-icon' }); icon.setAttribute('aria-hidden', 'true');
        if (command.icon) this.host.decorateIcon(icon, command.icon); else icon.textContent = '✦';
        const label = button.createSpan({ cls: 'lnp-command-label' }); label.textContent = abbreviate(command.label || command.name);
        button.append(icon, label);
        button.addEventListener('pointerdown', event => event.preventDefault());
        button.addEventListener('click', () => {
          this.close(false); this.restoreFocus(); this.ignoreHoverUntil = this.win.performance.now() + 900;
          this.host.execute(command.id); this.brain = { ...this.brain, action: 'wave', remaining: 2 };
        });
        this.fan.append(button);
      }
    }
    this.fan.hidden = false; this.layoutFan();
    if (keyboard) this.focusFirst();
  }
  private layoutFan(): void {
    this.fan.querySelector('.lnp-stems')?.remove();
    const bubbles = Array.from(this.fan.querySelectorAll<HTMLElement>('.lnp-bubble'));
    const anchorX = this.x + this.actorWidth() / 2;
    const anchorY = this.floor - 19 * this.metrics.cell;
    const layout = fanLayout(bubbles.length || 1, anchorX, this.win.innerWidth);
    // Keep the whole fan visible even in a very short window.
    const baseY = Math.max(layout.height + 9, anchorY);
    const left = layout.center - layout.width / 2, top = baseY - layout.height;
    this.fan.style.left = `${left}px`; this.fan.style.top = `${top}px`;
    this.fan.style.width = `${layout.width}px`; this.fan.style.height = `${layout.height + 14}px`;
    this.fan.style.setProperty('--lnp-bubble-width', `${layout.bubbleWidth}px`);
    const svg = this.fan.createSvg('svg', { cls: 'lnp-stems' }); svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', `${layout.width}`); svg.setAttribute('height', `${layout.height + 18}`);
    for (const [i, point] of layout.points.entries()) {
      const bubble = bubbles[i]; if (!bubble) continue;
      bubble.style.left = `${layout.width / 2 + point.x - layout.bubbleWidth / 2}px`;
      bubble.style.top = `${layout.height + point.y - 20}px`;
      bubble.style.setProperty('--lnp-order', `${i}`);
      const path = svg.createSvg('path');
      const startX = anchorX - left, startY = anchorY - top;
      path.setAttribute('d', `M ${startX} ${startY} Q ${startX} ${layout.height + point.y + 38} ${layout.width / 2 + point.x} ${layout.height + point.y + 14}`);
      svg.append(path);
    }
    this.fan.prepend(svg);
    this.fanBox = { left: Math.min(left, this.x), right: Math.max(left + layout.width, this.x + this.actorWidth()), top, bottom: this.floor + 8 };
  }
  private focusFirst(): void { this.fan.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true }); }
  private onMenuKey(event: KeyboardEvent): void {
    const buttons = Array.from(this.fan.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const index = buttons.findIndex(button => button === this.doc.activeElement);
    if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); this.pinned = true;
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    } else if (event.key === 'Tab') this.close(false);
  }
  private restoreFocus(): void { if (this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true }); this.previousFocus = null; }
  close(restore = false): void {
    this.cancelClose(); this.clearHover(); this.opened = false; this.pinned = false;
    this.fan.hidden = true; this.actor.setAttribute('aria-expanded', 'false');
    this.lastPaint = 0;
    if (restore) this.restoreFocus();
    this.ignoreHoverUntil = this.win.performance.now() + 400;
  }
  recall(anchor?: HTMLElement): void {
    this.releaseGrab(); this.fall = null; this.height = 0; this.landingRemaining = 0;
    this.close(false); this.measure();
    this.x = clamp(anchor ? anchor.getBoundingClientRect().left - this.actorWidth() / 2 : this.win.innerWidth * .45, this.left, this.right);
    this.brain = { action: 'wave', remaining: 3, direction: 1, destination: this.x }; this.place(); this.lastPaint = 0;
  }
  refresh(rebuild = false): void {
    this.measure(); this.place();
    if (this.opened) {
      if (rebuild) { const pinned = this.pinned; this.open(false); this.pinned = pinned; }
      else this.layoutFan();
    }
  }
  destroy(): void {
    this.releaseGrab();
    this.destroyed = true; this.win.cancelAnimationFrame(this.frame); this.clearHover(); this.cancelClose();
    for (const dispose of this.disposers) dispose(); this.root.remove();
  }
}
