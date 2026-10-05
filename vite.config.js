import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    // 强制锁定端口，防止因端口改变导致浏览器/Electron判断为新源，从而找不到原来的 IndexedDB 数据
    port: 5173,
    strictPort: true, // 如果端口被占用，直接报错退出，而不是自动切换到 5174
  },
  // 如果是打包后的 Electron，确保相对路径正确
  base: './',
});