// Music and sound effects.
// Music: the user's own tracks in public/audio/, one <audio> element per track, chosen each frame by the game.
// SFX: the user's sfxr.me exports in public/sfx/ through Web Audio; small synth sounds stand in until a file
// has loaded (or for sounds that have no file).

/** Shared audio state. ac is created on the first key press or tap (browsers block sound before that). */
export const audio: { ac: AudioContext | null; muted: boolean } = { ac: null, muted: false };

/** Volume 0-10 for music and effects (8 = the original mix), saved per browser in 'tk-vol'. */
export const VOL: { bgm: number; sfx: number } = { bgm: 8, sfx: 8 };
try { Object.assign(VOL, JSON.parse(localStorage.getItem('tk-vol') || '{}')); } catch { /* no storage */ }
export function setVol(k: 'bgm' | 'sfx', v: number): void {
  VOL[k] = Math.max(0, Math.min(10, v));
  try { localStorage.setItem('tk-vol', JSON.stringify(VOL)); } catch { /* no storage */ }
}

/* ------------------------------------------------------------------ music */
export type TrackId = 'title' | 'stage1' | 'stage2' | 'tavern' | 'boss' | 'ending';
const BGM_TRACKS: Record<TrackId, string> = {
  title: 'audio/title_beyond_the_kingdom_gate.mp3', // title + map
  stage1: 'audio/stage1_moonlight_over_the_glade.mp3',
  stage2: 'audio/stage2_tiptoeing_past_the_gargoyles.mp3', // Wine Dungeon, also the alchemy cellar
  tavern: 'audio/nightshift_sizzling_skillet_meltdown.mp3',
  boss: 'audio/boss_iron_crown_heavy_weight.mp3',
  ending: 'audio/ending_sunlight_on_the_overworld.mp3', // credits + stage results
};
type TrackEl = HTMLAudioElement & { _vv?: number };
export const bgm: { els: Partial<Record<TrackId, TrackEl>>; unlocked: boolean; cur: TrackId | null } = { els: {}, unlocked: false, cur: null };
(window as unknown as { __bgm: typeof bgm }).__bgm = bgm;

function bgmEl(id: TrackId): TrackEl {
  let a = bgm.els[id];
  if (!a) { a = new Audio(BGM_TRACKS[id]) as TrackEl; a.preload = 'auto'; a.loop = true; a.volume = 0.45; bgm.els[id] = a; }
  return a;
}

/** Plays the wanted track (null = silence), stopping the previous one. dim lowers it (stage paused). */
export function bgmSync(wanted: TrackId | null, dim: boolean): void {
  if (!bgm.unlocked) return;
  const want = audio.muted ? null : wanted;
  if (want !== bgm.cur && bgm.cur) { const old = bgm.els[bgm.cur]!; old.pause(); if (!audio.muted) old.currentTime = 0; }
  if (want) {
    const el = bgmEl(want);
    const vv = Math.min(1, (want === 'title' ? 0.55 : 0.45) * (dim ? 0.4 : 1) * VOL.bgm / 8);
    if (el._vv === undefined || Math.abs(el._vv - vv) > 0.001) { el.volume = vv; el._vv = vv; }
    if (el.paused) { const pr = el.play(); if (pr && pr.catch) pr.catch(() => {}); }
  }
  bgm.cur = want;
}

/* -------------------------------------------------------------------- sfx */
export function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.06, slide = 0, delay = 0): void {
  const ac = audio.ac;
  if (!ac || audio.muted || !VOL.sfx) return;
  vol *= VOL.sfx / 8;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
}

export function noise(dur: number, vol = 0.08, delay = 0): void {
  const ac = audio.ac;
  if (!ac || audio.muted || !VOL.sfx) return;
  vol *= VOL.sfx / 8;
  const len = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = buf; g.gain.value = vol;
  s.connect(g).connect(ac.destination); s.start(ac.currentTime + delay);
}

const SFX_FILE: Record<string, string> = { coin: 'sfx/coin.mp3', select: 'sfx/select.mp3', chest: 'sfx/chest.mp3', fail: 'sfx/fail.mp3', serve: 'sfx/serve.mp3', arrow: 'sfx/arrow.mp3', boom: 'sfx/boom.mp3', special: 'sfx/special.mp3', hit: 'sfx/hit.mp3', hurt: 'sfx/hurt.mp3', hitShot: 'sfx/hit1.mp3', jump: 'sfx/jump.mp3', step: 'sfx/step.mp3' };
const SFX_GAIN: Record<string, number> = { coin: 0.22, select: 0.2, chest: 0.28, fail: 0.35, serve: 0.35, arrow: 0.2, boom: 0.4, special: 0.35, hit: 0.25, hurt: 0.28, hitShot: 0.22, jump: 0.2, step: 0.14 };
const SFX_RATE: Record<string, number> = { hitShot: 1.45 };
export const SFX_BUF: Record<string, AudioBuffer> = {};
let sfxLoading = false;

function sfxLoad(): void {
  const ac = audio.ac;
  if (sfxLoading || !ac) return;
  sfxLoading = true;
  const got: Record<string, Promise<AudioBuffer>> = {};
  for (const k in SFX_FILE) {
    const url = SFX_FILE[k];
    (got[url] = got[url] || fetch(url).then(r => r.ok ? r.arrayBuffer() : Promise.reject()).then(b => new Promise<AudioBuffer>((ok, no) => ac.decodeAudioData(b, ok, no))))
      .then(buf => { SFX_BUF[k] = buf; }).catch(() => {});
  }
}

/** Plays a loaded sound file; false when it can't (not loaded yet, muted, no audio). */
export function sfxPlay(k: string, rate?: number): boolean {
  const log = (window as unknown as { __sfxLog?: (k: string, ok: boolean, r: number) => void }).__sfxLog;
  if (log) log(k, !!SFX_BUF[k], rate || 0);
  const ac = audio.ac;
  if (!ac || audio.muted || !VOL.sfx || !SFX_BUF[k]) return false;
  const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = SFX_BUF[k];
  if (SFX_RATE[k]) s.playbackRate.value = SFX_RATE[k];
  if (k === 'step') s.playbackRate.value = 0.9 + Math.random() * 0.2;
  if (rate) s.playbackRate.value = rate;
  g.gain.value = SFX_GAIN[k] * VOL.sfx / 8;
  s.connect(g).connect(ac.destination); s.start(); return true;
}

/** Creates the audio context on the first input and starts loading the sound files. */
export function startAudio(): void {
  bgm.unlocked = true;
  if (audio.ac) { if (audio.ac.state === 'suspended') audio.ac.resume(); return; }
  try {
    const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    audio.ac = new (W.AudioContext || W.webkitAudioContext)!();
  } catch { audio.ac = null; }
  sfxLoad();
}

/** QTE notes: the coin chime pitched per arrow (do-re-mi-sol), Perfect a step higher. */
const NOTE_RATE: Record<string, number> = { up: 1.5, right: 1.335, down: 1.122, left: 1.0 };

export type SfxName = 'slash' | 'hit' | 'jump' | 'swap' | 'coin' | 'hurt' | 'special' | 'boom' | 'arrow' | 'serve' | 'fail' | 'punch' | 'harp' | 'pour' | 'ult' | 'select' | 'note' | 'step' | 'chest' | 'hitShot';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sound = (...a: any[]) => void;
/** Named sounds; known names can be called as SFX.name(). */
export const SFX: Record<SfxName, Sound> & Record<string, Sound> = {
  slash: () => { noise(0.06, 0.05); tone(520, 0.06, 'square', 0.03, -200); },
  hit: () => { tone(180, 0.08, 'square', 0.06, -80); noise(0.05, 0.05); },
  jump: () => tone(300, 0.12, 'square', 0.04, 300),
  swap: () => { tone(660, 0.05, 'triangle', 0.05); tone(990, 0.07, 'triangle', 0.05, 0, 0.05); },
  coin: () => { tone(988, 0.06, 'square', 0.04); tone(1319, 0.12, 'square', 0.04, 0, 0.06); },
  hurt: () => tone(220, 0.25, 'sawtooth', 0.06, -150),
  special: () => { tone(330, 0.35, 'sawtooth', 0.05, 500); noise(0.3, 0.05); },
  boom: () => { noise(0.5, 0.12); tone(90, 0.5, 'sine', 0.12, -50); },
  arrow: () => tone(880, 0.08, 'triangle', 0.04, -400),
  serve: () => { tone(784, 0.07, 'triangle', 0.05); tone(1046, 0.1, 'triangle', 0.05, 0, 0.07); },
  fail: () => tone(200, 0.3, 'square', 0.05, -100),
  punch: () => { noise(0.08, 0.1); tone(120, 0.12, 'square', 0.06, -60); },
  harp: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.4, 'triangle', 0.035, 0, i * 0.06)); },
  pour: () => noise(0.15, 0.03),
  ult: () => { [262, 330, 392, 523, 659].forEach((f, i) => tone(f, 0.25, 'square', 0.05, 0, i * 0.08)); },
  select: () => tone(660, 0.05, 'square', 0.035),
  note: (dir: string, perfect: boolean) => { const r = (NOTE_RATE[dir] || 1) * (perfect ? 1.122 : 1) * 0.8; if (!sfxPlay('coin', r)) tone(523 * r, 0.08, 'square', 0.04); },
  step: () => tone(140, 0.04, 'triangle', 0.025),
  hitShot: () => SFX.hit(),
  chest: () => { [523, 659, 784, 1046, 1319].forEach((f, i) => tone(f, 0.2, 'triangle', 0.04, 0, i * 0.07)); },
};
// Sounds with a file play the file once it has loaded; the synth above is the fallback.
for (const k in SFX_FILE) { const syn = SFX[k]; SFX[k] = () => { if (!sfxPlay(k)) syn(); }; }
