import { defineConfig } from "vite";
export default defineConfig({
  build: {
    target: "es2022", emptyOutDir: false,
    lib: { entry: "src/core/index.ts", formats: ["es"], fileName: () => "index.js" },
    rollupOptions: { external: ["yaml"] },
  },
});
