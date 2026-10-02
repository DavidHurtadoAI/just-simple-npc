import type { BackgroundMode } from './sheet-pixels';
export type Action = 'walk' | 'idle' | 'look' | 'sit' | 'stretch' | 'wave' | 'inspect' | 'sleep' | 'watch' | 'offer' | 'held' | 'fall' | 'land';
export type Character = 'pip' | 'arden' | 'nova';
export const CHARACTERS: { id: Character; name: string; description: string }[] = [
  { id: 'pip', name: 'Pip', description: 'Copper hair, a moss sweater and a little satchel.' },
  { id: 'arden', name: 'Arden', description: 'A gentle knight in silver armor with a plum cape.' },
  { id: 'nova', name: 'Nova', description: 'A curious little robot with a luminous face and warm brass joints.' }
];
export const SIZES = [{ scale: 1, name: 'Small' }, { scale: 1.5, name: 'Medium' }, { scale: 2, name: 'Large' }] as const;

export const ACTIONS: { id: Action; name: string; description: string }[] = [
  { id: 'walk', name: 'Wander', description: 'Walk in either direction, with little pauses and a changing destination.' },
  { id: 'idle', name: 'Rest', description: 'Stand still, breathe softly and blink.' },
  { id: 'look', name: 'Look around', description: 'Turn the head and glance from side to side.' },
  { id: 'sit', name: 'Sit down', description: 'Take a short break on the edge of the status bar.' },
  { id: 'stretch', name: 'Stretch', description: 'Lift both arms, hold the stretch, then relax.' },
  { id: 'wave', name: 'Wave', description: 'Raise one arm, show an open hand, wave it from side to side, then lower it.' },
  { id: 'inspect', name: 'Investigate', description: 'Lean down to examine something by the feet.' },
  { id: 'sleep', name: 'Doze', description: 'Sit, close the eyes and drift off for a moment.' },
  { id: 'watch', name: 'Follow the mouse', description: 'Stop and turn the head toward the pointer: left, right, up-left or up-right.' },
  { id: 'offer', name: 'Offer commands', description: 'Open the command fan on hover; stay still while you choose.' },
  { id: 'held', name: 'Picked up', description: 'Raise both hands and fidget a little when lifted off the floor.' },
  { id: 'fall', name: 'Fall gently', description: 'Accelerate toward the floor after being released, with a limited falling speed.' },
  { id: 'land', name: 'Catch a breath', description: 'Land softly, sit for two seconds, then carry on.' }
];

export interface Slot { command: string; label: string }
export interface Settings { count: number; character: Character | 'custom'; customPath: string; customName: string; customBackground: BackgroundMode; scale: number; speed: number; proximity: number; hoverDelay: number; slots: Slot[] }

export const DEFAULTS: Settings = {
  count: 5, character: 'pip', customPath: '', customName: 'My companion', customBackground: 'auto', scale: 1.5, speed: 24, proximity: 150, hoverDelay: 180,
  slots: [
    { command: 'switcher:open', label: 'Quick switcher' },
    { command: 'global-search:open', label: 'Search' },
    { command: 'command-palette:open', label: 'Commands' },
    { command: 'app:toggle-left-sidebar', label: 'Left sidebar' },
    { command: 'app:toggle-right-sidebar', label: 'Right sidebar' },
    { command: 'app:open-settings', label: 'Settings' }
  ]
};

export function clamp(n: number, min: number, max: number): number { return Math.min(max, Math.max(min, n)); }
function numeric(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}
export function normalizeSettings(raw: unknown): Settings {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings>;
  const scale = numeric(data.scale, DEFAULTS.scale, 1, 2);
  return {
    count: Math.round(numeric(data.count, DEFAULTS.count, 1, 6)),
    character: data.character === 'custom' && typeof data.customPath === 'string' && data.customPath.trim() ? 'custom'
      : CHARACTERS.some(character => character.id === data.character) ? data.character! : DEFAULTS.character,
    customPath: typeof data.customPath === 'string' ? data.customPath.trim().slice(0, 1024) : '',
    customName: typeof data.customName === 'string' && data.customName.trim() ? data.customName.trim().slice(0, 40) : DEFAULTS.customName,
    customBackground: ['transparent', 'auto', 'magenta'].includes(data.customBackground ?? '') ? data.customBackground! : DEFAULTS.customBackground,
    scale: SIZES.reduce((best, size) => Math.abs(size.scale - scale) < Math.abs(best - scale) ? size.scale : best, 2 as number),
    speed: numeric(data.speed, DEFAULTS.speed, 8, 48),
    proximity: numeric(data.proximity, DEFAULTS.proximity, 80, 240),
    hoverDelay: numeric(data.hoverDelay, DEFAULTS.hoverDelay, 0, 800),
    slots: Array.from({ length: 6 }, (_, i) => {
      const slot = Array.isArray(data.slots) ? data.slots[i] : DEFAULTS.slots[i];
      return { command: typeof slot?.command === 'string' ? slot.command : '', label: typeof slot?.label === 'string' ? slot.label.slice(0, 100) : '' };
    })
  };
}

export function abbreviate(label: string, limit = 23): string {
  const letters = Array.from(label.trim());
  return letters.length > limit ? letters.slice(0, limit - 1).join('').trimEnd() + '…' : label.trim();
}

export interface BubblePosition { x: number; y: number }
export interface FanLayout { center: number; width: number; height: number; bubbleWidth: number; points: BubblePosition[] }
export function fanLayout(count: number, anchorX: number, viewport: number): FanLayout {
  const n = clamp(Math.round(count), 1, 6);
  const compact = viewport < 490;
  const bubbleWidth = compact ? Math.max(86, Math.min(124, (viewport - 40) / 2)) : 142;
  const patterns: Record<number, [number, number][]> = {
    1: [[0, -85]],
    2: [[-78, -80], [78, -80]],
    3: [[-150, -59], [0, -120], [150, -59]],
    4: [[-156, -60], [-80, -122], [80, -122], [156, -60]],
    5: [[-162, -58], [-119, -118], [0, -170], [119, -118], [162, -58]],
    6: [[-163, -58], [-141, -115], [-78, -174], [78, -174], [141, -115], [163, -58]]
  };
  let points = patterns[n].map(([x, y]) => ({ x, y }));
  if (compact && n > 2) {
    const offset = bubbleWidth / 2 + 7;
    points = Array.from({ length: n }, (_, i) => ({ x: n % 2 && i === n - 1 ? 0 : (i % 2 ? offset : -offset), y: -62 - Math.floor(i / 2) * 52 }));
  } else if (compact) {
    points = points.map(point => ({ ...point, x: point.x === 0 ? 0 : Math.sign(point.x) * (bubbleWidth / 2 + 7) }));
  }
  const width = Math.max(...points.map(point => Math.abs(point.x))) * 2 + bubbleWidth + 20;
  const height = Math.abs(Math.min(...points.map(point => point.y))) + 34;
  return { center: clamp(anchorX, width / 2 + 8, viewport - width / 2 - 8), width, height, bubbleWidth, points };
}

export interface Brain { action: Action; remaining: number; destination: number; direction: number }
export function nextAction(x: number, left: number, right: number, random = Math.random): Brain {
  const choices: Action[] = ['walk', 'walk', 'walk', 'idle', 'look', 'sit', 'stretch', 'wave', 'inspect', 'sleep'];
  const action = choices[Math.floor(random() * choices.length)] ?? 'idle';
  const destination = left + random() * Math.max(0, right - left);
  const duration = action === 'walk' ? 5 + random() * 12 : action === 'sleep' ? 7 + random() * 7 : 2.5 + random() * 5;
  return { action, remaining: duration, destination, direction: destination >= x ? 1 : -1 };
}
