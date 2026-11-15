import { Component, ViewEncapsulation } from '@angular/core';
import { applyPage } from '../page-shell';

/** /guide/how-to-play/ (Thai). Head, styles and the share-bar script are in ../page-data.ts. */
@Component({
  selector: 'app-guide-how-to-play-th',
  templateUrl: './guide-how-to-play-th.html',
  encapsulation: ViewEncapsulation.None,
  preserveWhitespaces: true,
})
export class PageGuideHowToPlayTh {
  constructor() { applyPage('guide-how-to-play-th'); }
}
