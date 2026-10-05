<!-- src/views/Home.vue -->
<template>
  <div class="container">
    <!-- 顶部区域（左右布局） -->
    <div class="header">
      <div class="header-content">
        <!-- 🚨 左侧：大图 -->
        <div class="hero-left">
          <!-- 请确保 public 文件夹下有 eagle-earth.png 这张图 -->
          <img src="/eagle-earth.png" alt="良件鹰眼平台" class="hero-image" />
        </div>

        <!-- 🚨 右侧：文字与入口 -->
        <div class="hero-right">
          <div class="title">良件（天津）数据信息技术有限公司</div>
          <div class="slogan">空间信息共享与集成 · 让数据在互动中创造价值</div>
          
          <!-- 两个工具组的独立入口 -->
          <div class="group-entry-container">
            <div class="group-card" @click="goToGisApp('geo')">
              <div class="group-icon">🗺️</div>
              <div class="group-name">信息分布共享与集成</div>
              <div class="group-desc">面向公众的鹰眼公共平台</div>
            </div>
            <div class="group-card" @click="goToGisApp('card')">
              <div class="group-icon">🗂️</div>
              <div class="group-name">自由信息分布标注与发布</div>
              <div class="group-desc">自定义地图与个人标注空间</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 主体内容区 -->
    <div class="main">
      <!-- 模块一：关于我们 -->
      <div class="card" id="about">
        <div class="h2">关于“良件”</div>
        <div class="p">
          <span>这是</span>
          <span class="highlight">“良件-空间信息共享与集成软件”</span>
          <span>。我们想要使基于空间分布的信息能在一个共享和能互动的平台上流通，促进社会经济信息开放，服务美好社区打造和区域经济发展，服务个人和企业客户获取有价值的基于空间位置分布的信息。</span>
        </div>
      </div>

      <!-- 模块二：信息发布与审核机制 -->
      <div class="card">
        <div class="h2">信息发布与审核机制</div>
        <div class="p">
          <span>平台鼓励信息的自由流通，同时为了保障信息质量，我们采用以下机制：</span>
        </div>
        <div class="info-list">
          <div class="info-item">
            <span class="strong">自由上传，定期审核：</span>
            <span>您发布的信息直接能够上传，但是我们会定期审核，不良信息和垃圾信息会被定期清理。</span>
          </div>
          <div class="info-item">
            <span class="strong">标准格式识别：</span>
            <span>我们发布的信息具有标准的格式，请您在浏览时，注意识别我司发布的官方信息和其他个体发布的信息。</span>
          </div>
        </div>
      </div>

      <!-- 模块三：软件结构 -->
      <div class="card">
        <div class="h2">软件结构设计</div>
        <div class="p">
          <span>我们的软件结构层次分明，由大到小分为以下层级：</span>
        </div>
        <div class="structure-tags">
          <div class="tag"><span>工具组</span></div>
          <div class="tag"><span>工具</span></div>
          <div class="tag"><span>小工具</span></div>
        </div>
        <div class="p" style="margin-top: 16px;">
          <span class="strong">个性化设置：</span>
          <span>在软件设置中，您可以自由决定“小工具”的开关，定制属于您的操作界面。</span>
        </div>
      </div>

      <!-- 模块四：联系方式 -->
      <div class="card contact-card">
        <div class="h2">联系我们</div>
        <div class="p">
          <span>如果您有任何疑问或合作意向，欢迎随时与我们联系。</span>
        </div>
        <div class="p" style="margin-top: 16px; font-weight: 500;">
          <span>邮箱：</span>
          <span class="email">1990568835@qq.com</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';

const router = useRouter();

// 🚨 接收 groupId 参数
const goToGisApp = (groupId) => {
  router.push(`/gis/${groupId}`);
};
</script>

<style scoped>
/* 基础设置 */
* { box-sizing: border-box; }

/* 🚨 核心修复：改用固定高度 height，并开启内部滚动 */
.container {
  font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  line-height: 1.8;
  color: #333;
  background-color: #f8fafc;
  height: 100vh;       /* 👈 修复：改为固定高度，撑满外层 App */
  overflow-y: auto;    /* 👈 修复：让内部产生滚动条 */
  padding-bottom: 40px;
}

/* ==================== 🚨 核心修改区域 ==================== */
/* 顶部区域：改为左右结构 */
.header {
  padding: 60px 20px;
  background: #e6f7f6;
  border-bottom: 1px solid #d1eae8;
  display: flex;
  justify-content: center;
}

.header-content {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 60px;
  max-width: 1100px;
  width: 100%;
}

/* 左侧大图 */
.hero-left {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
}
.hero-image {
  width: 100%;
  max-width: 320px;
  height: auto;
  filter: drop-shadow(0 10px 15px rgba(15, 118, 110, 0.15));
  animation: float 6s ease-in-out infinite;
}

/* 左侧图片浮动动画（可选，让画面更生动） */
@keyframes float {
  0% { transform: translateY(0px); }
  50% { transform: translateY(-10px); }
  100% { transform: translateY(0px); }
}

/* 右侧文字 */
.hero-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.title {
  font-size: 28px;
  font-weight: bold;
  color: #0f766e;
  letter-spacing: 1px;
  text-align: left;
  margin-bottom: 12px;
}
.slogan {
  color: #0f766e;
  font-weight: 500;
  font-size: 16px;
  margin-bottom: 30px;
  opacity: 0.9;
  text-align: left;
}

/* 入口卡片样式 */
.group-entry-container {
  display: flex;
  gap: 20px;
  justify-content: flex-start;
  flex-wrap: wrap;
}
.group-card {
  background: white;
  padding: 20px 24px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  transition: all 0.3s ease;
  border: 1px solid #d1eae8;
  flex: 1;
  min-width: 220px;
  text-align: center;
}
.group-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 24px rgba(15, 118, 110, 0.15);
  border-color: #0f766e;
}
.group-icon { font-size: 28px; margin-bottom: 8px; }
.group-name { font-size: 15px; font-weight: bold; color: #0f766e; margin-bottom: 6px; }
.group-desc { font-size: 12px; color: #64748b; }

/* ==================== 以下部分保持原样 ==================== */

/* 主体内容区 */
.main {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px 20px;
}

/* 卡片样式 */
.card {
  background: white;
  border-radius: 16px;
  padding: 28px 24px;
  margin-bottom: 24px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
  border: 1px solid #f1f5f9;
}
.h2 {
  color: #0f766e;
  font-size: 20px;
  font-weight: bold;
  display: block;
  margin-top: 0;
  margin-bottom: 16px;
  border-left: 4px solid #0f766e;
  padding-left: 12px;
  line-height: 1.2;
}
.p {
  margin-top: 0;
  margin-bottom: 16px;
  color: #475569;
  font-size: 15px;
}

/* 强调样式 */
.highlight { color: #0f766e; font-weight: 600; }
.strong { font-weight: bold; }

/* 软件结构标签 */
.structure-tags {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 12px;
}
.tag {
  background: #e6f7f6;
  padding: 6px 14px;
  border-radius: 20px;
}
.tag span {
  color: #0f766e;
  font-size: 14px;
  font-weight: 500;
}

/* 列表样式 */
.info-list { margin: 0; }
.info-item {
  position: relative;
  padding-left: 24px;
  margin-bottom: 12px;
  color: #475569;
  font-size: 15px;
}
.info-item:last-child { margin-bottom: 0; }
.info-item::before {
  content: "•";
  color: #0f766e;
  font-weight: bold;
  font-size: 20px;
  position: absolute;
  left: 6px;
  top: -2px;
}

/* 底部联系卡片 */
.contact-card { background: #0f766e; border: none; }
.contact-card .h2 { color: white; border-left-color: white; }
.contact-card .p { color: #ccfbf1; }
.contact-card .email { color: #ffffff; text-decoration: underline; }
</style>