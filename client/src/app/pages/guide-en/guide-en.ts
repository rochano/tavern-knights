import { Component, ViewEncapsulation } from '@angular/core';
import { applyPage } from '../page-shell';

/** /guide/en/ (English). Head, styles and the share-bar script are in ../page-data.ts. */
@Component({
  selector: 'app-guide-en',
  templateUrl: './guide-en.html',
  encapsulation: ViewEncapsulation.None,
  preserveWhitespaces: true,
})
export class PageGuideEn {
  constructor() { applyPage('guide-en'); }
}
