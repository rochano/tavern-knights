import { Component, ViewEncapsulation, afterNextRender } from '@angular/core';

/**
 * The game screen. The markup and styles were split out of the old single-file index.html as-is.
 * The game code (src/game/) loads as its own chunk once the view exists, because it reads the
 * canvas, buttons and touch pad when it starts. The page is prerendered at build time, so the game
 * only starts in the browser (afterNextRender does not run on the server).
 */
@Component({
  selector: 'app-play',
  templateUrl: './play.html',
  styleUrl: './play.css',
  encapsulation: ViewEncapsulation.None,
  preserveWhitespaces: true,
})
export class Play {
  constructor() {
    afterNextRender(() => { import('../../game/legacy-game').then(m => m.startGame()); });
  }
}
