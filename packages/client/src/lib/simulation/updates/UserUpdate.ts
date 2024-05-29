import { d } from "@/lib/drizzle";

/**
 * A user-generated update.
 */
export class UserUpdate {
  static is(obj: any): obj is UserUpdate {
    return obj instanceof UserUpdate;
  }

  constructor(
    readonly parentId: string | null,
    public chosenVariant: Pick<
      typeof d.writerUpdates.$inferSelect,
      "id" | "text" | "createdAt"
    >,
  ) {
    this.parentId = parentId;
  }
}
