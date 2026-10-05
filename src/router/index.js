// src/router/index.js
import { createRouter, createWebHistory } from 'vue-router';
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

const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router;