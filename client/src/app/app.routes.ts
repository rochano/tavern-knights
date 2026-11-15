import { Routes } from '@angular/router';
import { Play } from './play/play';

// The game is the root page. The content pages (about + guide, Thai and English) are prerendered
// to static HTML at their old URLs; see app.routes.server.ts and pages/.
export const routes: Routes = [
  { path: '', component: Play },
  { path: 'about.html', loadComponent: () => import('./pages/about/about').then(m => m.PageAbout) },
  { path: 'guide', loadComponent: () => import('./pages/guide-th/guide-th').then(m => m.PageGuideTh) },
  { path: 'guide/how-to-play', loadComponent: () => import('./pages/guide-how-to-play-th/guide-how-to-play-th').then(m => m.PageGuideHowToPlayTh) },
  { path: 'guide/beginner-tips', loadComponent: () => import('./pages/guide-beginner-tips-th/guide-beginner-tips-th').then(m => m.PageGuideBeginnerTipsTh) },
  { path: 'guide/tavern-night-shift', loadComponent: () => import('./pages/guide-tavern-night-shift-th/guide-tavern-night-shift-th').then(m => m.PageGuideTavernNightShiftTh) },
  { path: 'guide/en', loadComponent: () => import('./pages/guide-en/guide-en').then(m => m.PageGuideEn) },
  { path: 'guide/en/how-to-play', loadComponent: () => import('./pages/guide-how-to-play-en/guide-how-to-play-en').then(m => m.PageGuideHowToPlayEn) },
  { path: 'guide/en/beginner-tips', loadComponent: () => import('./pages/guide-beginner-tips-en/guide-beginner-tips-en').then(m => m.PageGuideBeginnerTipsEn) },
  { path: 'guide/en/tavern-night-shift', loadComponent: () => import('./pages/guide-tavern-night-shift-en/guide-tavern-night-shift-en').then(m => m.PageGuideTavernNightShiftEn) },

  { path: '**', redirectTo: '' },
];
