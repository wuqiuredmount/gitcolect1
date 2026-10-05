<template>
  <router-view></router-view>
</template>

<style>
/* 确保全屏没有滚动条 */
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #app { width: 100vw; height: 100vh; overflow: hidden; }
</style>