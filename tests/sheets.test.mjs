import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inflateSync } from 'node:zlib';
import { CLIPS, sheetFrame, cellName, templatePose } from '../src/sheet-layout.ts';
import { sheetScale, pngDimensions, prepareSheet } from '../src/sheet-pixels.ts';
import { normalizeSettings } from '../src/core.ts';

const folder = new URL('../docs/custom-npc/', import.meta.url);
function readPNG(name) {
  const png = fs.readFileSync(new URL(name, folder));
  const buffer = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength), dimensions = pngDimensions(buffer), chunks = [];
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at), type = png.toString('ascii', at + 4, at + 8);
    if (type === 'IDAT') chunks.push(png.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const rows = inflateSync(Buffer.concat(chunks)), pixels = new Uint8ClampedArray(dimensions.width * dimensions.height * 4);
  for (let y = 0; y < dimensions.height; y++) {
    const start = y * (dimensions.width * 4 + 1); assert.equal(rows[start], 0);
    pixels.set(rows.subarray(start + 1, start + 1 + dimensions.width * 4), y * dimensions.width * 4);
  }
  return { ...dimensions, pixels, buffer };
}
function fixture(background = [0, 0, 0, 0]) {
  const pixels = new Uint8ClampedArray(128 * 192 * 4);
  for (let at = 0; at < pixels.length; at += 4) pixels.set(background, at);
  for (let frame = 0; frame < 60; frame++) {
    const left = frame % 8 * 16, top = Math.floor(frame / 8) * 24;
    for (let y = 5; y < 20; y++) for (let x = 4; x < 12; x++) pixels.set([35 + frame, 90, 110, 255], ((top + y) * 128 + left + x) * 4);
  }
  return pixels;
}

test('the sheet covers all actions once, with four explicit head directions and no reserved frames', () => {
  const used = Object.values(CLIPS).flatMap(clip => Array.from({ length: clip.frames }, (_, i) => clip.start + i));
  assert.equal(used.length, 60); assert.equal(new Set(used).size, 60); assert.ok(used.every(index => index < 60));
  const base = { action: 'watch', time: 2, actionTime: 2, direction: 1, reduced: false };
  for (const [gazeX, gazeY, offset] of [[-1, 0, 0], [1, 0, 1], [-1, -1, 2], [1, -1, 3]]) {
    assert.equal(sheetFrame({ ...base, gazeX, gazeY }).index, 40 + offset);
    assert.equal(sheetFrame({ ...base, action: 'offer', gazeX, gazeY }).index, 44 + offset);
  }
  assert.equal(sheetFrame({ ...base, action: 'walk', direction: -1 }).mirror, true);
  assert.equal(sheetFrame({ ...base, action: 'land', time: 100, actionTime: 100 }).index, 59);
  assert.equal(sheetFrame({ ...base, action: 'wave', reduced: true }).index, 24);
  assert.equal(cellName(59), 'D8'); assert.equal(templatePose(60), null);
});

test('every shipped native and enlarged template imports with identical exact pixels and real transparency', () => {
  for (const name of ['pip', 'arden', 'nova']) {
    const native = readPNG(`${name}-native.png`), large = readPNG(`${name}-template.png`);
    const small = prepareSheet(native.pixels, native.width, native.height, 'transparent');
    const scaled = prepareSheet(large.pixels, large.width, large.height, 'auto');
    assert.deepEqual(small.pixels, native.pixels); assert.deepEqual(scaled.pixels, native.pixels);
    assert.equal(small.removedBackground, false); assert.equal(scaled.scale, 8);
    assert.ok(small.pixels.some((value, at) => at % 4 === 3 && value === 0));
  }
});

test('edge-connected magenta and white backgrounds are removed without erasing enclosed white details', () => {
  for (const background of [[255, 0, 255, 255], [255, 255, 255, 255]]) {
    const source = fixture(background), inside = (10 * 128 + 7) * 4;
    source.set([255, 255, 255, 255], inside);
    const result = prepareSheet(source, 128, 192, 'auto');
    assert.equal(result.removedBackground, true); assert.equal(result.pixels[3], 0);
    assert.deepEqual(Array.from(result.pixels.subarray(inside, inside + 4)), [255, 255, 255, 255]);
  }
  assert.equal(prepareSheet(fixture([255, 0, 255, 255]), 128, 192, 'magenta').pixels[3], 0);
  assert.throws(() => prepareSheet(fixture([255, 0, 255, 255]), 128, 192, 'transparent'), /opaque corner/);
});

test('invalid backgrounds, empty cells, malformed PNGs and excessive dimensions are rejected before activation', () => {
  const empty = fixture();
  for (let y = 24; y < 48; y++) empty.fill(0, y * 128 * 4, (y * 128 + 16) * 4);
  assert.throws(() => prepareSheet(empty, 128, 192, 'transparent'), /Frame A2 is empty/);
  const checker = fixture([255, 255, 255, 255]);
  for (let y = 0; y < 192; y++) for (let x = 0; x < 128; x++) if ((x + y) % 2) checker.set([170, 170, 170, 255], (y * 128 + x) * 4);
  assert.throws(() => prepareSheet(checker, 128, 192, 'auto'), /painted checkerboard/);
  assert.throws(() => pngDimensions(new ArrayBuffer(33)), /Choose a PNG/);
  for (const [width, height] of [[1024, 1024], [1025, 1536], [128, 193], [2176, 3264], [0, 0]]) assert.throws(() => sheetScale(width, height), /8 × 8 sheet/);
  assert.equal(sheetScale(2048, 3072), 16);
  assert.throws(() => prepareSheet(new Uint8ClampedArray(4), 128, 192, 'auto'), /incomplete/);
});

test('custom settings migrate safely and preserve the existing commands, character and size', () => {
  const original = { count: 3, character: 'arden', scale: 2, slots: [{ command: 'plugin:mine', label: 'Mine' }] };
  const migrated = normalizeSettings(original);
  assert.equal(migrated.character, 'arden'); assert.equal(migrated.scale, 2); assert.deepEqual(migrated.slots[0], original.slots[0]);
  assert.equal(migrated.customPath, ''); assert.equal(migrated.customBackground, 'auto');
  assert.equal(normalizeSettings({ character: 'custom' }).character, 'pip');
  const custom = normalizeSettings({ character: 'custom', customPath: 'NPCs/Rue.png', customName: 'x'.repeat(60), customBackground: 'invalid' });
  assert.equal(custom.character, 'custom'); assert.equal(custom.customName.length, 40); assert.equal(custom.customBackground, 'auto');
});
