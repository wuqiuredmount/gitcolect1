// src/groups/geo/utils/drawConfig.js
// 专门存放与绘图相关的配置，方便后续修改和中英文切换

export const zhCN_DrawLocal = {
  draw: {
    handlers: {
      polygon: { tooltip: { start: '点击开始绘制形状。', cont: '继续点击绘制形状。', end: '点击第一个点或右键结束。' } },
      polyline: { error: '<strong>错误:</strong> 形状边缘不能交叉！', tooltip: { start: '点击开始绘制线。', cont: '继续点击绘制线。', end: '点击最后一个点或右键结束。' } },
      rectangle: { tooltip: { start: '点击地图设置起点，移动鼠标，再次点击或右键结束。' } },
      marker: { tooltip: { start: '点击地图来放置标记点。' } },
      simpleshape: { tooltip: { end: '松开鼠标完成绘制。' } }
    }
  }
};

// 颜色与线宽配置，方便统一修改
export const drawStyles = {
  polygon: { color: '#f03', fillOpacity: 0.4, weight: 2 },
  rectangle: { color: '#ffcc00', fillOpacity: 0.4, weight: 2 },
  // 🚨 核心修改：将折线的默认线宽从 3 改为 15（放大5倍）
  polyline: { color: '#3388ff', weight: 15 },
  marker: { iconSize: [24, 24] }
};