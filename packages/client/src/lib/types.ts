import { StageCall } from "./simulation/stage";

export type Scenario = {
  name: string;
  globalPrompt: string;
  locations: [
    {
      id: string;
      name: string;
      about: string;
      prompt: string;
      scenes: [
        {
          id: string;
          name: string;
          bg: string;
          prompt?: string;
        },
      ];
    },
  ];
  characters: [
    {
      id: string;
      fullName: string;
      displayName?: string;
      displayColor: string;
      about: string;
      pfp?: string;
      personalityPrompt: string;
      traits: string[];
      appearancePrompt: string;
      scenarioPrompt: string;
      bodies: [string];
      expressions: [
        {
          id: string;
          bodyId: number;
          file: string;
        },
      ];
      outfits: [
        {
          id: string;
          name: string;
          prompt: string;
          /** Outfit files, with index matching the body's. */
          files: [string];
        },
      ];
    },
  ];
  episodes: [
    {
      id: string;
      chunks: [
        {
          writerUpdateText: string;
          stageCalls: StageCall[];
        },
      ];
    },
  ];
  startEpisodeId: string;
};

export type Stage = {
  scene: {
    locationId: string;
    sceneId: string;
  };
  characters: {
    id: string;
    outfitId: string;
    expressionId: string;
  }[];
};
