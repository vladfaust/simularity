import type { Download } from "@/lib/downloads";
import * as storage from "@/lib/storage";
import type { WellKnownModel } from "@/queries";
import type { Ref, ShallowRef } from "vue";

export type WellKnownModelProps = {
  recommendationModelId: string;
  recommendationModel: WellKnownModel;
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
