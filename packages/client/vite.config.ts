import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": "/src",
    },
    preserveSymlinks: true,
  },
  optimizeDeps: {
    // NOTE: When changing any of these, the Vite server must be restarted.
    include: [
      "@simularity/api-sdk/v1/auth/nonce/get",
      "@simularity/api-sdk/v1/completions/create",
      "@simularity/api-sdk/v1/models/index",
      "@simularity/api-sdk/v1/tts/create",
      "@simularity/api-sdk/v1/account/balance",
      "@simularity/api-sdk/v1/account",
    ],
    force: true,
  },
  build: {
    commonjsOptions: {
      include: [/@simularity\/api-sdk/, /node_modules/],
    },
  },
  esbuild: {
    supported: {
      "top-level-await": true, //browsers can handle top-level-await features
    },
  },
});
