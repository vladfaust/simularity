import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import svgLoader from "vite-svg-loader";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), svgLoader()],
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
});
