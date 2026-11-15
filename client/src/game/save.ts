// Player progress, kept per browser in localStorage 'tavern-knights-save' (same key as before the
// Angular move, so existing saves keep working).

export interface SaveData {
  gold: number;
  up: { blade: number; stew: number; brew: number; legend: boolean; armor?: number };
  ing: { glowcap: number; truffle: number; crown: number; ember: number; chili: number; essence: number; [k: string]: number };
  runs: number;
  best: number;
  buff: boolean;
  drink: boolean;
  tools: { lucky: boolean; spoon: boolean; bell: boolean };
  crew: string[];
  stages: Record<number, { stars: number; hearts: number }>;
  seen: Record<string, boolean>;
  /** full version: outfit tier worn as a bought look (cosmetic), bought looks, gold/crate purchases already added */
  look?: number;
  owned?: string[];
  applied?: string[];
  [k: string]: unknown;
}

const KEY = 'tavern-knights-save';

export const DEFAULT_SAVE: SaveData = {
  gold: 0, up: { blade: 0, stew: 0, brew: 0, legend: false }, ing: { glowcap: 0, truffle: 0, crown: 0, ember: 0, chili: 0, essence: 0 },
  runs: 0, best: 0, buff: false, drink: false, tools: { lucky: false, spoon: false, bell: false }, crew: ['gorn', 'bart'], stages: {}, seen: {},
};

/** Reads the save, filling in fields added since it was written. A missing or broken save starts fresh. */
export function loadSave(): SaveData {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && s.up && s.ing) {
      const m = Object.assign(structuredClone(DEFAULT_SAVE), s);
      m.ing = Object.assign(structuredClone(DEFAULT_SAVE.ing), s.ing);
      m.tools = Object.assign({ lucky: false, spoon: false, bell: false }, s.tools || {});
      return m;
    }
  } catch { /* broken JSON or no storage */ }
  return structuredClone(DEFAULT_SAVE);
}

export function writeSave(save: SaveData): void {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* private mode or full */ }
}
