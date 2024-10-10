<script setup lang="ts">
defineOptions({
  inheritAttrs: false,
});

defineProps<{
  size?: "sm" | "md";
  disabled?: boolean;
}>();

const toggle = defineModel<boolean>();
</script>

<template>
  <label class="inline-flex items-center cursor-pointer">
    <input
      v-bind="$attrs"
      type="checkbox"
      v-model="toggle"
      class="sr-only peer"
      :disabled
    />
    <div
      class="relative bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"
      :class="{
        'w-9 h-5 after:h-4 after:w-4': size === 'sm',
        'w-11 h-6 after:h-5 after:w-5': size === 'md' || !size,
        'opacity-50 cursor-not-allowed': disabled,
      }"
    ></div>
  </label>
</template>
