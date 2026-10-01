// src/groups/geo/utils/fileManager.js

/**
 * 触发浏览器下载文件
 */
export const downloadFile = (content, fileName, mimeType = 'application/json') => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

/**
 * 将图片文件转换为 Base64
 */
export const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
};

/**
 * 将绘制图层数据序列化为 JSON
 */
export const serializeAnnotations = (drawnLayers) => {
  return drawnLayers.map(item => {
    const layer = item.layerRef;
    let coords = [];
    if (layer.getLatLngs && layer.getLatLngs().length > 0) {
      coords = layer.getLatLngs()[0].map(pt => [pt.lat, pt.lng]);
    } else if (layer.getLatLng) {
      coords = [[layer.getLatLng().lat, layer.getLatLng().lng]];
    }
    return {
      id: item.id,
      type: item.type,
      title: item.title,
      docHtml: item.docHtml,
      style: item.style,
      coords: coords
    };
  });
};

/**
 * 将当前项目打包为 JSON 字符串
 */
export const packageProject = (baseImage, width, height, annotations) => {
  return JSON.stringify({
    version: '1.0',
    timestamp: new Date().getTime(),
    width: width,
    height: height,
    baseImage: baseImage,
    annotations: annotations
  }, null, 2); // 格式化，方便后续单独查看或编辑
};

/**
 * 解析项目 JSON 字符串
 */
export const parseProject = (fileContent) => {
  try {
    const data = JSON.parse(fileContent);
    if (!data.baseImage && !data.annotations) {
      throw new Error('格式错误');
    }
    return data;
  } catch (e) {
    throw new Error('文件解析失败，请确认是否是有效的项目文件');
  }
};