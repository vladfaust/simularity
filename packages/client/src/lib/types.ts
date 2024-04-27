export type Scenario = {
  name: string;
  global_prompt: string;
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
