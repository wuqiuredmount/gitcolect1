// src/groups/geo/utils/exporter.js
import * as XLSX from 'xlsx';

/**
 * 导出信息栏数据到 Excel（严格遵循 信息栏数据导出格式01.xlsx）
 * @param {Array} layers 所有图形图层数据
 * @param {Boolean} exportAll 是否导出所有图形（false 则只导出已录入信息的图形）
 */
export const exportToExcel = (layers, exportAll = true) => {
  if (!layers || layers.length === 0) {
    alert('当前没有任何图形数据！');
    return;
  }

  // 1. 过滤数据：如果非全量导出，仅保留在信息栏有录入数据的图形
  const validLayers = exportAll ? layers : layers.filter(layer => {
    if (!layer.fields) return false;
    return Object.values(layer.fields).some(f => f.value && String(f.value).trim() !== '');
  });

  if (validLayers.length === 0) {
    alert('当前没有任何已录入信息的图形！');
    return;
  }

  // 2. 构建表头（🚨 核心修改：动态读取用户填写的名称）
  const row1 = ["LJ信息栏导出数据表"];
  for (let i = 0; i < 500; i++) row1.push("");

  // 建立索引到标签的映射，默认是"信息的名称n"
  const labelMap = {};
  for (let i = 0; i < 500; i++) {
    labelMap[i] = `信息的名称${i + 1}`;
  }

  // 遍历所有将要导出的数据，如果字段里有自定义 label，则替换默认名称
  validLayers.forEach(layer => {
    if (layer.fields) {
      layer.fields.forEach((field, idx) => {
        // 如果 label 存在，且不是默认名称，也不是空白，则记录下来
        if (field.label && field.label.trim() !== '' && field.label !== `信息的名称${idx + 1}`) {
          // 优先使用第一个遇到的自定义名称（防止不同图形同一个位置标签冲突导致表头混乱）
          if (labelMap[idx] === `信息的名称${idx + 1}`) {
            labelMap[idx] = field.label.trim();
          }
        }
      });
    }
  });

  const row2 = ["对象名称"];
  for (let i = 0; i < 500; i++) {
    row2.push(labelMap[i]);
  }

  // 3. 构建数据行
  const dataToExport = [row1, row2];
  validLayers.forEach(layer => {
    const row = [];
    row.push(layer.objectName || layer.title || "未命名图形");

    for (let i = 0; i < 500; i++) {
      const field = layer.fields && layer.fields[i];
      row.push(field && field.value ? field.value : '');
    }
    dataToExport.push(row);
  });

  // 4. 创建工作簿
  const ws = XLSX.utils.aoa_to_sheet(dataToExport);
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 500 } }];
  
  const cols = [{ wch: 20 }];
  for (let i = 0; i < 500; i++) {
    cols.push({ wch: 15 });
  }
  ws['!cols'] = cols;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '图形信息栏');
  
  const timestamp = new Date().toLocaleDateString('zh-CN').replace(/\//g, '-');
  XLSX.writeFile(wb, `信息栏导出_${timestamp}.xlsx`);
};

/**
 * 导出富文本数据到 Word（严格遵循 富文本编辑器文档导出格式.docx）
 * @param {Array} layers 所有图形图层数据（需包含 docHtml 字段）
 */
export const exportToWord = (layers) => {
  if (!layers || layers.length === 0) {
    alert('当前没有任何数据！');
    return;
  }

  // 过滤出有文档内容的图形
  const validLayers = layers.filter(layer => layer.docHtml && layer.docHtml.trim() !== '');

  if (validLayers.length === 0) {
    alert('当前没有任何富文本内容可供导出！');
    return;
  }

  let bodyHtml = '';
  validLayers.forEach((layer, index) => {
    bodyHtml += `
      <div style="margin-bottom: 30px; font-family: 'Microsoft YaHei', sans-serif;">
        <p style="margin: 4px 0; font-size: 14px;"><b>序号：</b>${index + 1}</p>
        <p style="margin: 4px 0; font-size: 14px;"><b>关联数据统一编码：</b>${layer.id}</p>
        <p style="margin: 4px 0; font-size: 14px;"><b>文档名称：</b>${layer.title || layer.objectName || '未命名'}</p>
        <p style="margin: 4px 0; font-size: 14px;"><b>文档内容：</b></p>
        <div style="margin-top: 5px; font-size: 14px;">${layer.docHtml}</div>
        <hr style="border: 1px dashed #ccc; margin: 20px 0;" />
      </div>
    `;
  });

  const fullHtml = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset="utf-8"><title>富文本导出</title></head>
    <body>${bodyHtml}</body>
    </html>
  `;

  const blob = new Blob([fullHtml], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `富文本导出_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.doc`;
  link.click();
  URL.revokeObjectURL(url);
};