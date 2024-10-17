<script setup lang="ts">
import Modal from "@/components/Modal.vue";
import Placeholder from "@/components/Placeholder.vue";
import RichTitle from "@/components/RichForm/RichTitle.vue";
import { env } from "@/env";
import * as api from "@/lib/api";
import { userQueryKey, useUserQuery } from "@/lib/queries";
import { sha256Hex } from "@/lib/utils";
import { useQueryClient } from "@tanstack/vue-query";
import { asyncComputed, useFileDialog } from "@vueuse/core";
import {
  AsteriskIcon,
  FileUpIcon,
  Loader2Icon,
  SaveIcon,
  Undo2Icon,
} from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { toast } from "vue3-toastify";

const props = defineProps<{
  open: boolean;
  userId: string;
}>();

const emit = defineEmits<{
  (event: "close"): void;
}>();

const queryClient = useQueryClient();
const userQuery = useUserQuery(props.userId);

//#region Username
const originalUsername = computed(() => userQuery.data.value?.username);
const username = ref("");
const usernameChanged = computed(
  () => username.value && username.value !== originalUsername.value,
);
//#endregion

//#region Bio
const originalBio = computed(() => userQuery.data.value?.bio);
const bio = ref("");
const bioChanged = computed(
  () => bio.value && bio.value.trim() !== originalBio.value?.trim(),
);
//#endregion

//#region Profile picture
const originalPfp = computed(() => userQuery.data.value?.pfp);
const originalPfpUrl = computed(() => {
  if (originalPfp.value) {
    return (
      env.VITE_API_BASE_URL +
      `/rest/v1/users/${props.userId}/pfp/${originalPfp.value.hash}${originalPfp.value.extension ? `.${originalPfp.value.extension}` : ""}`
    );
  }
});
const pfpDialog = useFileDialog({ accept: "image/*", multiple: false });
const pfpFile = ref<File | null>(null);
const pfpFileUrl = computed(() =>
  pfpFile.value ? URL.createObjectURL(pfpFile.value) : originalPfpUrl.value,
);
const pfpFileHash = asyncComputed(async () => {
  if (pfpFile.value) {
    return sha256Hex(new Uint8Array(await pfpFile.value.arrayBuffer()));
  }
});
const pfpChanged = computed(
  () => pfpFile.value !== null && originalPfp.value?.hash !== pfpFileHash.value,
);
//#endregion

//#region Background picture
const originalBgp = computed(() => userQuery.data.value?.bgp);
const originalBgpUrl = computed(() => {
  if (originalBgp.value) {
    return (
      env.VITE_API_BASE_URL +
      `/rest/v1/users/${props.userId}/bgp/${originalBgp.value.hash}${originalBgp.value.extension ? `.${originalBgp.value.extension}` : ""}`
    );
  }
});
const bgpDialog = useFileDialog({ accept: "image/*", multiple: false });
const bgpFile = ref<File | null>(null);
const bgpFileUrl = computed(() =>
  bgpFile.value ? URL.createObjectURL(bgpFile.value) : originalBgpUrl.value,
);
const bgpFileHash = asyncComputed(async () => {
  if (bgpFile.value) {
    return sha256Hex(new Uint8Array(await bgpFile.value.arrayBuffer()));
  }
});
const bgpChanged = computed(
  () => bgpFile.value !== null && originalBgp.value?.hash !== bgpFileHash.value,
);
//#endregion

const anyChanges = computed(
  () =>
    usernameChanged.value ||
    bioChanged.value ||
    pfpChanged.value ||
    bgpChanged.value,
);

const submitInProgress = ref(false);

async function submit() {
  try {
    submitInProgress.value = true;
    const data = new FormData();

    if (usernameChanged.value) {
      data.append("username", username.value.trim());
    }

    if (bioChanged.value) {
      data.append("bio", bio.value.trim());
    }

    if (pfpChanged.value) {
      data.append("pfp", pfpFile.value!);
    }

    if (bgpChanged.value) {
      data.append("bgp", bgpFile.value!);
    }

    await api.rest.v1.account.update(data);
    await userQuery.refetch();

    await queryClient.invalidateQueries({
      queryKey: userQueryKey(props.userId),
    });
  } catch (e: any) {
    console.error(e);
    toast(`Failed to save changes: ${e.message}`, { type: "error" });
  } finally {
    submitInProgress.value = false;
  }
}

pfpDialog.onChange((e) => {
  const file = e?.item(0);

  if (file) {
    pfpFile.value = file;
  } else {
    pfpFile.value = null;
  }
});

bgpDialog.onChange((e) => {
  const file = e?.item(0);

  if (file) {
    bgpFile.value = file;
  } else {
    bgpFile.value = null;
  }
});

watch(
  userQuery.data,
  (data) => {
    if (data) {
      username.value = data.username ?? "";
      bio.value = data.bio;
    }
  },
  { immediate: true },
);
</script>

<template lang="pug">
Modal.max-h-full.w-full.max-w-xl.rounded-lg.bg-white(
  title="Profile settings"
  :open
  @close="emit('close')"
)
  .flex.h-full.flex-col.overflow-y-hidden
    .flex.h-full.flex-col.gap-2.overflow-y-scroll.p-3
      //- Background picture.
      .flex.flex-col.gap-2
        RichTitle
          template(#extra)
            button(v-if="bgpChanged" @click="bgpDialog.reset()")
              Undo2Icon(:size="20")
          span.font-semibold.leading-snug.tracking-wide Background picture
          AsteriskIcon.text-primary-500(:size="20" v-if="bgpChanged")

        img.h-48.w-full.cursor-pointer.rounded.object-cover.transition-transform.pressable-sm(
          v-if="bgpFileUrl"
          :src="bgpFileUrl"
          alt="Background picture"
          @click="bgpDialog.open()"
        )
        Placeholder.h-48.w-full.cursor-pointer.rounded.border.border-dashed.bg-neutral-50.shadow-inner.transition-transform.pressable-sm(
          v-else
          @click="bgpDialog.open()"
        )
          FileUpIcon.text-neutral-500(:size="20")

      //- Profile picture.
      .flex.flex-col.gap-2
        RichTitle
          template(#extra)
            button(v-if="pfpChanged" @click="pfpDialog.reset()")
              Undo2Icon(:size="20")
          span.font-semibold.leading-snug.tracking-wide Profile picture
          AsteriskIcon.text-primary-500(:size="20" v-if="pfpChanged")

        img.h-32.w-32.cursor-pointer.rounded.object-cover.transition-transform.pressable-sm(
          v-if="pfpFileUrl"
          :src="pfpFileUrl"
          alt="Profile picture"
          @click="pfpDialog.open()"
        )
        Placeholder.h-32.w-32.cursor-pointer.rounded.border.border-dashed.bg-neutral-50.shadow-inner.transition-transform.pressable-sm(
          v-else
          @click="pfpDialog.open()"
        )
          FileUpIcon.text-neutral-500(:size="20")

      //- Username.
      .flex.flex-col.gap-2
        RichTitle
          template(#extra)
            button(
              v-if="usernameChanged"
              @click="username = originalUsername ?? ''"
            )
              Undo2Icon(:size="20")
          span.font-semibold.leading-snug.tracking-wide Username
          AsteriskIcon.text-primary-500(:size="20" v-if="usernameChanged")
        input.rounded.border.bg-neutral-50.p-2.shadow-inner(
          v-model.trim="username"
        )

      //- Bio.
      .flex.flex-col.gap-2
        RichTitle
          template(#extra)
            button(v-if="bioChanged" @click="bio = originalBio ?? ''")
              Undo2Icon(:size="20")
          span.font-semibold.leading-snug.tracking-wide Bio
          AsteriskIcon.text-primary-500(:size="20" v-if="bioChanged")
        textarea.rounded.border.bg-neutral-50.p-2.leading-snug.shadow-inner(
          v-model="bio"
          rows="5"
        )

    .border-t.p-3
      //- Save button.
      button.btn.btn-primary.btn-md.btn-pressable-sm.w-full.rounded(
        :disabled="!anyChanges || submitInProgress"
        @click="submit"
      )
        Loader2Icon.animate-spin(:size="22" v-if="submitInProgress")
        template(v-else)
          SaveIcon(:size="20")
          | Save changes
</template>
