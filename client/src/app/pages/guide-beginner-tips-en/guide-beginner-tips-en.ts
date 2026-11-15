import { Component, ViewEncapsulation } from '@angular/core';
import { applyPage } from '../page-shell';

/** /guide/en/beginner-tips/ (English). Head, styles and the share-bar script are in ../page-data.ts. */
@Component({
  selector: 'app-guide-beginner-tips-en',
  templateUrl: './guide-beginner-tips-en.html',
  encapsulation: ViewEncapsulation.None,
  preserveWhitespaces: true,
})
export class PageGuideBeginnerTipsEn {
  constructor() { applyPage('guide-beginner-tips-en'); }
}
