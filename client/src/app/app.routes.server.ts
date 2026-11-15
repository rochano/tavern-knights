import { RenderMode, ServerRoute } from '@angular/ssr';

// Cloudflare Pages serves static files only, so every real page is prerendered at build time.
// The game page ('') is prerendered too and then started in the browser.
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'about.html', renderMode: RenderMode.Prerender },
  { path: 'guide', renderMode: RenderMode.Prerender },
  { path: 'guide/en', renderMode: RenderMode.Prerender },
  { path: 'guide/**', renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Client },
];
