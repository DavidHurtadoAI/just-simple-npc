import type { Action, Character } from './core';

export interface SpritePose { action: Action; character?: Character; time: number; actionTime?: number; direction: number; gazeX: number; gazeY: number; reduced: boolean }
export type Look = 'left' | 'right' | 'up-left' | 'up-right';
type Grid = readonly string[];
type Palette = Record<string, string>;

// Each symbol is one opaque pixel. Related shades form clusters rather than noise.
export const PALETTES: Record<Character, Palette> = {
  pip: { o: '#363443', h: '#b86d53', H: '#edb37b', r: '#79464a', s: '#f4c6a0', S: '#d89179', l: '#ffe2b5', e: '#3d3741', m: '#76ad97', M: '#b4d4a6', d: '#46786f', t: '#53586e', T: '#858298', g: '#e4b16a', G: '#995f4e', b: '#333747', p: '#754b5a', P: '#bc7c83', c: '#ecd5a4' },
  arden: { o: '#303744', m: '#a6bac5', M: '#eceddb', d: '#667e97', s: '#a6bac5', S: '#667e97', l: '#eceddb', e: '#ead39a', t: '#586679', T: '#a6bac5', g: '#d9ad6b', G: '#916647', b: '#303744', p: '#734965', P: '#b8768d', r: '#493b54', c: '#cbd5d2' },
  nova: { o: '#293e49', m: '#b6d7c9', M: '#eff0d8', d: '#6eaaa1', s: '#e7bb7d', S: '#b17b54', l: '#ffe0a2', e: '#b2f0d4', t: '#457374', T: '#91c4b5', g: '#e7bb7d', G: '#b17b54', b: '#293e49', p: '#457374', P: '#91c4b5', r: '#355a60', c: '#f2d29b' }
};

// Heads are authored independently: upward views lift the eyes and expose the chin.
export const HEADS: Record<Character, { side: Grid; up: Grid }> = {
  pip: {
    side: ['..oooo....', '.ohHHho...', 'ohhhhrr...', 'ohllssro..', 'oSlesesso.', 'oSllssso..', '.ossssso..', '..oSSSo...', '...ooo....', '....SS....'],
    up: ['..oooo....', '.ohHHho...', 'ohlesesso.', 'oSllsssso.', 'oSllssso..', '.ossssso..', '..olllo...', '...oSSo...', '...ooo....', '....SS....']
  },
  arden: {
    side: ['..oooo....', '.oMMmmo...', 'oMMcmmmo..', 'oMcmmmmo..', 'oMdddddo..', 'omoeoeoo..', 'omcmmmmo..', '.omddmo...', '..oooo....', '....dd....'],
    up: ['..oooo....', '.oMMmmo...', 'oMoeoeoo..', 'oMcmmmmo..', 'oMMcmmmo..', '.oMMcmmo..', '..oMMmo...', '...oddo...', '...ooo....', '....dd....']
  },
  nova: {
    side: ['....gc....', '...oooo...', '.ooMMmmoo.', 'oMmrrrrmmo', 'omreereemo', 'omreereemo', 'omrrccrrmo', '.odmmmmdo.', '..oooooo..', '....gg....'],
    up: ['....gc....', '...oooo...', '.ooeereoo.', 'oMmeereemo', 'omrrrrrrmo', 'omrrccrrmo', 'omMMMMMMmo', '.odmmmmdo.', '..oooooo..', '....gg....']
  }
};
const BODIES: Record<Character, Grid> = {
  pip: ['..SS..', '.gggg.', 'oMMmdo', 'oMgmdo', 'ommGdo', 'ommgdo', '.oddo.'],
  arden: ['..dd..', '.MMcm.', 'oMcmdo', 'omcmdo', 'omdmdo', 'ommmdo', '.oggo.'],
  nova: ['..gg..', '.MMmm.', 'oMmddo', 'omcedo', 'omdddo', 'ommmdo', '.oggo.']
};
const ARM: Grid = ['om.', 'om.', 'os.', '.S.', '.o.'];
const WAVE_IN: Grid = ['..o.', '.ols', '.oS.', '.mo.', '.mo.', 'om..', 'mo..'];
const WAVE_OUT: Grid = ['...o', '..ls', '.oSo', '.mo.', '.mo.', 'om..', 'mo..'];
const LIFT: Grid = ['..ss', '.oS.', '.mo.', 'om..', 'mo..'];
const STRETCH: Grid = ['.s..', '.So.', '.mo.', '.mo.', '..mo', '..mo', '....'];
const CAPE: Grid = ['..rrr...', '.rPppr..', '.rPpppr.', 'rPPpppr.', 'rPppppr.', 'rppppr..', 'rppppr..', 'rrrrrr..'];

export function lookDirection(x: number, y: number, fallback = 1): Look {
  const right = Math.abs(x) < .12 ? fallback >= 0 : x > 0;
  return y < -.32 ? right ? 'up-right' : 'up-left' : right ? 'right' : 'left';
}
export type WavePhase = 'rest' | 'lift' | 'in' | 'out' | 'lower';
export function wavePhase(seconds: number): WavePhase {
  const t = ((seconds % 2.8) + 2.8) % 2.8;
  if (t < .16 || t >= 2.55) return 'rest';
  if (t < .42) return 'lift';
  if (t >= 2.28) return 'lower';
  return Math.floor((t - .42) / .31) % 2 ? 'out' : 'in';
}

/** Original sprites, painted cell by cell on a literal 16 × 24 grid. */
export function drawSprite(ctx: CanvasRenderingContext2D, pose: SpritePose): void {
  ctx.clearRect(0, 0, 16, 24); ctx.imageSmoothingEnabled = false;
  const character = pose.character ?? 'pip', palette = PALETTES[character];
  const time = pose.reduced ? 1 : pose.time, local = pose.reduced ? .8 : pose.actionTime ?? time;
  const landing = pose.action === 'land', airborne = pose.action === 'held' || pose.action === 'fall';
  const sit = pose.action === 'sit' || pose.action === 'sleep' || landing, inspect = pose.action === 'inspect';
  const walk = pose.action === 'walk', step = walk ? Math.floor(time * 7) % 6 : 0;
  const bob = sit ? 3 + (landing && !pose.reduced && local < .16 ? 1 : 0) : inspect ? 2 : walk ? [0, -1, -1, 0, -1, -1][step] : 0;
  const watching = pose.action === 'watch' || pose.action === 'offer';
  const look = watching ? lookDirection(pose.gazeX, pose.gazeY, pose.direction) : pose.action === 'look'
    ? lookDirection(Math.sin(local * 1.4), Math.sin(local * .9) < -.25 ? -1 : 0, pose.direction)
    : pose.direction < 0 && walk ? 'left' : 'right';
  const blink = pose.action === 'sleep' || (!airborne && !pose.reduced && time % 5.3 > 5.13);
  const paint = (grid: Grid, x: number, y: number, mirror = false, eyes = false) => {
    for (let row = 0; row < grid.length; row++) for (let col = 0; col < grid[row].length; col++) {
      let pixel = grid[row][col]; if (pixel === '.') continue;
      if (eyes && blink && pixel === 'e') pixel = character === 'pip' ? 'S' : character === 'nova' ? 'r' : 'o';
      ctx.fillStyle = palette[pixel]; ctx.fillRect(x + (mirror ? grid[row].length - 1 - col : col), y + row, 1, 1);
    }
  };
  if (character === 'arden') paint(CAPE, 2 + (walk && step > 2 ? -1 : 0), 12 + bob);
  if (sit) {
    paint(['.ooooooo.', 'otTTtttto', 'oooo.oooo'], 4, 19);
    paint(['oooo', 'oTbo', 'oooo'], 2, 20); paint(['oooo', 'oTbo', 'oooo'], 11, 20);
  } else if (airborne) {
    const kick = pose.reduced ? 0 : Math.floor(local * 4) % 2;
    paint(['oto', 'oTo', 'obo', 'ooo'], 5 + kick, 18);
    paint(['oto', 'oto', 'obo', 'ooo'], 9 - kick, 18);
    paint(['Tboo'], 4 + kick, 21); paint(['oobT'], 9 - kick, 21);
  } else {
    const stride = walk ? [0, -1, -1, 0, 1, 1][step] : 0;
    paint(['oto', 'oTo', 'oto', 'obo', 'ooo'], 5 + stride, 18);
    paint(['oto', 'oto', 'oto', 'obo', 'ooo'], 9 - stride, 18);
    paint(['Tboo'], 4 + stride, 22); paint(['oobT'], 9 - stride, 22);
  }
  paint(BODIES[character], 5, 11 + bob);
  const swing = walk ? [0, 0, 1, 0, -1, -1][step] : 0;
  const wave = wavePhase(local);
  if (airborne) {
    const fidget = pose.reduced ? 0 : Math.floor(local * 5) % 2;
    paint(fidget ? WAVE_OUT : WAVE_IN, 1, 7 - fidget, true);
    paint(fidget ? WAVE_IN : WAVE_OUT, 11, 6 + fidget);
  } else if (pose.action === 'stretch' && local % 3.2 > .35 && local % 3.2 < 2.6) {
    paint(STRETCH, 1, 8 + bob); paint(STRETCH, 11, 8 + bob, true);
  } else {
    paint(ARM, 3, 13 + bob + swing);
    if (pose.action === 'wave' && wave !== 'rest') paint(wave === 'in' ? WAVE_IN : wave === 'out' ? WAVE_OUT : LIFT, 11, (wave === 'lift' || wave === 'lower' ? 10 : 7) + bob);
    else if (inspect) paint(['.mo', '.mo', 'sSo', 'oo.'], 11, 16);
    else paint(ARM, 10, 13 + bob - swing, true);
  }
  if (character === 'pip') paint(['ooo', 'gGo', 'Ggo', 'ooo'], 10, 16 + bob);
  const up = look.startsWith('up'), left = look.endsWith('left');
  const headX = 3 + (inspect ? 1 : pose.action === 'wave' ? -1 : 0);
  // The head and torso share their neck row: only one visible pixel of neck.
  paint(HEADS[character][up ? 'up' : 'side'], headX, 2 + bob, left, true);
  if (pose.action === 'sleep' && !pose.reduced) paint(['ggg', '.g.', 'ggg'], 13, 1 + Math.floor(local * 1.2) % 2);
}
