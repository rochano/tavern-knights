// Small math helpers shared by the game and its scenes.
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
export const pick = <V>(arr: V[]): V => arr[Math.floor(Math.random() * arr.length)];
export const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
/** stable pseudo-random 0..1 for an integer seed (scenery placement) */
export const hash = (i: number): number => { const v = Math.sin(i * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
