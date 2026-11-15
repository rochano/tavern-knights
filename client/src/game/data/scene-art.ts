// Backgrounds and scene props from the user's art sheets: E7 (cellar pit + bubbles), E5 (pool, shock,
// spore, mug), the tavern trays, and the scene backdrops (ENV). Each table fills in as its images load;
// scenes check for a key before drawing it.

import type { ImgTable } from '../scenes/host';

/** Tavern customer art keys (CREW_ART). */
export const CUST_KEYS = ['cust_dwarf', 'cust_mug', 'cust_elf', 'cust_archer', 'cust_merchant', 'cust_bard', 'cust_noble', 'cust_lady'];
/** How squashed the E7 pool art is drawn (height / width). */
export const POOL_SQ = 0.55;

const E7_SRC: Record<string, string> = {"pit": "art/4c5078272bc3.webp", "pool": "art/6e7c374915d9.webp", "bub0": "art/bb0d5088bfe2.webp", "bub1": "art/f9fd734cc78a.webp", "bub2": "art/5be9cbb147c5.webp"};
const E5_SRC: Record<string, string> = {"pool": "art/47a623b8d4ef.webp", "shock": "art/28a6c5a024c6.webp", "spore": "art/6de6171bdaa1.webp", "mug": "art/f37aef6cbe64.webp"};
const TRAY_SRC: Record<string, string> = {"tray_empty": "art/2fec1f9ad44c.webp", "tray_beer": "art/cf5a1de7dacc.webp", "tray_mix": "art/6972664d1dbc.webp"};
const ENV_SRC: Record<string, string> = {title_clean:"art/7e37ff8cac34.jpg",cellar2:"art/559c329846ee.jpg",tav2:"art/97f217a03440.jpg",arena:"art/a46905011e86.webp",ground2:"art/8fa63bc34a04.webp",plat2:"art/1de7f53ed7d5.webp",midbg:"art/003ce3dd268f.webp",farbg:"art/b16db0e3d121.jpg",title:"art/55d67ed13c86.jpg",sky:"art/91695c65291a.webp",trees:"art/08bd5ffeb7b3.webp",fungi:"art/36ab70487458.webp",groundstrip:"art/abde28010105.webp",platform:"art/c34d5b0aa1c8.webp",tavern:"art/7f6d45704aea.webp",cellar:"art/9c447fcc6c3a.webp",map:"art/f1237e09a557.jpg",};

function load(src: Record<string, string>, into: ImgTable<string>, onLoad?: (k: string) => void) {
  for (const k in src) { const im = new Image(); im.onload = () => { into[k] = im; if (onLoad) onLoad(k); }; im.src = src[k]; }
}

/** Starts loading the prop sheets (E7, E5, trays). */
export function loadPropArt() {
  const E7: ImgTable<string> = {}, E5: ImgTable<string> = {}, TRAY: ImgTable<string> = {};
  load(E7_SRC, E7); load(E5_SRC, E5); load(TRAY_SRC, TRAY);
  return { E7, E5, TRAY };
}

/** Starts loading the backdrops; onMap runs once the world map image is in. */
export function loadEnvArt(onMap: () => void) {
  const ENV: ImgTable<string> = {};
  load(ENV_SRC, ENV, k => { if (k === 'map') onMap(); });
  return ENV;
}
