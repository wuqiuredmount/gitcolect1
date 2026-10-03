// src/groups/geo/utils/excelExporter.js
import * as XLSX from 'xlsx';

/**
 * 导出信息栏数据到 Excel
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
    // 只要有一个字段的值不为空，就认为录入了信息
    return Object.values(layer.fields).some(f => f.value && String(f.value).trim() !== '');
  });

  if (validLayers.length === 0) {
    alert('当前没有任何已录入信息的图形！');
    return;
  }

  // 2. 构建表头
  // 第一行：大标题（合并单元格）
  const row1 = ["LJ信息栏导出数据表"];
  for (let i = 0; i < 500; i++) row1.push(""); // 占位，用于后续合并

  // 第二行：列头，严格遵循"对象名称n"和"信息的名称n"的格式
  const row2 = ["对象名称"];
  for (let i = 1; i <= 500; i++) {
    row2.push(`信息的名称${i}`);
  }

  // 3. 构建数据行
  const dataToExport = [row1, row2];

  validLayers.forEach(layer => {
    const row = [];
    // A列：对象名称（如果没有则使用“未命名图形”）
    row.push(layer.objectName || "未命名图形");

    // B列到SA列：依次填入信息内容1到信息内容500
    for (let i = 0; i < 500; i++) {
      const field = layer.fields && layer.fields[i];
      // 如果字段存在且有值，填入；否则填入空字符串
      row.push(field && field.value ? field.value : '');
    }
    dataToExport.push(row);
  });

  // 4. 创建工作簿
  const ws = XLSX.utils.aoa_to_sheet(dataToExport);

  // 5. 设置第一行合并单元格
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 500 } } // 合并第一行的A列到SA列
  ];

  // 6. 设置列宽（让表格更易读）
  const cols = [{ wch: 20 }]; // A列宽度
  for (let i = 0; i < 500; i++) {
    cols.push({ wch: 15 }); // 后续列宽度
  }
  ws['!cols'] = cols;

  // 7. 生成并下载
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '图形信息栏');
  
  const timestamp = new Date().toLocaleDateString('zh-CN').replace(/\//g, '-');
  XLSX.writeFile(wb, `信息栏导出_${timestamp}.xlsx`);
};