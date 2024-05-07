export type Scenario = {
  name: string;
  globalPrompt: string;
  locations: [
    {
      id: string;
      name: string;
      prompt: string;
      scenes: [
        {
          id: string;
          bg: string;
          prompt?: string;
        },
      ];
    },
  ];
  characters: [
    {
      id: string;
      displayName: string;
      displayColor: string;
      personalityPrompt: string;
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
      defaultOutfitId: string;
      defaultExpressionId: string;
      outfits: [
        {
          id: string;
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
          text: string;
          code: [string];
        },
      ];
    },
  ];
  startEpisodeId: string;
};
