import { Component, ViewEncapsulation } from '@angular/core';
import { applyPage } from '../page-shell';

/** /about.html (Thai). Head, styles and the share-bar script are in ../page-data.ts. */
@Component({
  selector: 'app-about',
  templateUrl: './about.html',
  encapsulation: ViewEncapsulation.None,
  preserveWhitespaces: true,
})
export class PageAbout {
  constructor() { applyPage('about'); }
}
