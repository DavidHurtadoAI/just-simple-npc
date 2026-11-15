export const HAND_TIP = { x: 11, y: 2 };
export const HAND_CUFF = { x: 23, y: 44 };

/** Paint once at the cursor's native pixel size. */
export function paintGlove(win: Window & typeof window): HTMLCanvasElement {
  const canvas = win.createEl('canvas');
  canvas.width = 37;
  canvas.height = 47;
  const context = canvas.getContext('2d')!;
  const glove = new win.Path2D(
    'M 11 2 C 7 2 5.7 5.2 7 9 L 12 25 C 8.6 23.5 5.5 26.7 6 31 '
    + 'C 6.5 36 12 39.5 18 40.6 L 29 37.8 C 33.8 34.4 35 30.2 34.4 25 '
    + 'C 34 22 32.1 20.7 30.1 21.6 C 28.7 18 26.1 17.7 23.7 19.1 '
    + 'C 21.9 16.5 19.8 16 17.4 17.9 L 14.7 6 C 14.1 3.6 12.8 2 11 2 Z'
  );
  const cuff = new win.Path2D(
    'M 14.8 40.6 C 17.9 38.2 25.6 36.1 30.2 36.4 C 32.5 36.6 33.4 39.1 32.2 41.1 '
    + 'C 28.1 43.6 22.4 45.2 17.6 45.4 C 14.5 45.4 13.2 42.4 14.8 40.6 Z'
  );

  const palm = context.createLinearGradient(7, 5, 31, 40);
  palm.addColorStop(0, '#ffffff');
  palm.addColorStop(.42, '#f1f3f6');
  palm.addColorStop(.74, '#e0e4ea');
  palm.addColorStop(1, '#a9b2bf');
  context.fillStyle = palm;
  context.fill(glove);
  context.save();
  context.clip(glove);
  const sheen = context.createRadialGradient(16, 23, 0, 16, 23, 17);
  sheen.addColorStop(0, 'rgba(255, 255, 255, .85)');
  sheen.addColorStop(.55, 'rgba(255, 255, 255, .26)');
  sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = sheen;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.lineCap = 'round';
  context.strokeStyle = '#a6aeb9';
  context.lineWidth = 1.2;
  context.stroke(new win.Path2D('M 12 25 Q 13.8 26.8 13.7 29.5 M 23.7 19.1 Q 24.6 20.5 24.8 22.5 M 30.1 21.6 Q 30.9 22.8 31.2 24.4'));
  context.strokeStyle = '#ffffff';
  context.lineWidth = 1.5;
  context.stroke(new win.Path2D('M 9.4 6.5 Q 9.8 4.9 11.6 5.1 M 10 9 L 12.6 18.1 M 17.4 24.3 Q 18 22.8 19.5 22.6 M 25.4 22.9 Q 26.1 22.4 27 22.7'));
  context.restore();
  context.strokeStyle = '#656c77';
  context.lineWidth = 1.1;
  context.stroke(glove);

  const band = context.createLinearGradient(20, 37, 23, 45);
  band.addColorStop(0, '#ffffff');
  band.addColorStop(.43, '#e9edf1');
  band.addColorStop(1, '#aab1bc');
  context.fillStyle = band;
  context.fill(cuff);
  context.stroke(cuff);
  context.strokeStyle = '#ffffff';
  context.lineWidth = 1;
  context.stroke(new win.Path2D('M 17 41.3 Q 23.2 38.4 29.7 38.4'));
  return canvas;
}
