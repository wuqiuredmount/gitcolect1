import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import react from '@vitejs/plugin-react';
import { rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// 🚨 对外发布模式（--mode release）专用：构建完成后自动剔除内部目录。
// 为什么需要：vite build --watch 每次重建都会重新拷贝 public/，
//   把 release-public.mjs 手动剔除的内部文件恢复。此插件让剔除自动、幂等。
// 为什么只在 release 触发：普通 build / dev 需要这些文件（INTERNAL_TOOLS=true 时面板会读）。
// 依据：.agents/references/frontend-release-security.md
function stripInternalAfterBuild() {
  let isRelease = false;
  let root = process.cwd();
  // 内部目录（strict 档）：ai-import 覆盖全部 A 类文件，pending-unplaced 为待放置草稿
  const STRIP = ['dist/ai-import', 'dist/pending-unplaced'];
  return {
    name: 'strip-internal-after-build',
    apply: 'build',
    configResolved(config) {
      isRelease = config.mode === 'release';
      root = config.root;
    },
    closeBundle() {
      if (!isRelease) return;
      let removed = 0;
      for (const rel of STRIP) {
        const p = resolve(root, rel);
        if (existsSync(p)) {
          rmSync(p, { recursive: true, force: true });
          removed++;
        }
      }
      if (removed > 0) {
        console.log('\n🔒 [release] 已自动剔除 ' + removed + ' 个内部目录（ai-import / pending-unplaced）');
      }
    }
  };
}

export default defineConfig({
  // 🖊️ 第三产品（Excalidraw 白板，路线 A 自托管）：
  //    Excalidraw 是 React 组件库，需在 Vue 项目里加载 React 运行时，
  //    故同时启用 vue() 与 react()。
  //    react() 只负责 JSX 转换（本项目业务代码无 JSX，仅 EXCALIDRAW 的 esbuild 产物需要），
  //    对 .vue 文件无影响。
  plugins: [vue(), react(), stripInternalAfterBuild()],
  server: {
    // 强制锁定端口，防止因端口改变导致浏览器/Electron判断为新源，从而找不到原来的 IndexedDB 数据
    port: 5173,
    strictPort: true, // 如果端口被占用，直接报错退出，而不是自动切换到 5174
  },
  // 如果是打包后的 Electron，确保相对路径正确
  base: './',
  build: {
    // 🖊️ 白板体积大，单独成 chunk，保证 geo 等既有模块首屏不被拖累
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@excalidraw')) {
            return 'excalidraw';
          }
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/scheduler')) {
            return 'react-vendor';
          }
          return undefined;
        }
      }
    },
    chunkSizeWarningLimit: 3000
  },
  optimizeDeps: {
    // 预构建，避免 dev 首次打开白板时长时间白屏
    include: ['react', 'react-dom', 'react-dom/client', '@excalidraw/excalidraw']
  }
});
