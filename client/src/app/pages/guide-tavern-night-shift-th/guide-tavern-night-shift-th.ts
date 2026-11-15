import { Component, ViewEncapsulation } from '@angular/core';
import { applyPage } from '../page-shell';

/** /guide/tavern-night-shift/ (Thai). Head, styles and the share-bar script are in ../page-data.ts. */
@Component({
  selector: 'app-guide-tavern-night-shift-th',
  templateUrl: './guide-tavern-night-shift-th.html',
  encapsulation: ViewEncapsulation.None,
  preserveWhitespaces: true,
})
export class PageGuideTavernNightShiftTh {
  constructor() { applyPage('guide-tavern-night-shift-th'); }
}
