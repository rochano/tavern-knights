import { Component, ViewEncapsulation } from '@angular/core';
import { applyPage } from '../page-shell';

/** /guide/en/how-to-play/ (English). Head, styles and the share-bar script are in ../page-data.ts. */
@Component({
  selector: 'app-guide-how-to-play-en',
  templateUrl: './guide-how-to-play-en.html',
  encapsulation: ViewEncapsulation.None,
  preserveWhitespaces: true,
})
export class PageGuideHowToPlayEn {
  constructor() { applyPage('guide-how-to-play-en'); }
}
