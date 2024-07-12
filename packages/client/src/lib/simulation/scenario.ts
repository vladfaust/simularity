import { StateCommand } from "./state/commands";

export type Scenario = {
  name: string;
  instructions: string;
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
          shortPrompt: string;
          detailedPrompt?: string;
        },
      ];
      connections?: string[];
    },
  ];
  characters: [
    {
      id: string;
      fullName: string;
      displayName?: string;
      displayColor: string;
      about: string;
      locked?: boolean;
      personalityPrompt: string;
      traits: string[];
      appearancePrompt: string;
      scenarioPrompt: string;
      relationships?: Record<string, string>;
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
          characterId: string;
          text: string;
          commands?: StateCommand[];
        },
      ];
    },
  ];
  startEpisodeId: string;
  mainCharacterId: string;
};
