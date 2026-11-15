import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TapSound } from '../src/tap-sound.ts';

function audioHarness(rolls) {
  const clips = [], played = [], contexts = [];
  class AudioContext {
    sampleRate = 48000;
    state = 'suspended';
    destination = {};
    constructor() { contexts.push(this); }
    createBuffer(channels, length, rate) {
      assert.equal(channels, 1);
      const samples = new Float32Array(length);
      const clip = { duration: length / rate, getChannelData: () => samples };
      clips.push(clip);
      return clip;
    }
    createBufferSource() {
      return {
        connect() {},
        start() { played.push(this.buffer); },
        disconnect() {},
      };
    }
    async resume() { this.state = 'running'; }
    async close() { this.state = 'closed'; }
  }
  const sound = new TapSound({ AudioContext, Math: { random: () => rolls.shift() } });
  return { sound, clips, played, contexts };
}

test('each tap starts one short, quiet sound picked from three distinct clips', () => {
  const { sound, clips, played, contexts } = audioHarness([.95, .02, .48]);
  assert.equal(contexts.length, 0);
  for (let index = 0; index < 3; index++) sound.play();
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].state, 'running');
  assert.equal(clips.length, 3);
  assert.deepEqual(played, [clips[2], clips[0], clips[1]]);
  assert.equal(new Set(clips.map(clip => clip.duration)).size, 3);
  for (const clip of clips) {
    const peak = clip.getChannelData(0).reduce((max, value) => Math.max(max, Math.abs(value)), 0);
    assert.ok(clip.duration < .034 && peak > .03 && peak < .11);
  }
  sound.close();
});

test('closing the pointer releases audio and reopening starts a fresh context', () => {
  const { sound, clips, played, contexts } = audioHarness([0, .95]);
  sound.play();
  sound.close();
  sound.close();
  assert.equal(contexts[0].state, 'closed');
  sound.play();
  assert.equal(contexts.length, 2);
  assert.equal(contexts[1].state, 'running');
  assert.deepEqual(played, [clips[0], clips[5]]);
  sound.close();
});
