import { Scenario } from "@/lib/types";
import { Deferred } from "@/lib/utils";
import Phaser from "phaser";
import { State } from "../stage";
import { DefaultScene } from "./defaultScene";

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
        mode: Phaser.Scale.ENVELOP,

        // Center vertically and horizontally.
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },

      preserveDrawingBuffer: true,
    });
  }

  createDefaultScene(
    scenario: Scenario,
    assetBasePath: string,
    initialStage: State | undefined,
  ): Promise<DefaultScene> {
    this._game.scene.add(
      "default",
      new DefaultScene(scenario, assetBasePath, initialStage),
      true,
    );

    const deferredScene = new Deferred<DefaultScene>();

    // TODO: Call once the scene is ready.
    const interval = setInterval(() => {
      const defaultScene = this._game.scene.getScene(
        "default",
      ) as DefaultScene | null;

      if (defaultScene) {
        deferredScene.resolve(defaultScene);
        clearInterval(interval);
      }
    }, 100);

    return deferredScene.promise;
  }

  screenshot(mime = "image/jpeg", quality = 0.8) {
    return this._game.canvas.toDataURL(mime, quality);
  }
}
