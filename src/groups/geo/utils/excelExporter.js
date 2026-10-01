// src/groups/geo/utils/excelExporter.js
import * as XLSX from 'xlsx';

export const exportToExcel = (layers) => {
  // 过滤掉空白数据，构造导出行
  const dataToExport = layers.map(layer => {
    const row = { '对象名称': layer.objectName || '未命名图形' };
    
    // 遍历500个字段
    const fields = layer.fields || {};
    Object.keys(fields).forEach(key => {
      const idx = Number(key);
      const label = fields[idx]?.label || `信息${idx + 1}`;
      const value = fields[idx]?.value || '';
      if (label.trim() !== '' || value.trim() !== '') {
        row[label] = value;
      }
    });
    return row;
  }).filter(item => {
    // 过滤掉完全空白的行（只有对象名称，没有其他数据，且名称为默认）
    const keys = Object.keys(item);
    if (keys.length === 1 && (item['对象名称'] === '未命名图形' || item['对象名称'] === '默认名称')) return false;
    return true;
  });

  if (dataToExport.length === 0) {
    alert('当前没有任何有效的已录入信息！');
    return;
  }

  const ws = XLSX.utils.json_to_sheet(dataToExport);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '图形信息栏');
  
  const timestamp = new Date().toLocaleDateString('zh-CN').replace(/\//g, '-');
  XLSX.writeFile(wb, `图形信息栏导出_${timestamp}.xlsx`);
};