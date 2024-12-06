import type { Download } from "@/lib/downloads";
import * as storage from "@/lib/storage";
import type { WellKnownLocalModel } from "@/queries";
import type { Ref, ShallowRef } from "vue";

export type WellKnownModelProps = {
  recommendationModelId: string;
  recommendationModel: WellKnownLocalModel;
  cachedModelsByQuants: Record<
    string,
    {
      model: storage.llm.CachedModel;
      selected: Ref<boolean>;
      removeDeletesFile: boolean;
    }
  >;
  downloadsByQuant: ShallowRef<Record<string, ShallowRef<Download>>>;
};
