import { Deferred } from "@/lib/utils";
import Phaser from "phaser";

export class Game {
  private _game: Phaser.Game;

  constructor() {
    this._game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: "game-screen",
      width: 1920,
      height: 1080,

      scale: {
        // Fit to window.
        mode: Phaser.Scale.ScaleModes.ENVELOP,

        // Center vertically and horizontally.
        autoCenter: Phaser.Scale.Center.CENTER_BOTH,
      },

      preserveDrawingBuffer: true,
    });
  }

  /**
   * Returns a promise of a created scene.
   */
  createScene<T extends Phaser.Scene>(scene: T, sceneName: string): Promise<T> {
    this._game.scene.add(sceneName, scene, true);

    const deferredScene = new Deferred<T>();

    // TODO: Call once the scene is ready.
    const interval = setInterval(() => {
      const scene = this._game.scene.getScene(sceneName) as T | null;

      if (scene) {
        deferredScene.resolve(scene);
        clearInterval(interval);
      }
    }, 100);

    return deferredScene.promise;
  }

  onResize(
    callback: (event: {
      gameSize: Phaser.Structs.Size;
      baseSize: Phaser.Structs.Size;
      displaySize: Phaser.Structs.Size;
      previousWidth: number;
      previousHeight: number;
    }) => void,
  ) {
    this._game.scale.on(
      Phaser.Scale.Events.RESIZE,
      (
        gameSize: Phaser.Structs.Size,
        baseSize: Phaser.Structs.Size,
        displaySize: Phaser.Structs.Size,
        previousWidth: number,
        previousHeight: number,
      ) => {
        callback({
          gameSize,
          baseSize,
          displaySize,
          previousWidth,
          previousHeight,
        });
      },
    );
  }

  screenshot(mime = "image/jpeg", quality = 0.8) {
    return this._game.canvas.toDataURL(mime, quality);
  }
}
