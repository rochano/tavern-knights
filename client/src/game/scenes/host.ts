// What a scene module needs from the game shell: the canvas, the drawing helpers (which still live in
// legacy-game.ts) and the shared game state. Values that change while the game runs are getters.
import type { SaveData } from '../save';

/** A drawable sprite: a canvas or image, optionally with a logical size and a draw offset. */
export type Img = (HTMLCanvasElement | HTMLImageElement) & { lw?: number; lh?: number; ox?: number; oy?: number };

/** Loaded art by key; keys a scene relies on are listed in K so they read as plain properties. */
export type ImgTable<K extends string> = Partial<Record<K, Img>> & Record<string, Img | undefined>;

export interface TextOpt {
  size?: number; weight?: number; thai?: boolean; color?: string; align?: CanvasTextAlign;
  base?: CanvasTextBaseline; shadow?: boolean; shadowColor?: string;
}

export interface DrawKit {
  readonly ctx: CanvasRenderingContext2D;
  readonly W: number;
  readonly H: number;
  /** canvas px per world unit */
  readonly RES: number;
  readonly ENV: ImgTable<'cellar' | 'cellar2' | 'map' | 'title' | 'title_clean' | 'tavern' | 'tav2'>;
  readonly UI_BIG: ImgTable<'dialog' | 'frame_dark' | 'frame_blue'>;
  readonly fxArtReady: boolean;
  readonly uiArtReady: boolean;
  rect(x: number, y: number, w: number, h: number, c: string): void;
  glow(x: number, y: number, r: number, col: string, a?: number): void;
  text(str: string, x: number, y: number, opt?: TextOpt): void;
  textC(str: string, x: number, cy: number, opt?: TextOpt): void;
  wrapText(str: string, x: number, y: number, maxW: number, lh: number, opt: TextOpt): number;
  panel(x: number, y: number, w: number, h: number, fill?: string, edge?: string): void;
  nineBox(k: string, x: number, y: number, w: number, h: number, b?: number, d?: number): boolean;
  slice3(im: Img, x: number, y: number, w: number, h: number, cap: number): void;
  uiBtn(x: number, y: number, w: number, h: number, on: boolean | 'off', c1?: string, c2?: string, c3?: string, c4?: string): void;
  /** registers a tap region for touch/mouse input */
  btn(id: string, x: number, y: number, w: number, h: number): void;
  dimg(img: Img, x: number, y: number, w?: number, h?: number): void;
  icon(name: string, scale?: number): Img;
  LH(img: Img): number;
  fxImg(k: string, face?: number): Img | null;
  fxB(k: string, cx: number, by: number, face?: number, s?: number): boolean;
  knightSprite(i: number, frame: string): { r: Img; l: Img };
  controlStripCustom(custom: [string, string][]): void;
}

export interface GameState {
  readonly save: SaveData;
  persist(): void;
  track(name: string, params?: Record<string, unknown>): void;
  knightMax(): number;
}
