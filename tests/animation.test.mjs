import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AnimationLoop, PreviewAnimator } from '../src/animation.ts';

class Events extends EventTarget {
  listeners = new Map();
  addEventListener(name, fn, capture) { super.addEventListener(name, fn, capture); this.listeners.set(fn, name); }
  removeEventListener(name, fn, capture) { super.removeEventListener(name, fn, capture); this.listeners.delete(fn); }
  emit(name) { this.dispatchEvent(new Event(name)); }
}
class Visibility {
  targets = new Set();
  constructor(callback) { this.callback = callback; }
  observe(target) { this.targets.add(target); }
  unobserve(target) { this.targets.delete(target); }
  disconnect() { this.targets.clear(); }
  show(target, visible) { this.callback([{ target, isIntersecting: visible }]); }
}
class Clock extends Events {
  time = 1000; nextId = 1; jobs = new Map();
  performance = { now: () => this.time };
  motion = Object.assign(new Events(), { matches: false });
  constructor(refreshRate = 60) { super(); this.framePeriod = 1000 / refreshRate; }
  matchMedia() { return this.motion; }
  IntersectionObserver = Visibility;
  ResizeObserver = Visibility;
  requestAnimationFrame(callback) { return this.job(time => callback(time), Math.ceil((this.time + .001) / this.framePeriod) * this.framePeriod); }
  cancelAnimationFrame(id) { this.jobs.delete(id); }
  setTimeout(callback, delay = 0) { return this.job(() => callback(), this.time + delay); }
  clearTimeout(id) { this.jobs.delete(id); }
  job(callback, at) { const id = this.nextId++; this.jobs.set(id, { callback, at }); return id; }
  advance(milliseconds) {
    const end = this.time + milliseconds; let budget = 10000;
    while (this.jobs.size) {
      const [id, job] = [...this.jobs].sort((a, b) => a[1].at - b[1].at)[0];
      if (job.at > end) break;
      assert.ok(--budget > 0, 'clock must not spin');
      this.time = Math.max(this.time, job.at); this.jobs.delete(id); job.callback(this.time);
    }
    this.time = end;
  }
}
function gallery() {
  const win = new Clock(), doc = Object.assign(new Events(), { defaultView: win, hidden: false, focused: true, hasFocus() { return this.focused; } });
  let emptied = 0;
  const animator = new PreviewAnimator(doc, () => emptied++);
  return { win, doc, animator, emptied: () => emptied };
}

test('clock wakes once, maintains 30 Hz on 60 Hz displays, and leaves no work after cancellation', () => {
  const win = new Clock(); let ticks = 0;
  const loop = new AnimationLoop(win, time => { ticks++; loop.schedule(time, 1000 / 30); });
  loop.wake(); loop.wake(); assert.equal(win.jobs.size, 1);
  win.advance(10000);
  assert.ok(ticks >= 299 && ticks <= 302, `observed ${ticks} ticks`);
  loop.cancel(); assert.equal(win.jobs.size, 0); assert.equal(loop.pending, false);
  win.advance(10000); assert.ok(ticks <= 302);
});

test('movement and idle deadlines keep their rates across 30, 60, 120 and 144 Hz displays', () => {
  for (const refreshRate of [30, 60, 120, 144]) for (const interval of [1000 / 30, 80, 100]) {
    const win = new Clock(refreshRate); let ticks = 0;
    const loop = new AnimationLoop(win, time => { ticks++; loop.schedule(time, interval); });
    loop.wake(); win.advance(10000);
    const expected = 10000 / interval;
    assert.ok(Math.abs(ticks - expected) <= 2, `${refreshRate} Hz / ${interval} ms: ${ticks}`);
    loop.cancel(); assert.equal(win.jobs.size, 0);
  }
});

test('changing clock rate and waking early never creates parallel loops', () => {
  const win = new Clock(); let interval = 80, ticks = 0;
  const loop = new AnimationLoop(win, time => { ticks++; loop.schedule(time, interval); });
  loop.wake(); win.advance(1000); const idle = ticks;
  assert.ok(idle >= 12 && idle <= 14);
  interval = 1000 / 60; loop.wake(); loop.wake(); win.advance(1000);
  assert.ok(ticks - idle >= 59 && ticks - idle <= 62);
  assert.equal(win.jobs.size, 1); loop.cancel();
});

test('a delayed frame skips missed deadlines rather than catching up in a burst', () => {
  const win = new Clock(); let ticks = 0;
  const loop = new AnimationLoop(win, time => { ticks++; loop.schedule(time, 80); });
  loop.wake(); win.advance(20); win.time += 1000; win.advance(30);
  assert.equal(ticks, 2); assert.equal(win.jobs.size, 1); loop.cancel();
});

test('gallery paints only intersecting canvases, sharing one clock across visible previews', () => {
  const { win, animator, emptied } = gallery();
  const first = { isConnected: true }, second = { isConnected: true };
  let firstPaints = 0, secondPaints = 0, removed = 0;
  const stopFirst = animator.add(first, () => firstPaints++, () => removed++);
  const stopSecond = animator.add(second, () => secondPaints++, () => removed++);
  win.advance(1000); assert.equal(firstPaints + secondPaints, 0); assert.equal(win.jobs.size, 0);
  animator.intersection.show(first, true); win.advance(1000);
  assert.ok(firstPaints >= 9 && firstPaints <= 11); assert.equal(secondPaints, 0);
  animator.intersection.show(second, true); const before = firstPaints;
  win.advance(1000); assert.equal(firstPaints - before, secondPaints); assert.equal(win.jobs.size, 1);
  animator.intersection.show(first, false); animator.intersection.show(second, false);
  assert.equal(win.jobs.size, 0);
  stopFirst(); stopSecond(); stopSecond();
  assert.equal(removed, 2); assert.equal(emptied(), 1); assert.equal(win.listeners.size, 0);
});

test('visible settings pause on blur and hide and resume without recreating their previews', () => {
  const { win, doc, animator } = gallery(); const canvas = { isConnected: true }; let paints = 0;
  const stop = animator.add(canvas, () => paints++, () => {}); animator.intersection.show(canvas, true); win.advance(1000);
  doc.focused = false; win.emit('blur'); const before = paints;
  win.advance(1000); assert.equal(paints, before); assert.equal(win.jobs.size, 0);
  doc.focused = true; win.emit('focus'); win.advance(200); assert.ok(paints > before);
  doc.hidden = true; doc.emit('visibilitychange'); const hidden = paints;
  win.advance(1000); assert.equal(paints, hidden); assert.equal(win.jobs.size, 0);
  doc.hidden = false; doc.emit('visibilitychange'); win.advance(200); assert.ok(paints > hidden);
  stop(); assert.equal(doc.listeners.size, 0); assert.equal(win.motion.listeners.size, 0);
});

test('reduced motion paints a static visible preview and cancels continuous animation', () => {
  const { win, animator } = gallery(); win.motion.matches = true;
  const canvas = { isConnected: true }, poses = [];
  const stop = animator.add(canvas, (time, align, reduced) => poses.push({ time, align, reduced }), () => {});
  animator.intersection.show(canvas, true); win.advance(10000);
  assert.deepEqual(poses, [{ time: .8, align: true, reduced: true }]); assert.equal(win.jobs.size, 0);
  win.motion.matches = false; win.motion.emit('change'); win.advance(1000); assert.ok(poses.length >= 10);
  win.motion.matches = true; win.motion.emit('change'); win.advance(1000); const staticCount = poses.length;
  win.advance(10000); assert.equal(poses.length, staticCount); assert.equal(poses.at(-1).reduced, true);
  assert.equal(win.jobs.size, 0); stop();
});

test('gallery realigns after layout changes without measuring geometry on every paint', () => {
  const { win, doc, animator } = gallery(), canvas = { isConnected: true }, alignments = [];
  const stop = animator.add(canvas, (time, align) => alignments.push(align), () => {});
  animator.intersection.show(canvas, true); win.advance(1000);
  assert.equal(alignments.filter(Boolean).length, 1);
  doc.emit('scroll'); win.advance(200); assert.equal(alignments.filter(Boolean).length, 2);
  animator.resize.callback([]); win.advance(200); assert.equal(alignments.filter(Boolean).length, 3);
  stop();
});

test('removing the final detached preview releases observers, callbacks and listeners', () => {
  const { win, doc, animator, emptied } = gallery(), canvas = { isConnected: true };
  let removed = 0, paints = 0;
  animator.add(canvas, () => paints++, () => removed++); animator.intersection.show(canvas, true);
  canvas.isConnected = false; win.advance(1000);
  assert.equal(paints, 0); assert.equal(removed, 1); assert.equal(emptied(), 1);
  assert.equal(win.jobs.size, 0); assert.equal(win.listeners.size + doc.listeners.size + win.motion.listeners.size, 0);
  assert.equal(animator.intersection.targets.size + animator.resize.targets.size, 0);
});
