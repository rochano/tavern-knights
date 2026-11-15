// Keyboard and button state. Every control (keys, mouse, touch pad) ends up as an action name:
// keys[a] = held now, pressed[a] = went down since the last game step (the game clears it each step).
import { startAudio } from './audio';

export type Action = 'left' | 'right' | 'up' | 'down' | 'sp' | 'atk' | 'ult' | 'k1' | 'k2' | 'k3' | 'prev' | 'next' | 'sup' | 'help' | 'ok' | 'pause' | 'mute' | 'rename' | 'rank';
/** Named actions plus 'ui:<id>' taps on canvas buttons. */
export type ActionState = Partial<Record<Action, boolean>> & Record<string, boolean>;
export const keys: ActionState = {};
export const pressed: ActionState = {};

/** Key code -> action. */
export const KEYMAP: Record<string, string> = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', Space: 'sp', ArrowDown: 'down', KeyS: 'down',
  KeyJ: 'atk', KeyZ: 'atk', KeyK: 'sp', KeyX: 'sp', KeyL: 'ult', KeyV: 'ult', Digit1: 'k1', Digit2: 'k2', Digit3: 'k3', KeyQ: 'prev', KeyE: 'next',
  KeyC: 'sup', KeyH: 'help', Enter: 'ok', KeyP: 'pause', Escape: 'pause', KeyM: 'mute', KeyN: 'rename', KeyR: 'rank', Numpad1: 'k1', Numpad2: 'k2', Numpad3: 'k3' };

/** An action went down. The first input of the session also unlocks sound. */
export function press(a: string): void { if (!keys[a]) pressed[a] = true; keys[a] = true; startAudio(); }
export function release(a: string): void { keys[a] = false; }
