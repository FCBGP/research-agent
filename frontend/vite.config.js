import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  base: "./",  // 便于 Electron 以 file:// 加载
  build: { outDir: "dist" },
});