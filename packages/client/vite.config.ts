import { sentryVitePlugin } from "@sentry/vite-plugin";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

function requireEnv(id: string): string {
  if (process.env[id]) return process.env[id]!;
  else throw `Missing env var ${id}`;
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    process.env.VITE_SENTRY_AUTH_TOKEN &&
      sentryVitePlugin({
        org: requireEnv("VITE_SENTRY_ORG"),
        project: requireEnv("VITE_SENTRY_PROJECT"),
        authToken: requireEnv("VITE_SENTRY_AUTH_TOKEN"),
      }),
  ],
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
    sourcemap: true,
  },
  esbuild: {
    supported: {
      "top-level-await": true, //browsers can handle top-level-await features
    },
  },
});
