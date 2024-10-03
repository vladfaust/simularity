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
    include: ["@simularity/api/lib/schema"],
    force: true,
  },
  build: {
    commonjsOptions: {
      include: [/@simularity\/api/, /node_modules/],
    },
  },
  esbuild: {
    supported: {
      "top-level-await": true, //browsers can handle top-level-await features
    },
  },
});
