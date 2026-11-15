import { Component, ViewEncapsulation } from '@angular/core';
import { applyPage } from '../page-shell';

/** /guide/beginner-tips/ (Thai). Head, styles and the share-bar script are in ../page-data.ts. */
@Component({
  selector: 'app-guide-beginner-tips-th',
  templateUrl: './guide-beginner-tips-th.html',
  encapsulation: ViewEncapsulation.None,
  preserveWhitespaces: true,
})
export class PageGuideBeginnerTipsTh {
  constructor() { applyPage('guide-beginner-tips-th'); }
}
