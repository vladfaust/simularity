import { AssistantUpdate } from "./updates/AssistantUpdate";
import { EpisodeUpdate } from "./updates/EpisodeUpdate";
import { UserUpdate } from "./updates/UserUpdate";

export { AssistantUpdate, EpisodeUpdate, UserUpdate };
export type Update = AssistantUpdate | EpisodeUpdate | UserUpdate;
