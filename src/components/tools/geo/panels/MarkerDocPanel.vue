<template>
  <transition name="slide-fade">
    <div v-if="node" class="doc-panel">
      <div class="doc-header">
        <div class="panel-title">📝 富文本编辑器</div>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <div class="doc-title-bar">
        <label class="doc-title-label">文档名称：</label>
        <input type="text" v-model="localTitle" placeholder="请输入文档名称" class="title-input" />
      </div>

      <!-- 样式面板（默认折叠） -->
      <div class="style-panel">
        <div class="style-header" @click="isStyleExpanded = !isStyleExpanded">
          <span>🎨 图形样式</span>
          <span class="toggle-icon">{{ isStyleExpanded ? '▼' : '▶' }}</span>
        </div>
        <div v-show="isStyleExpanded" class="style-body">
          
          <template v-if="node.type !== 'marker'">
            <div class="style-row">
              <label>边框颜色</label>
              <input type="color" :value="localStyle.color" @input="updateStyleField('color', $event.target.value)" />
            </div>
            <div v-if="node.type === 'polygon' || node.type === 'rectangle' || node.type === 'circle' || node.type === 'ellipse'" class="style-row">
              <label>填充颜色</label>
              <input type="color" :value="localStyle.fillColor" @input="updateStyleField('fillColor', $event.target.value)" />
            </div>
            <div v-if="node.type === 'polygon' || node.type === 'rectangle' || node.type === 'circle' || node.type === 'ellipse'" class="style-row">
              <label>填充透明度</label>
              <input type="range" min="0" max="1" step="0.05" :value="localStyle.fillOpacity" @input="updateStyleField('fillOpacity', parseFloat($event.target.value))" />
            </div>
            <div class="style-row">
              <label>线宽 (px)</label>
              <input type="range" min="1" max="200" step="1" :value="localStyle.weight" @input="updateStyleField('weight', parseInt($event.target.value))" />
            </div>
          </template>

          <template v-else>
            <div class="style-row">
              <label>图标颜色</label>
              <input type="color" :value="localStyle.color || '#1890ff'" @input="updateStyleField('color', $event.target.value)" />
            </div>
            <div class="style-row">
              <label>图标透明度</label>
              <input type="range" min="0.1" max="1" step="0.1" :value="localStyle.fillOpacity !== undefined ? localStyle.fillOpacity : 1" @input="updateStyleField('fillOpacity', parseFloat($event.target.value))" />
            </div>
            <div class="style-row">
              <label>图标大小 (px)</label>
              <input type="range" min="16" max="64" step="4" :value="localStyle.iconSize || 32" @input="updateStyleField('iconSize', parseInt($event.target.value))" />
            </div>
            
            <div class="icon-selector-section">
              <label>图标样式 (20种)</label>
              <div class="icon-grid">
                <div 
                  v-for="icon in MARKER_ICONS" 
                  :key="icon.id" 
                  class="icon-item" 
                  :class="{ active: localStyle.iconType === icon.id }"
                  @click="updateStyleField('iconType', icon.id)"
                  :title="icon.name"
                >
                  <div v-html="getIconPreview(icon.svg)" style="width: 24px; height: 24px;"></div>
                </div>
              </div>
            </div>
          </template>

        </div>
      </div>

      <!-- 工具栏 -->
      <div class="doc-toolbar">
        <div class="toolbar-group">
          <button @mousedown.prevent="handleUndo" title="撤销 (Ctrl+Z)">↺ 撤销</button>
          <button @mousedown.prevent="handleRedo" title="重做 (Ctrl+Y)">↻ 重做</button>
        </div>
        <div class="toolbar-divider"></div>
        <div class="toolbar-group">
          <button @mousedown.prevent="triggerImageUpload">🖼 插入图片</button>
        </div>
        <span class="doc-hint">限制约 100MB</span>
        <input type="file" ref="imageInputRef" accept="image/*" style="display: none" @change="handleImageUpload" />
      </div>

      <!-- 编辑器区域 -->
      <div
        ref="docEditorRef"
        class="doc-editor"
        contenteditable="true"
        placeholder="开始编写您的文档..."
        @dblclick="handleEditorDblClick"
      ></div>

      <!-- 底部操作区 -->
      <div class="doc-actions">
        <div class="doc-footer-info">
          <p v-if="node.lat"><strong>坐标：</strong>{{ node.lat.toFixed(4) }}, {{ node.lng.toFixed(4) }}</p>
          <p><strong>类型：</strong>{{ node.type }}</p>
        </div>
        <div class="action-buttons">
          <button class="action-btn save-btn" @click="handleSave()">保存文档</button>
          <button class="action-btn export-btn" @click="handleExportDocx">导出为 Word</button>
        </div>
      </div>

      <transition name="toast-fade">
        <div v-if="showSaveToast" class="save-toast">保存已完成</div>
      </transition>
    </div>
  </transition>

  <!-- 全屏图片预览弹窗 -->
  <div 
    v-if="previewVisible" 
    class="preview-overlay" 
    @wheel.prevent="handlePreviewWheel" 
    @mousedown="handlePreviewMouseDown"
  >
    <img 
      :src="previewSrc" 
      class="preview-image" 
      :style="previewImageStyle" 
      @dblclick.stop="closePreview"
    />
    <div class="preview-tips">滚轮缩放 | 拖拽移动 | 双击关闭</div>
    <button class="preview-close-btn" @click.stop="closePreview">✕</button>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onBeforeUnmount, computed } from 'vue';
import { saveDocument, getDocument } from '../../../../groups/geo/utils/documentStore.js';
import { MARKER_ICONS } from '../../../../groups/geo/utils/markerIcons.js';

const props = defineProps({
  node: { type: Object, default: null },
  toolId: { type: String, default: 'default' },
  fileId: { type: String, default: 'default-file' } // 🚨 新增：接收文件编号
});

const emit = defineEmits(['close', 'update:title', 'update:content', 'update:style']);

const imageInputRef = ref(null);
const docEditorRef = ref(null);
const localTitle = ref('');
const isStyleExpanded = ref(false);
const localStyle = ref({ color: '#3388ff', fillColor: '#3388ff', fillOpacity: 0.2, weight: 3, iconType: 0, iconSize: 32 });
const showSaveToast = ref(false);

// 图片预览状态
const previewVisible = ref(false);
const previewSrc = ref('');
const scale = ref(1);
const translateX = ref(0);
const translateY = ref(0);
const isDragging = ref(false);
const startX = ref(0);
const startY = ref(0);

const previewImageStyle = computed(() => {
  return {
    transform: `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value})`,
    cursor: isDragging.value ? 'grabbing' : 'grab',
    transition: isDragging.value ? 'none' : 'transform 0.1s ease-out'
  };
});

const setEditorContent = (html) => {
  if (docEditorRef.value) {
    if (html.includes('开始编写您的文档...') || html === '<p></p>' || html === '<br>') {
      docEditorRef.value.innerHTML = '';
    } else {
      docEditorRef.value.innerHTML = html;
    }
  } else {
    setTimeout(() => setEditorContent(html), 300);
  }
};

watch(() => props.node, async (newNode, oldNode) => {
  if (newNode && oldNode && newNode.id === oldNode.id) return;

  if (oldNode && docEditorRef.value) {
    const finalTitle = localTitle.value.trim();
    let html = docEditorRef.value.innerHTML;
    if (html === '<br>' || html === '<p><br></p>') html = '';
    await saveDocument(props.toolId, props.fileId, oldNode.id, html); // 🚨 传入 fileId
    emit('update:title', { id: oldNode.id, title: finalTitle });
    emit('update:content', { id: oldNode.id, docHtml: html });
  }

  if (newNode) {
    const nodeId = newNode.id;
    const toolId = props.toolId;
    const title = newNode.title;
    localTitle.value = title || '';
    
    if (newNode.style) {
      localStyle.value = { 
        color: '#1890ff', iconType: 0, iconSize: 32, fillOpacity: 1, 
        ...newNode.style 
      };
    }

    const storedHtml = await getDocument(toolId, props.fileId, nodeId); // 🚨 传入 fileId
    const initialHtml = storedHtml || newNode.docHtml || '';
    nextTick(() => {
      setEditorContent(initialHtml);
    });
  }
}, { immediate: true });

onBeforeUnmount(async () => {
  if (props.node && docEditorRef.value) {
    const finalTitle = localTitle.value.trim();
    let html = docEditorRef.value.innerHTML;
    if (html === '<br>' || html === '<p><br></p>') html = '';
    await saveDocument(props.toolId, props.fileId, props.node.id, html); // 🚨 传入 fileId
    emit('update:title', { id: props.node.id, title: finalTitle });
    emit('update:content', { id: props.node.id, docHtml: html });
  }
});

const updateStyleField = (field, value) => {
  localStyle.value[field] = value;
  emit('update:style', localStyle.value);
};

const getIconPreview = (svgStr) => {
  return svgStr.replace(/#COLOR#/g, '#1890ff'); 
};

const handleUndo = () => { if (docEditorRef.value) { docEditorRef.value.focus(); document.execCommand('undo', false, null); } };
const handleRedo = () => { if (docEditorRef.value) { docEditorRef.value.focus(); document.execCommand('redo', false, null); } };
const triggerImageUpload = () => { imageInputRef.value.click(); };

const handleImageUpload = (event) => {
  const file = event.target.files[0]; if (!file) return;
  if (file.size > 5 * 1024 * 1024) { alert('单张图片建议不超过 5MB!'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    const imgTag = `<img src="${e.target.result}" alt="插入图片" /><br/>`;
    if (docEditorRef.value) { docEditorRef.value.focus(); document.execCommand('insertHTML', false, imgTag); }
  };
  reader.readAsDataURL(file); event.target.value = '';
};

const handleEditorDblClick = (e) => {
  if (e.target.tagName === 'IMG') {
    previewSrc.value = e.target.src;
    previewVisible.value = true;
    scale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
  }
};

const handlePreviewWheel = (e) => {
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  scale.value = Math.min(Math.max(0.2, scale.value + delta), 5); 
};

const handlePreviewMouseDown = (e) => {
  if (e.target.tagName === 'IMG') {
    isDragging.value = true;
    startX.value = e.clientX - translateX.value;
    startY.value = e.clientY - translateY.value;
    document.addEventListener('mousemove', handlePreviewMouseMove);
    document.addEventListener('mouseup', handlePreviewMouseUp);
  }
};

const handlePreviewMouseMove = (e) => {
  if (isDragging.value) {
    translateX.value = e.clientX - startX.value;
    translateY.value = e.clientY - startY.value;
  }
};

const handlePreviewMouseUp = () => {
  isDragging.value = false;
  document.removeEventListener('mousemove', handlePreviewMouseMove);
  document.removeEventListener('mouseup', handlePreviewMouseUp);
};

const closePreview = () => {
  previewVisible.value = false;
  previewSrc.value = '';
  scale.value = 1;
  translateX.value = 0;
  translateY.value = 0;
};

const handleSave = async (silent = false) => {
  if (docEditorRef.value && props.node) {
    const nodeId = props.node.id;
    const toolId = props.toolId;
    const finalTitle = localTitle.value.trim();
    let html = docEditorRef.value.innerHTML;
    if (html === '<br>' || html === '<p><br></p>') html = '';

    await saveDocument(toolId, props.fileId, nodeId, html); // 🚨 传入 fileId
    emit('update:title', { id: nodeId, title: finalTitle }); 
    emit('update:content', { id: nodeId, docHtml: html });

    if (!silent) {
      showSaveToast.value = true; 
      setTimeout(() => { showSaveToast.value = false; }, 1500);
    }
  }
};

const handleExportDocx = () => {
  if (!docEditorRef.value) return;
  const htmlContent = docEditorRef.value.innerHTML;
  if (!htmlContent || htmlContent === '<br>' || htmlContent === '<p><br></p>') { alert('文档内容为空，无需导出！'); return; }
  const docName = localTitle.value || '未命名文档';
  const titleHtml = `<p style="font-size: 16px; font-weight: bold; margin-bottom: 10px;">文档名称: ${docName}</p>`;
  const fullHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset="utf-8"><title>${docName}</title></head><body>${titleHtml}${htmlContent}</body></html>`;
  const blob = new Blob([fullHtml], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `${docName}.doc`; link.click(); URL.revokeObjectURL(url);
};
</script>

<style scoped>
/* 样式完全保持原样 */
.doc-panel { position: absolute; top: 15px; right: 15px; width: 380px; bottom: 80px; background: #fff; border-radius: 5px; box-shadow: 0 3px 10px rgba(0,0,0,0.3); z-index: 1000; display: flex; flex-direction: column; overflow: hidden; }
.doc-header { display: flex; justify-content: space-between; align-items: center; background: #2c3e50; padding: 8px 15px; color: white; }
.panel-title { font-size: 14px; font-weight: 600; }
.close-btn { background: none; border: none; color: white; font-size: 20px; cursor: pointer; line-height: 1; margin-left: 5px; }
.close-btn:hover { color: #ff6b6b; }
.doc-title-bar { display: flex; align-items: center; padding: 8px 15px; background: #f8f9fa; border-bottom: 1px solid #ddd; }
.doc-title-label { font-size: 12px; color: #666; white-space: nowrap; margin-right: 5px; }
.title-input { flex: 1; border: 1px solid #ddd; border-radius: 3px; padding: 4px 8px; font-size: 13px; outline: none; }
.title-input:focus { border-color: #1890ff; }
.title-input::placeholder { color: #aaa; }
.style-panel { background: #fafafa; border-bottom: 1px solid #ddd; }
.style-header { display: flex; justify-content: space-between; align-items: center; padding: 5px 15px; cursor: pointer; font-size: 11px; font-weight: bold; color: #444; }
.style-body { padding: 5px 15px; display: flex; flex-direction: column; gap: 5px; max-height: 250px; overflow-y: auto; }
.style-row { display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: #555; }
.style-row input[type="color"] { width: 24px; height: 16px; padding: 0; border: 1px solid #ccc; border-radius: 3px; cursor: pointer; background: none; }
.style-row input[type="range"] { width: 90px; }
.doc-toolbar { display: flex; align-items: center; background: #f8f9fa; padding: 8px 15px; border-bottom: 1px solid #ddd; gap: 5px; }
.toolbar-group { display: flex; align-items: center; gap: 3px; }
.toolbar-divider { width: 1px; height: 12px; background: #ccc; margin: 0 3px; }
.doc-toolbar button { background: #fff; border: 1px solid #ccc; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px; transition: 0.2s; color: #333; }
.doc-toolbar button:hover { background: #e9ecef; border-color: #bbb; }
.doc-toolbar button:active { background: #dde0e3; }
.doc-hint { font-size: 10px; color: #999; margin-left: auto; }
.doc-editor { flex: 1; padding: 15px 20px; overflow-y: auto; background: #fff; font-size: 14px; line-height: 1.8; color: #333; outline: none; text-align: left; word-break: keep-all; overflow-wrap: break-word; white-space: pre-wrap; }
.doc-editor::-webkit-scrollbar { width: 6px; }
.doc-editor::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
.doc-editor::-webkit-scrollbar-track { background: #f1f1f1; }
.doc-editor:empty::before { content: attr(placeholder); color: #aaa; pointer-events: none; display: block; }
.doc-editor:empty:focus::before { content: ""; }
.doc-editor :deep(img) { max-width: 100% !important; height: auto !important; display: block; margin: 8px 0; border-radius: 4px; cursor: zoom-in; box-sizing: border-box; user-select: none; }
.doc-actions { background: #f8f9fa; border-top: 1px solid #ddd; padding: 10px 15px; display: flex; flex-direction: column; gap: 10px; }
.doc-footer-info { font-size: 11px; color: #666; }
.doc-footer-info p { margin: 2px 0; }
.action-buttons { display: flex; gap: 10px; }
.action-btn { flex: 1; padding: 6px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; transition: 0.2s; }
.save-btn { background: #1890ff; color: white; }
.save-btn:hover { background: #40a9ff; }
.export-btn { background: #52c41a; color: white; }
.export-btn:hover { background: #73d13d; }
.save-toast { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0, 0, 0, 0.75); color: #fff; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: bold; z-index: 9999; pointer-events: none; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
.toast-fade-enter-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.toast-fade-leave-active { transition: opacity 0.5s ease, transform 0.5s ease; }
.toast-fade-enter-from { opacity: 0; transform: translate(-50%, -40%); }
.toast-fade-leave-to { opacity: 0; transform: translate(-50%, -60%); }
.slide-fade-enter-active { transition: all 0.3s ease-out; }
.slide-fade-leave-active { transition: all 0.2s cubic-bezier(1, 0.5, 0.8, 1); }
.slide-fade-enter-from, .slide-fade-leave-to { transform: translateX(20px); opacity: 0; }
.icon-selector-section { margin-top: 10px; border-top: 1px dashed #eee; padding-top: 8px; }
.icon-selector-section label { display: block; font-size: 11px; color: #555; margin-bottom: 5px; font-weight: bold; }
.icon-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
.icon-item { width: 36px; height: 36px; border: 1px solid #ddd; border-radius: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer; background: #fff; transition: all 0.2s; }
.icon-item:hover { border-color: #1890ff; background: #e6f7ff; }
.icon-item.active { border-color: #1890ff; background: #bae0ff; box-shadow: 0 0 0 1px #1890ff; }
.preview-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.85); z-index: 99999; display: flex; justify-content: center; align-items: center; overflow: hidden; user-select: none; }
.preview-image { max-width: 90vw; max-height: 90vh; object-fit: contain; will-change: transform; user-select: none; }
.preview-close-btn { position: absolute; top: 20px; right: 30px; background: rgba(255, 255, 255, 0.2); border: 1px solid rgba(255, 255, 255, 0.5); color: #fff; font-size: 24px; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; z-index: 100000; }
.preview-close-btn:hover { background: rgba(255, 255, 255, 0.4); transform: scale(1.1); }
.preview-tips { position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%); color: rgba(255, 255, 255, 0.7); font-size: 14px; background: rgba(0, 0, 0, 0.5); padding: 8px 16px; border-radius: 20px; pointer-events: none; }
</style>