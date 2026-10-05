// src/main.js
import { createApp } from 'vue';
import App from './App.vue';
import router from './router'; // 引入路由
import './style.css'; // 如果有全局样式

const app = createApp(App);
app.use(router);
app.mount('#app');