// src/router/index.js
import { createRouter, createWebHashHistory } from 'vue-router';
import Home from '../views/Home.vue';
import GisApp from '../views/GisApp.vue';

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home
  },
  {
    // 🚨 核心修改：添加 :groupId? 参数，允许 /gis/geo 或 /gis/card
    path: '/gis/:groupId?',
    name: 'GisApp',
    component: GisApp
  }
];

// 🚨 2026-10-08 改为 hash 模式：
//   原因：base: './' 下，history 模式访问 /gis/geo 时，
//   浏览器把相对路径 ./assets/xxx.js 解析为 /gis/assets/xxx.js，
//   而文件实际在 /assets/，导致全部 404、Vue 无法挂载、页面白屏。
//   （点进来不刷新看不出来，一旦在工具页刷新或直接分享该链接即白屏）
//   hash 模式下路径为 /#/gis/geo，文档基址恒为站点根，资源解析始终正确。
//   Web 与 Electron(file://) 两种情况均正常。
const router = createRouter({
  history: createWebHashHistory(),
  routes
});

export default router;