<!-- src/components/tools/whiteboard/WhiteboardTool.vue -->
<!-- Excalidraw 白板 + 数据信息：轻量白板，独立运行，不依赖 IndexedDB -->
<template>
  <div class="wb-root">
    <div class="wb-toolbar">
      <div class="wb-colors">
        <button
          v-for="c in colors"
          :key="c"
          class="wb-color"
          :class="{ active: color === c && mode === 'draw' }"
          :style="{ background: c }"
          @click="selectColor(c)"
          :title="c"
        ></button>
      </div>

      <div class="wb-size">
        <span class="wb-label">粗细</span>
        <input type="range" min="1" max="24" step="1" v-model.number="size" />
      </div>

      <button class="wb-btn" :class="{ active: mode === 'draw' }" @click="mode = 'draw'">✏️ 画笔</button>
      <button class="wb-btn" :class="{ active: mode === 'erase' }" @click="mode = 'erase'">🩹 橡皮</button>
      <button class="wb-btn" @click="undo">↩️ 撤销</button>
      <button class="wb-btn" @click="clearAll">🗑️ 清空</button>

      <span class="wb-tip">内容自动保存在本地浏览器</span>
    </div>

    <div class="wb-body">
      <canvas
        ref="canvasRef"
        class="wb-canvas"
        @mousedown="onDown"
        @mousemove="onMove"
        @mouseup="onUp"
        @mouseleave="onUp"
      ></canvas>

      <aside class="wb-side">
        <h3 class="wb-side-title">📊 数据信息</h3>
        <p class="wb-side-hint">在此记录与白板相关的数据信息（自动本地保存）</p>
        <textarea
          v-model="notes"
          class="wb-notes"
          placeholder="例如：点位清单、统计口径、备注……"
        ></textarea>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';

const STORAGE_KEY = 'excalidraw_whiteboard_v1';

const canvasRef = ref(null);
const color = ref('#ef4444');
const size = ref(4);
const mode = ref('draw');
const notes = ref('');

const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#111827'];

// 非响应式，避免大量点触发深度代理
let strokes = [];
let drawing = false;
let current = null;

const selectColor = (c) => { color.value = c; mode.value = 'draw'; };

const getCtx = () => canvasRef.value?.getContext('2d');

const resizeCanvas = () => {
  const canvas = canvasRef.value;
  if (!canvas || !canvas.parentElement) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  const ctx = getCtx();
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  redraw();
};

const drawStroke = (ctx, stroke) => {
  if (!stroke.points.length) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.size;
  if (stroke.points.length === 1) {
    const p = stroke.points[0];
    ctx.beginPath();
    ctx.arc(p.x, p.y, stroke.size / 2, 0, Math.PI * 2);
    ctx.fillStyle = stroke.color;
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
  }
  ctx.restore();
};

const redraw = () => {
  const canvas = canvasRef.value;
  const ctx = getCtx();
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  strokes.forEach((s) => drawStroke(ctx, s));
};

const pos = (e) => {
  const rect = canvasRef.value.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
};

const onDown = (e) => {
  drawing = true;
  const p = pos(e);
  const isErase = mode.value === 'erase';
  current = {
    color: isErase ? '#ffffff' : color.value,
    size: isErase ? Math.max(size.value * 3, 12) : size.value,
    points: [p]
  };
  strokes.push(current);
  redraw();
  persist();
};

const onMove = (e) => {
  if (!drawing || !current) return;
  current.points.push(pos(e));
  redraw();
};

const onUp = () => {
  if (!drawing) return;
  drawing = false;
  current = null;
  persist();
};

const undo = () => {
  strokes.pop();
  redraw();
  persist();
};

const clearAll = () => {
  if (strokes.length && !confirm('确定清空白板内容吗？')) return;
  strokes = [];
  redraw();
  persist();
};

const persist = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ strokes, notes: notes.value }));
  } catch (e) {
    // 忽略存储失败（如超出配额）
  }
};

const restore = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data.strokes)) strokes = data.strokes;
    if (typeof data.notes === 'string') notes.value = data.notes;
  } catch (e) {
    // 忽略损坏数据
  }
};

watch(notes, persist);

let resizeObserver = null;

onMounted(() => {
  restore();
  resizeCanvas();
  if (window.ResizeObserver && canvasRef.value?.parentElement) {
    resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvasRef.value.parentElement);
  } else {
    window.addEventListener('resize', resizeCanvas);
  }
});

onBeforeUnmount(() => {
  if (resizeObserver) resizeObserver.disconnect();
  else window.removeEventListener('resize', resizeCanvas);
});
</script>

<style scoped>
.wb-root { display: flex; flex-direction: column; height: 100%; background: #f8fafc; }
.wb-toolbar {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 8px 16px; background: #ffffff; border-bottom: 1px solid #e5e7eb;
}
.wb-colors { display: flex; gap: 6px; }
.wb-color {
  width: 22px; height: 22px; border-radius: 50%; border: 2px solid #e5e7eb;
  cursor: pointer; padding: 0; transition: transform 0.15s ease;
}
.wb-color:hover { transform: scale(1.1); }
.wb-color.active { border-color: #0f766e; box-shadow: 0 0 0 2px #99f6e4; }
.wb-size { display: flex; align-items: center; gap: 6px; }
.wb-label { font-size: 12px; color: #64748b; }
.wb-size input[type="range"] { width: 90px; }
.wb-btn {
  padding: 5px 12px; font-size: 13px; border: 1px solid #e5e7eb; background: #f9fafb;
  color: #1f2937; border-radius: 6px; cursor: pointer; transition: all 0.15s ease;
}
.wb-btn:hover { background: #f0f7ff; border-color: #1890ff; color: #0066cc; }
.wb-btn.active { background: #e6f7ff; border-color: #1890ff; color: #0066cc; font-weight: 600; }
.wb-tip { font-size: 12px; color: #9ca3af; margin-left: auto; }
.wb-body { flex: 1; display: flex; overflow: hidden; }
.wb-canvas { flex: 1; display: block; background: #ffffff; cursor: crosshair; }
.wb-side {
  width: 280px; flex-shrink: 0; border-left: 1px solid #e5e7eb; background: #ffffff;
  padding: 16px; display: flex; flex-direction: column; gap: 8px;
}
.wb-side-title { margin: 0; font-size: 15px; font-weight: 600; color: #0f766e; }
.wb-side-hint { margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.5; }
.wb-notes {
  flex: 1; width: 100%; resize: none; border: 1px solid #e5e7eb; border-radius: 8px;
  padding: 10px; font-size: 13px; line-height: 1.6; color: #1f2937; outline: none;
}
.wb-notes:focus { border-color: #0f766e; box-shadow: 0 0 0 2px #ccfbf1; }
</style>
