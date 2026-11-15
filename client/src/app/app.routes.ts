import { Routes } from '@angular/router';
import { Play } from './play/play';

// about.html, guide/ and the other content pages are still static files in public/ (moved to Angular in phase 5).
export const routes: Routes = [
  { path: '', component: Play },
  { path: '**', redirectTo: '' },
];
