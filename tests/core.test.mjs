import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, normalizeSettings, abbreviate, fanLayout, nextAction, ACTIONS } from '../src/core.ts';
import { drawSprite, HEADS, PALETTES, lookDirection, wavePhase } from '../src/sprite.ts';
import { pixelMetrics, snapToPixel } from '../src/pixel-grid.ts';

test('settings recover safely from old, partial or corrupt saved data', () => {
  assert.deepEqual(normalizeSettings(null), DEFAULTS);
  const recovered = normalizeSettings({ count: 90, scale: NaN, speed: -4, hoverDelay: Infinity, slots: [{ command: 'a', label: 'x' }, null] });
  assert.equal(recovered.count, 6); assert.equal(recovered.scale, 2); assert.equal(recovered.speed, 8);
  assert.equal(recovered.hoverDelay, 180); assert.equal(recovered.slots.length, 6);
  assert.deepEqual(recovered.slots[1], { command: '', label: '' });
  assert.notEqual(normalizeSettings(null).slots, DEFAULTS.slots);
});

test('the three size choices and characters migrate without losing preferences', () => {
  const slots = [{ command: 'my-plugin:command', label: 'Mine' }];
  const migrated = normalizeSettings({ scale: 2, slots });
  assert.equal(migrated.scale, 2); assert.equal(migrated.character, 'pip');
  assert.deepEqual(migrated.slots[0], slots[0]);
  for (const scale of [1, 1.5, 2]) for (const character of ['pip', 'arden', 'nova']) {
    const settings = normalizeSettings({ scale, character });
    assert.equal(settings.scale, scale); assert.equal(settings.character, character);
  }
  assert.equal(normalizeSettings({ scale: 3 }).scale, 2);
  assert.equal(normalizeSettings({ character: 'unknown' }).character, 'pip');
});

test('fractional display scales keep every cell square and all three sizes distinct', () => {
  for (const ratio of [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3]) {
    const cells = new Set();
    for (const size of [1, 1.5, 2]) {
      const m = pixelMetrics(size, ratio); cells.add(m.physicalCell);
      assert.ok(Number.isInteger(m.physicalCell));
      assert.ok(Math.abs(m.width * ratio - 16 * m.physicalCell) < 1e-9);
      assert.ok(Math.abs(m.height * ratio - 24 * m.physicalCell) < 1e-9);
      assert.ok(Math.abs(snapToPixel(123.456, ratio) * ratio - Math.round(123.456 * ratio)) < 1e-9);
    }
    assert.equal(cells.size, 3);
  }
  assert.equal(pixelMetrics(2, 1.75).physicalCell, 5);
});

test('all actions and head poses use opaque palette colors on the native grid', () => {
  for (const character of ['pip', 'arden', 'nova']) {
    for (const rows of Object.values(HEADS[character])) for (const row of rows) assert.equal(row.length, 10);
    const palette = new Set(Object.values(PALETTES[character]));
    let colors = new Set();
    for (const action of ACTIONS) for (const time of [0, .3, .6, .95, 1.3, 2, 2.4, 5.2]) for (const gazeX of [-1, 1]) for (const gazeY of [0, -1]) {
      const ctx = { clearRect() {}, fillStyle: '', imageSmoothingEnabled: true, fillRect(x, y, w, h) {
        assert.ok(Number.isInteger(x) && Number.isInteger(y));
        assert.ok(x >= 0 && x < 16 && y >= 0 && y < 24, `${character}/${action.id}/${time}: ${x},${y}`);
        assert.equal(w, 1); assert.equal(h, 1);
        assert.match(this.fillStyle, /^#[a-f0-9]{6}$/i); assert.ok(palette.has(this.fillStyle)); colors.add(this.fillStyle);
      }};
      drawSprite(ctx, { character, action: action.id, time, actionTime: time, direction: gazeX, gazeX, gazeY, reduced: false });
    }
    assert.ok(colors.size >= 10, `${character}: color richness`);
  }
});

test('head tracking resolves all four directions and holds its side directly above', () => {
  assert.equal(lookDirection(-1, 0), 'left'); assert.equal(lookDirection(1, 0), 'right');
  assert.equal(lookDirection(-1, -1), 'up-left'); assert.equal(lookDirection(1, -1), 'up-right');
  assert.equal(lookDirection(0, -1, -1), 'up-left'); assert.equal(lookDirection(0, -1, 1), 'up-right');
  assert.equal(lookDirection(.01, 0, -1), 'left');
});

test('a full greeting includes preparation, lifting, two hand poses and recovery', () => {
  const phases = new Set(Array.from({ length: 28 }, (_, i) => wavePhase(i / 10)));
  assert.deepEqual(phases, new Set(['rest', 'lift', 'in', 'out', 'lower']));
  assert.equal(wavePhase(0), 'rest'); assert.equal(wavePhase(2.79), 'rest');
});

test('abbreviation preserves unicode and short labels', () => {
  assert.equal(abbreviate(' Search '), 'Search');
  assert.equal(abbreviate('🌲'.repeat(30)), '🌲'.repeat(22) + '…');
  assert.equal(Array.from(abbreviate('An enormously long command name')).length, 23);
});

test('one through six bubbles remain visible and do not overlap at screen edges', () => {
  for (const viewport of [300, 320, 390, 480, 490, 700, 1200, 1920]) {
    for (let count = 1; count <= 6; count++) {
      for (const anchor of [20, viewport / 2, viewport - 20]) {
        const layout = fanLayout(count, anchor, viewport);
        assert.equal(layout.points.length, count);
        for (const p of layout.points) {
          assert.ok(layout.center + p.x - layout.bubbleWidth / 2 >= 0, `Left edge: ${viewport}/${count}`);
          assert.ok(layout.center + p.x + layout.bubbleWidth / 2 <= viewport, `Right edge: ${viewport}/${count}`);
        }
        for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) {
          const a = layout.points[i], b = layout.points[j];
          assert.ok(Math.abs(a.x - b.x) >= layout.bubbleWidth || Math.abs(a.y - b.y) >= 46, `Bubble overlap: ${viewport}/${count}/${i}/${j}`);
        }
      }
    }
  }
});

test('autonomous actions always use bounded destinations and finite durations', () => {
  for (let n = 0; n < 100; n++) {
    const action = nextAction(200, 18, 820, () => n / 100);
    assert.ok(action.destination >= 18 && action.destination <= 820);
    assert.ok(action.remaining >= 2.5 && action.remaining <= 17);
    assert.ok(ACTIONS.some(item => item.id === action.action));
    assert.ok(!['watch', 'offer'].includes(action.action));
  }
});
