import { d } from "@/lib/drizzle";

/**
 * An episode update can not be edited, nor regenerated.
 */
export class EpisodeUpdate {
  static is(obj: any): obj is EpisodeUpdate {
    return obj instanceof EpisodeUpdate;
  }

  constructor(
    readonly id: string,
    readonly parentId: string | null,
    readonly episodeId: string,
    readonly chunkIndex: number,
    readonly text: string,
    readonly directorUpdate: Pick<
      typeof d.directorUpdates.$inferSelect,
      "id" | "code" | "createdAt"
    > | null,
  ) {}
}
