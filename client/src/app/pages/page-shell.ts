import { DOCUMENT, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { PAGES } from './page-data';

/**
 * Turns the game's index.html shell into a plain content page while the page is prerendered:
 * the head becomes the page's own head, and everything in <body> except <app-root> (the game's
 * loader, scripts and the Angular bundle) is dropped, then the page's own end-of-body script added.
 * The prerendered pages are static HTML with no Angular runtime, like the old hand-written pages.
 * Call from a page component's constructor.
 */
export function applyPage(id: string): void {
  if (!isPlatformServer(inject(PLATFORM_ID))) return;
  const doc = inject(DOCUMENT), page = PAGES[id]!;
  doc.documentElement.lang = page.lang;
  doc.head.innerHTML = '<meta charset="utf-8">\n' + page.head;
  const root = doc.body.querySelector('app-root')!;
  for (const n of Array.from(doc.body.childNodes)) if (n !== root) n.remove();
  doc.body.insertBefore(doc.createTextNode('\n'), root);
  if (page.tail) { const t = doc.createElement('template'); t.innerHTML = page.tail; root.after(doc.createTextNode('\n'), ...Array.from(t.content.childNodes)); }
}
