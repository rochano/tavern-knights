import { Component, ViewEncapsulation } from '@angular/core';
import { applyPage } from '../page-shell';

/** /guide/en/tavern-night-shift/ (English). Head, styles and the share-bar script are in ../page-data.ts. */
@Component({
  selector: 'app-guide-tavern-night-shift-en',
  templateUrl: './guide-tavern-night-shift-en.html',
  encapsulation: ViewEncapsulation.None,
  preserveWhitespaces: true,
})
export class PageGuideTavernNightShiftEn {
  constructor() { applyPage('guide-tavern-night-shift-en'); }
}
