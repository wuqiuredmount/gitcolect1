<template>
  <transition name="slide-fade">
    <div v-if="node" class="doc-panel">
      <div class="doc-header">
        <input type="text" v-model="localTitle" @blur="saveTitle" @keyup.enter="saveTitle" placeholder="默认名称（点击修改）" class="title-input" />
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>

      <div v-if="node.type !== 'marker'" class="style-panel">
        <div class="style-header" @click="isStyleExpanded = !isStyleExpanded">
          <span>🎨 图形样式</span>
          <span class="toggle-icon">{{ isStyleExpanded ? '▼' : '▶' }}</span>
        </div>
        <div v-show="isStyleExpanded" class="style-body">
          <div class="style-row">
            <label>边框颜色</label>
            <input type="color" :value="localStyle.color" @input="updateStyleField('color', $event.target.value)">
          </div>
          <div v-if="node.type === 'polygon' || node.type === 'rectangle'" class="style-row">
            <label>填充颜色</label>
            <input type="color" :value="localStyle.fillColor" @input="updateStyleField('fillColor', $event.target.value)">
          </div>
          <div v-if="node.type === 'polygon' || node.type === 'rectangle'" class="style-row">
            <label>填充透明度</label>
            <input type="range" min="0" max="1" step="0.05" :value="localStyle.fillOpacity" @input="updateStyleField('fillOpacity', parseFloat($event.target.value))">
          </div>
          <div class="style-row">
            <label>线宽 (px)</label>
            <input type="range" min="1" max="10" step="1" :value="localStyle.weight" @input="updateStyleField('weight', parseInt($event.target.value))">
          </div>
        </div>
      </div>

      <div class="doc-toolbar">
        <div class="toolbar-group">
          <button @mousedown.prevent="handleUndo" title="撤销 (Ctrl+Z)">↶ 撤销</button>
          <button @mousedown.prevent="handleRedo" title="重做 (Ctrl+Y)">↷ 重做</button>
        </div>
        <div class="toolbar-divider"></div>
        <div class="toolbar-group">
          <button @mousedown.prevent="triggerImageUpload">📷 插入图片</button>
        </div>
        <span class="doc-hint">限制约 100MB</span>
        <input type="file" ref="imageInputRef" accept="image/*" style="display: none" @change="handleImageUpload" />
      </div>

      <div ref="docEditorRef" class="doc-editor" contenteditable="true" @input="handleDocInput"></div>

      <div class="doc-footer">
        <p v-if="node.lat"><strong>坐标：</strong>{{ node.lat.toFixed(4) }}, {{ node.lng.toFixed(4) }}</p>
        <p><strong>类型：</strong>{{ node.type }}</p>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue';
const props = defineProps({ node: { type: Object, default: null } });
const emit = defineEmits(['close', 'update:title', 'update:content', 'update:style']);
const imageInputRef = ref(null); const docEditorRef = ref(null); const localTitle = ref(''); const isStyleExpanded = ref(true); 
const localStyle = ref({ color: '#3388ff', fillColor: '#3388ff', fillOpacity: 0.2, weight: 3 });

watch(() => props.node, (newNode) => {
  if (newNode) {
    localTitle.value = newNode.title || '默认名称';
    if (newNode.style) { localStyle.value = { ...newNode.style }; }
    nextTick(() => { if (docEditorRef.value) { docEditorRef.value.innerHTML = newNode.docHtml || '<p>开始编写您的文档...</p>'; } });
  }
}, { immediate: true });

const saveTitle = () => { if (localTitle.value.trim() === '') localTitle.value = '未命名'; emit('update:title', localTitle.value); };
const updateStyleField = (field, value) => { localStyle.value[field] = value; emit('update:style', localStyle.value); };
const handleUndo = () => { if (docEditorRef.value) { docEditorRef.value.focus(); document.execCommand('undo', false, null); handleDocInput(); } };
const handleRedo = () => { if (docEditorRef.value) { docEditorRef.value.focus(); document.execCommand('redo', false, null); handleDocInput(); } };
const triggerImageUpload = () => { imageInputRef.value.click(); };
const handleImageUpload = (event) => {
  const file = event.target.files[0]; if (!file) return;
  if (file.size > 5 * 1024 * 1024) { alert('单张图片建议不超过 5MB！'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    const imgTag = `<img src="${e.target.result}" style="display: block; max-width: 100%; border-radius: 2px; margin: 5px 0;" /><br/>`;
    if (docEditorRef.value) { docEditorRef.value.focus(); document.execCommand('insertHTML', false, imgTag); handleDocInput(); }
  };
  reader.readAsDataURL(file); event.target.value = '';
};
const handleDocInput = () => {
  if (docEditorRef.value && props.node) {
    const html = docEditorRef.value.innerHTML; const currentSize = new Blob([html]).size;
    if (currentSize > 100 * 1024 * 1024) alert('警告：文档内容已接近或超过 100MB 限制！');
    emit('update:content', html);
  }
};
</script>

<style scoped>
.doc-panel { position: absolute; top: 15px; right: 15px; width: 250px; height: calc(100vh - 80px); background: #fff; border-radius: 5px; box-shadow: 0 3px 10px rgba(0,0,0,0.3); z-index: 1000; display: flex; flex-direction: column; overflow: hidden; }
.doc-header { display: flex; justify-content: space-between; align-items: center; background: #2c3e50; padding: 6px 10px; }
.title-input { flex: 1; border: none; background: transparent; color: white; font-size: 11px; font-weight: bold; outline: none; border-bottom: 1px dashed transparent; transition: 0.2s; }
.title-input:hover, .title-input:focus { border-bottom: 1px dashed #7f8c8d; }
.title-input::placeholder { color: #bdc3c7; }
.close-btn { background: none; border: none; color: white; font-size: 14px; cursor: pointer; line-height: 1; margin-left: 5px; }
.close-btn:hover { color: #ff6b6b; }

.style-panel { background: #fafafa; border-bottom: 1px solid #ddd; }
.style-header { display: flex; justify-content: space-between; align-items: center; padding: 5px 10px; cursor: pointer; font-size: 10px; font-weight: bold; color: #444; }
.style-body { padding: 5px 10px; display: flex; flex-direction: column; gap: 5px; }
.style-row { display: flex; align-items: center; justify-content: space-between; font-size: 10px; color: #555; }
.style-row input[type="color"] { width: 24px; height: 16px; padding: 0; border: 1px solid #ccc; border-radius: 3px; cursor: pointer; background: none; }
.style-row input[type="range"] { width: 90px; }

.doc-toolbar { display: flex; align-items: center; background: #f8f9fa; padding: 5px 10px; border-bottom: 1px solid #ddd; gap: 5px; }
.toolbar-group { display: flex; align-items: center; gap: 3px; }
.toolbar-divider { width: 1px; height: 12px; background: #ccc; margin: 0 3px; }
.doc-toolbar button { background: #fff; border: 1px solid #ccc; padding: 3px 6px; border-radius: 3px; cursor: pointer; font-size: 10px; transition: 0.2s; color: #333; }
.doc-toolbar button:hover { background: #e9ecef; border-color: #bbb; }
.doc-toolbar button:active { background: #dde0e3; }
.doc-hint { font-size: 9px; color: #999; margin-left: auto; }

.doc-editor { flex: 1; padding: 10px 15px; overflow-y: auto; background: #fff; font-size: 11px; line-height: 1.8; color: #333; outline: none; text-align: left; word-break: keep-all; overflow-wrap: break-word; white-space: pre-wrap; }
.doc-editor::-webkit-scrollbar { width: 5px; }
.doc-editor::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
.doc-editor::-webkit-scrollbar-track { background: #f1f1f1; }

.doc-footer { background: #f8f9fa; border-top: 1px solid #ddd; padding: 5px 10px; font-size: 10px; color: #666; }
.doc-footer p { margin: 2px 0; }

.slide-fade-enter-active { transition: all 0.3s ease-out; }
.slide-fade-leave-active { transition: all 0.2s cubic-bezier(1, 0.5, 0.8, 1); }
.slide-fade-enter-from, .slide-fade-leave-to { transform: translateX(10px); opacity: 0; }
</style>