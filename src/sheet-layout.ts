import type { Action } from './core';
import { lookDirection, type SpritePose } from './sprite.ts';

export const SHEET_VERSION = 1;
export const SHEET_COLUMNS = 8;
export const SHEET_ROWS = 8;
export const SHEET_WIDTH = 128;
export const SHEET_HEIGHT = 192;
export const USED_FRAMES = 60;
export interface Clip { start: number; frames: number; fps: number; loop: boolean; directional?: boolean }
export const CLIPS: Record<Action, Clip> = {
  walk: { start: 0, frames: 8, fps: 8, loop: true },
  idle: { start: 8, frames: 4, fps: 1.5, loop: true },
  look: { start: 12, frames: 4, fps: 1, loop: true, directional: true },
  sit: { start: 16, frames: 2, fps: 2, loop: false },
  stretch: { start: 18, frames: 6, fps: 2, loop: true },
  wave: { start: 24, frames: 8, fps: 8 / 2.8, loop: true },
  inspect: { start: 32, frames: 4, fps: 1.5, loop: true },
  sleep: { start: 36, frames: 4, fps: 1, loop: true },
  watch: { start: 40, frames: 4, fps: 0, loop: false, directional: true },
  offer: { start: 44, frames: 4, fps: 0, loop: false, directional: true },
  held: { start: 48, frames: 4, fps: 6, loop: true },
  fall: { start: 52, frames: 4, fps: 6, loop: true },
  land: { start: 56, frames: 4, fps: 4, loop: false }
};
export function cellName(index: number): string { return `${String.fromCharCode(65 + index % 8)}${Math.floor(index / 8) + 1}`; }
export function sheetFrame(pose: SpritePose): { index: number; mirror: boolean } {
  const clip = CLIPS[pose.action], time = Math.max(0, pose.actionTime ?? pose.time);
  let frame = 0;
  if (clip.directional) {
    const look = pose.action === 'look' ? lookDirection(Math.sin(time * 1.4), Math.sin(time * .9) < -.25 ? -1 : 0, pose.direction)
      : lookDirection(pose.gazeX, pose.gazeY, pose.direction);
    frame = ['left', 'right', 'up-left', 'up-right'].indexOf(look);
  } else if (!pose.reduced) {
    frame = clip.loop ? Math.floor(time * clip.fps) % clip.frames : Math.min(clip.frames - 1, Math.floor(time * clip.fps));
  }
  return { index: clip.start + frame, mirror: pose.action === 'walk' && pose.direction < 0 };
}

/** The authored poses used by the downloadable templates. */
export function templatePose(index: number): SpritePose | null {
  if (index < 0 || index >= USED_FRAMES) return null;
  const action = (Object.keys(CLIPS) as Action[]).find(id => index >= CLIPS[id].start && index < CLIPS[id].start + CLIPS[id].frames)!;
  const clip = CLIPS[action], frame = index - clip.start;
  let time = frame / clip.fps, gazeX = 1, gazeY = 0, drawnAction = action;
  if (clip.directional) {
    gazeX = frame % 2 ? 1 : -1; gazeY = frame > 1 ? -1 : 0;
    if (action === 'look') drawnAction = 'watch';
    time = .8;
  } else if (action === 'walk') time = frame / 8 * 6 / 7;
  else if (action === 'idle') time = [.2, 2.3, 5.2, 2.8][frame];
  else if (action === 'wave') time = [0, .27, .48, .8, 1.1, 1.42, 2.37, 2.65][frame];
  else if (action === 'stretch') time = [0, .45, 1, 1.55, 2.35, 2.9][frame];
  else if (action === 'land') time = [0, .13, .3, .8][frame];
  return { action: drawnAction, time, actionTime: time, direction: 1, gazeX, gazeY, reduced: false };
}
