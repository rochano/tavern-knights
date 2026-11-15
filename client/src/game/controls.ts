// Page controls outside the canvas: the header that slides in near the top edge, its tool buttons
// (mute, reset save), the keyboard, and the on-screen #touch buttons of the old layout.
// The tool buttons are skinned with the dark frame from the user's UI sheet, not CSS boxes.

import { UI_ART_SRC } from './data/art';
import { audio } from './audio';
import { KEYMAP, keys, press, pressed, release, type Action } from './input';

export interface ControlsHost {
  readonly cv: HTMLCanvasElement;
  /** The ranking scene, read when a key is pressed in the name box. */
  readonly ranking: { readonly nameEdit: boolean; nameDone(ok: boolean): void };
  tr<T>(s: T): T;
  initAudio(): void;
  /** Second press of the reset button within 3 s: wipe the save and go to the title. */
  resetSave(): void;
}

export function createControls(host: ControlsHost) {
  const { cv, tr, initAudio } = host;
  { const hd = document.querySelector('header')!; let ht = 0; const show = () => { hd.classList.add('show'); clearTimeout(ht); ht = setTimeout(() => hd.classList.remove('show'), 2200); }; window.addEventListener('mousemove', e => { if (e.clientY < 70) show(); }); window.addEventListener('touchstart', e => { if (e.touches[0] && e.touches[0].clientY < 70) show(); }, { passive: true }); }
  setTimeout(function styleTools() { const u = UI_ART_SRC.big['frame_dark']; document.querySelectorAll<HTMLElement>('button.tool').forEach(b => { b.style.background = 'none'; b.style.border = '9px solid transparent'; b.style.borderImage = `url(${u}) 40 44 fill / 9px 11px stretch`; b.style.padding = '0 4px'; b.style.borderRadius = '0'; b.style.color = '#f6ead2'; b.style.textShadow = '0 1px 0 #000'; }); }, 0);
  window.addEventListener('keydown', e => { if (e.target && (e.target as HTMLElement).id === 'nameIn') { if (e.key === 'Enter') { e.preventDefault(); host.ranking.nameDone(true); } else if (e.key === 'Escape') { e.preventDefault(); host.ranking.nameDone(false); } return; } const a = KEYMAP[e.code]; if (!a) return; e.preventDefault(); if (a === 'mute' && !e.repeat) toggleMute(); press(a); });
  window.addEventListener('keyup', e => { const a = KEYMAP[e.code]; if (a) release(a); });
  window.addEventListener('blur', () => { for (const k in keys) keys[k as Action] = false; });
  cv.addEventListener('pointerdown', () => { if (!host.ranking.nameEdit) cv.focus(); initAudio(); pressed['click'] = true; });
  document.querySelectorAll<HTMLElement>('#touch button').forEach(b => {
    const a = b.dataset['k'] as Action;
    b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); press(a); });
    const up = (e: Event) => { e.preventDefault(); release(a); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  });
  const btnMute = document.getElementById('btnMute')!;
  function toggleMute() { audio.muted = !audio.muted; btnMute.textContent = tr('เสียง: ') + tr(audio.muted ? 'ปิด' : 'เปิด'); }
  btnMute.addEventListener('click', () => { initAudio(); toggleMute(); });
  const btnReset = document.getElementById('btnReset')!;
  let resetArm = 0;
  btnReset.addEventListener('click', () => {
    if (Date.now() - resetArm < 3000) { host.resetSave(); btnReset.textContent = tr('ล้างแล้ว'); resetArm = 0; setTimeout(() => btnReset.textContent = tr('ล้างเซฟ'), 1500); }
    else { resetArm = Date.now(); btnReset.textContent = tr('กดอีกครั้งเพื่อยืนยัน'); setTimeout(() => { if (resetArm) btnReset.textContent = tr('ล้างเซฟ'); }, 3000); }
  });
  /** Relabels the tool buttons after a language change. */
  function relabel() { btnMute.textContent = tr('เสียง: ') + tr(audio.muted ? 'ปิด' : 'เปิด'); btnReset.textContent = tr('ล้างเซฟ'); }
  return { toggleMute, relabel };
}
