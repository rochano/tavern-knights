// Share a result / invite friends: a "Share" button over the stage-clear and night-shift results, and
// "Invite friends" on the title screen. On phones it opens the system share sheet with a picture of the
// result; elsewhere a small panel with LINE / Facebook / X / copy / save picture. Every share is counted
// (track 'share') with utm tags on the link, so gstats shows which shares bring players back.
// Split out of legacy-game.ts unchanged.
import { SFX } from './audio';

interface Share { kind: 'stage' | 'tavern' | 'invite'; text: string }

export interface ShareHost {
  readonly cv: HTMLCanvasElement;
  readonly THAI: string;
  readonly LANG: string;
  readonly scene: string;
  readonly help: string | null;
  readonly TOUCH_DEV: boolean;
  readonly titlePanel: unknown;
  readonly ranking: { readonly nameEdit: boolean };
  readonly stage: { readonly results: { n: number; score: number; stars: number; time: number; t: number } | null };
  readonly tavern: {
    readonly T: { over: boolean; overT: number } | null;
    readonly night: { gold: number; stars: number; served: number } | null;
  };
  initAudio(): void;
  track(name: string, params?: Record<string, unknown>): void;
}

export function createShare(host: ShareHost) {
  const { cv, THAI, initAudio, track } = host;
  const nav = navigator as Partial<Navigator>;
  const L = (th: string, en: string) => host.LANG === 'th' ? th : en;
  const btn = document.getElementById('shareBtn')!, inv = document.getElementById('inviteBtn')!, pop = document.getElementById('sharePop')!;
  const HOME = /^https?:$/.test(location.protocol) && !/^(localhost|127\.)/.test(location.hostname) ? location.origin + '/' : 'https://host.tavern-knights.pages.dev/';
  let cur: Share | null = null, lang = '', blob: Blob | null = null, imgUrl = '';
  const link = (m: string, medium: string, camp: string) => HOME + '?utm_source=' + m + '&utm_medium=' + medium + '&utm_campaign=' + camp + (host.LANG === 'en' ? '&lang=en' : '');
  const mmss = (t: number) => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
  const starStr = (n: number) => '★'.repeat(n);
  function what(): Share | null {
    if (host.scene === 'results' && host.stage.results) return { kind: 'stage', text: L('เคลียร์ด่านที่ ' + (host.stage.results.n || 1) + ' ของ Tavern Knights ได้ ' + host.stage.results.score + ' คะแนน ' + starStr(host.stage.results.stars) + ' เวลา ' + mmss(host.stage.results.time) + ' ใครทำได้ดีกว่านี้บ้าง? เล่นฟรีบนเว็บ',
      'Cleared host.stage ' + (host.stage.results.n || 1) + ' of Tavern Knights with ' + host.stage.results.score + ' points ' + starStr(host.stage.results.stars) + ' in ' + mmss(host.stage.results.time) + '. Can you beat that? Free in your browser') };
    if (host.scene === 'tavern' && host.tavern.T && host.tavern.T.over && host.tavern.night) return { kind: 'tavern', text: L('ปิดร้านกะดึกได้ ' + host.tavern.night.gold + 'g ' + starStr(host.tavern.night.stars) + ' เสิร์ฟไป ' + host.tavern.night.served + ' คน ใน Tavern Knights มาแข่งเปิดร้านกัน! เล่นฟรีบนเว็บ',
      'Closed the night shift with ' + host.tavern.night.gold + 'g ' + starStr(host.tavern.night.stars) + ', ' + host.tavern.night.served + ' customers served in Tavern Knights. Think you can run it better? Free in your browser') };
    return null;
  }
  const invite = (): Share => ({ kind: 'invite', text: L('มาเล่น Tavern Knights กัน! เกมแอ็กชันพิกเซลผสมบริหารร้านเหล้า เล่นฟรีบนเว็บ ไม่ต้องโหลด', 'Come play Tavern Knights with me! Pixel action plus host.tavern management, free in your browser, no download') });
  const urlFor = (c: Share, m: string) => c.kind === 'invite' ? link(m, 'invite', 'friend') : link(m, 'share', 'result');
  // A picture of the result screen with the game's address along the bottom.
  function picture() {
    return new Promise<Blob | null>(res => {
      try {
        const w = cv.width, h = cv.height, bar = Math.round(h * 0.075), c = document.createElement('canvas'); c.width = w; c.height = h + bar;
        const g = c.getContext('2d')!; g.drawImage(cv, 0, 0); g.fillStyle = '#160f1c'; g.fillRect(0, h, w, bar);
        g.fillStyle = '#ffd76a'; g.font = `600 ${Math.round(bar * 0.48)}px ${THAI}`; g.textBaseline = 'middle';
        const l = 'Tavern Knights · ' + L('เล่นฟรีที่ ', 'Play free at ') + HOME.replace(/^https?:\/\//, '').replace(/\/$/, ''); g.fillText(l, Math.round(w * 0.03), h + bar / 2);
        c.toBlob(b => res(b), 'image/png');
      } catch (e) { res(null); }
    });
  }
  const phone = () => !!(nav.share && nav.canShare && host.TOUCH_DEV);
  function open(c: Share, b: Blob | null) {
    cur = c; blob = b; document.body.classList.add('sp-open'); pop.hidden = false;
    document.getElementById('spTitle')!.textContent = c.kind === 'invite' ? L('ชวนเพื่อนมาเล่น', 'Invite friends') : L('แชร์ผลการเล่น', 'Share your result');
    document.getElementById('spTxt')!.textContent = c.text;
    const im = (document.getElementById('spImg')! as HTMLImageElement); if (imgUrl) URL.revokeObjectURL(imgUrl); imgUrl = b ? URL.createObjectURL(b) : ''; im.hidden = !b; if (b) im.src = imgUrl;
    const row = [nav.share ? ['native', L('แชร์', 'Share')] : null, ['line', 'LINE'], ['facebook', 'Facebook'], ['x', 'X'], ['copy', L('คัดลอกลิงก์', 'Copy link')], b ? ['save', L('บันทึกรูป', 'Save picture')] : null].filter((r): r is string[] => Boolean(r));
    document.getElementById('spRow')!.innerHTML = row.map(([k, t]) => k === 'line' || k === 'facebook' || k === 'x' ? `<a data-s="${k}" href="#" target="_blank" rel="noopener">${t}</a>` : `<button type="button" data-s="${k}">${t}</button>`).join('');
    document.getElementById('spClose')!.textContent = L('ปิด', 'Close');
    setTimeout(() => { const f = pop.querySelector<HTMLElement>('[data-s]'); if (f) f.focus(); }, 0);
  }
  function close() { pop.hidden = true; document.body.classList.remove('sp-open'); cur = null; try { cv.focus(); } catch (e) {} }
  async function start(c: Share | null) {
    if (!c) return; initAudio(); SFX.select();
    track('share_open', { kind: c.kind });
    const b = c.kind === 'invite' ? null : await picture();
    if (phone()) {
      const files = b ? [new File([b], 'tavern-knights.png', { type: 'image/png' })] : [];
      const data = files.length && navigator.canShare({ files }) ? { files, text: c.text + ' ' + urlFor(c, 'native') } : { title: 'Tavern Knights', text: c.text, url: urlFor(c, 'native') };
      try { await navigator.share(data); track('share', { method: 'native', kind: c.kind }); } catch (e) {}
      return;
    }
    open(c, b);
  }
  pop.addEventListener('click', e => {
    if (e.target === pop || (e.target as HTMLElement).id === 'spClose') { close(); return; }
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-s]'); if (!a || !cur) return; const m = a.dataset['s']!, c = cur;
    track('share', { method: m, kind: c.kind });
    if (m === 'native') { e.preventDefault(); const files = blob ? [new File([blob], 'tavern-knights.png', { type: 'image/png' })] : [];
      navigator.share(files.length && navigator.canShare && navigator.canShare({ files }) ? { files, text: c.text + ' ' + urlFor(c, 'native') } : { title: 'Tavern Knights', text: c.text, url: urlFor(c, 'native') }).catch(() => {}); return; }
    if (m === 'copy') { e.preventDefault(); const t = c.text + ' ' + urlFor(c, 'copy'), done = () => { a.textContent = L('คัดลอกแล้ว', 'Copied'); setTimeout(() => { a.textContent = L('คัดลอกลิงก์', 'Copy link'); }, 1800); };
      try { navigator.clipboard.writeText(t).then(done, () => prompt('', t)); } catch (x) { prompt('', t); } return; }
    if (m === 'save') { e.preventDefault(); const d = document.createElement('a'); d.href = imgUrl; d.download = 'tavern-knights.png'; document.body.appendChild(d); d.click(); d.remove(); return; }
    const u = encodeURIComponent(urlFor(c, m)), tx = encodeURIComponent(c.text);
    (a as HTMLAnchorElement).href = m === 'line' ? 'https://social-plugins.line.me/lineit/share?url=' + u + '&text=' + tx : m === 'facebook' ? 'https://www.facebook.com/sharer/sharer.php?u=' + u : 'https://twitter.com/intent/tweet?url=' + u + '&text=' + tx;
  });
  // While the panel is open, keys go to it, not to the game (Enter would otherwise skip the host.stage.results screen).
  document.addEventListener('keydown', e => { if (pop.hidden) return; if (e.key === 'Escape') { e.preventDefault(); close(); } if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== ' ') e.preventDefault(); e.stopPropagation(); }, true);
  btn.addEventListener('click', () => start(what()));
  inv.addEventListener('click', () => start(invite()));
  document.getElementById('btnGuide')!.addEventListener('click', () => { track('guides_open', { from: 'header' }); window.open(host.LANG === 'en' ? '/guide/en/' : '/guide/', '_blank', 'noopener'); });
  function sync() {
    const res = host.scene === 'results' && host.stage.results && host.stage.results.t > 0.8, tav = host.scene === 'tavern' && host.tavern.T && host.tavern.T.over && host.tavern.night && host.tavern.T.overT > 0.8;
    const showS = (res || tav) && !host.help && pop.hidden, showI = host.scene === 'title' && !host.titlePanel && !host.help && pop.hidden && !host.ranking.nameEdit;
    if (btn.hidden === showS) btn.hidden = !showS;
    if (showS) { const k = res ? 'at-res' : 'at-tav'; if (!btn.classList.contains(k)) { btn.classList.remove('at-res', 'at-tav'); btn.classList.add(k); } }
    if (inv.hidden === showI) inv.hidden = !showI;
    if (!pop.hidden && !(res || tav || host.scene === 'title')) close();
    if (lang !== host.LANG) { lang = host.LANG; btn.textContent = L('📣 แชร์ผล', '📣 Share'); inv.textContent = L('ชวนเพื่อนมาเล่น', 'Invite friends'); }
  }
  return { sync, close };
}
