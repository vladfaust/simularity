import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  optimizeDeps: {
    include: [
      "@simularity/api-sdk/v1/completions/create",
      "@simularity/api-sdk/v1/models/index",
      "@simularity/api-sdk/v1/users/get",
    ],
    force: true,
  },
  build: {
    commonjsOptions: {
      include: [/@simularity\/api-sdk/, /node_modules/],
    },
  },
});
