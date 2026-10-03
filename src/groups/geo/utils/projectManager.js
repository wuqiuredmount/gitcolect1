// src/groups/geo/utils/projectManager.js

/**
 * 构建统一的工程文件数据结构
 */
export const buildProjectFile = (config, map, layers, customBaseImageData = null, customWidth = 0, customHeight = 0) => {
  const mapState = {
    center: map ? [map.getCenter().lat, map.getCenter().lng] : [0, 0],
    zoom: map ? map.getZoom() : 3
  };

  return {
    version: '1.0',
    createdAt: new Date().toISOString(),
    toolId: config.toolId,
    baseLayer: {
      type: config.baseLayer.type,
      url: config.baseLayer.url || '',
      annoUrl: config.baseLayer.annoUrl || '',
      bounds: config.baseLayer.bounds || null,
      customImage: customBaseImageData, // 自定义底图的 Base64
      customWidth: customWidth,         // 🚨 关键：保存自定义底图的宽高，用于重建坐标系
      customHeight: customHeight        
    },
    mapState,
    // 清理图层数据，去除不能序列化的 Leaflet 实例
    layers: layers.map(l => {
      const { layerRef, ...serializableData } = l;
      return serializableData;
    })
  };
};

export const parseProjectFile = (jsonData) => {
  let data = jsonData;
  if (typeof jsonData === 'string') {
    try {
      data = JSON.parse(jsonData);
    } catch (e) {
      throw new Error('工程文件格式错误，无法解析 JSON！');
    }
  }
  if (!data.version || !data.toolId || !data.layers) {
    throw new Error('工程文件损坏或缺少必要字段！');
  }
  return data;
};

export const downloadProjectFile = (projectData, fileName) => {
  const jsonStr = JSON.stringify(projectData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}.geo`;
  link.click();
  URL.revokeObjectURL(url);
};