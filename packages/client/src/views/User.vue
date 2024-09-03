<script setup lang="ts">
import Header from "@/components/Browser/Header.vue";
import CustomTitle from "@/components/CustomTitle.vue";
import { confirm_ } from "@/lib/resources";
import { remoteServerJwt } from "@/lib/storage";
import { useCurrentUserQuery } from "@/queries";
import router, { routeLocation } from "@/router";
import { CircleDollarSign, LogOutIcon, MailIcon } from "lucide-vue-next";
import { onMounted } from "vue";
import { toast } from "vue3-toastify";

const userQuery = useCurrentUserQuery();

async function logout() {
  if (
    !(await confirm_("Are you sure you want to log out?", {
      title: "Log out",
      okLabel: "Log out",
    }))
  ) {
    return;
  }

  remoteServerJwt.value = null;

  router.push(routeLocation({ name: "Home" })).then(() => {
    toast("Logged out", {
      theme: "auto",
      type: "default",
      position: "bottom-right",
      pauseOnHover: false,
    });
  });
}

onMounted(() => {
  if (!remoteServerJwt.value) {
    throw new Error("Not logged in");
  }
});
</script>

<template lang="pug">
.flex.h-screen.flex-col.items-center.bg-neutral-100
  .flex.w-full.justify-center.bg-white
    Header.h-full.w-full.max-w-4xl

  .flex.h-full.w-full.items-start.justify-center.border-t.bg-white
    .flex.w-full.max-w-md.flex-col.gap-2.p-3
      CustomTitle(title="E-mail")
        template(#icon)
          MailIcon(:size="20")
        template(#extra)
          .font-mono {{ userQuery.data.value?.email }}
      CustomTitle(title="Credits")
        template(#icon)
          CircleDollarSign(:size="20")
        template(#extra)
          .font-mono ¢{{ userQuery.data.value?.creditBalance ?? 0 }}
      button.btn.btn-md.rounded.border.transition.pressable-sm(
        @click="logout"
        class="hover:btn-error"
      )
        LogOutIcon(:size="20")
        span Log out
</template>
