import { Component, ViewEncapsulation } from '@angular/core';
import { applyPage } from '../page-shell';

/** /guide/ (Thai). Head, styles and the share-bar script are in ../page-data.ts. */
@Component({
  selector: 'app-guide-th',
  templateUrl: './guide-th.html',
  encapsulation: ViewEncapsulation.None,
  preserveWhitespaces: true,
})
export class PageGuideTh {
  constructor() { applyPage('guide-th'); }
}
