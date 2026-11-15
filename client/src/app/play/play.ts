import { AfterViewInit, Component, DOCUMENT, ViewEncapsulation, inject } from '@angular/core';

/**
 * The game screen. The markup and styles were split out of the old single-file index.html as-is.
 * The game code still runs as one script (public/game/legacy-game.js) while it is being moved
 * into TypeScript modules scene by scene (migration phases 3-4). Everything on screen is drawn
 * on the canvas from the Gemini art sheets.
 */
@Component({
  selector: 'app-play',
  templateUrl: './play.html',
  styleUrl: './play.css',
  encapsulation: ViewEncapsulation.None,
  preserveWhitespaces: true,
})
export class Play implements AfterViewInit {
  private readonly doc = inject(DOCUMENT);

  ngAfterViewInit(): void {
    // The game reads its DOM (canvas, buttons, touch pad) once when it starts, so it loads after the view exists.
    if (this.doc.getElementById('tk-game-script')) return;
    const s = this.doc.createElement('script');
    s.id = 'tk-game-script';
    s.src = 'game/legacy-game.js';
    this.doc.body.appendChild(s);
  }
}
