// src/groups/geo/utils/layerScheduler.js
// 海量图形加载调度器：分块创建 + 让出主线程 + 随机采样
// 设计目标：数据量增长到十万级时，仍不阻塞主线程、不卡顿。

export const CHUNK_SIZE = 9;              // 每 9 个图形一组
export const GROUP_DISPLAY_MAX = 60;      // 每个视图最多挂载 60 个图形
export const ROTATE_INTERVAL_MS = 30000;  // 30 秒随机轮换

/** 让出主线程一帧，避免长任务阻塞渲染 */
export const yieldToMain = () => new Promise((resolve) => {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => resolve(), { timeout: 120 });
  } else {
    setTimeout(resolve, 0);
  }
});

/**
 * 分块顺序执行：每 chunkSize 个一组，组间让出主线程。
 * 编号靠后的块自然等待前面的块完成，形成「顺序加载」。
 */
export const runChunked = async (items, worker, opts = {}) => {
  const list = Array.isArray(items) ? items : [];
  const chunkSize = opts.chunkSize || CHUNK_SIZE;
  const total = list.length;

  for (let i = 0; i < total; i += chunkSize) {
    if (opts.shouldCancel && opts.shouldCancel()) {
      return { cancelled: true, done: i };
    }
    const end = Math.min(i + chunkSize, total);
    for (let j = i; j < end; j++) {
      try {
        worker(list[j], j);
      } catch (e) {
        console.warn('[runChunked] 单条处理异常:', e);
      }
    }
    if (opts.onProgress) opts.onProgress(end, total);
    if (end < total) await yieldToMain();
  }
  return { cancelled: false, done: total };
};

/**
 * 从数组随机采样 n 个（不修改原数组）。
 * 部分洗牌算法：O(n) 时间，无需打乱整个数组。
 */
export const sampleRandom = (arr, n) => {
  if (!Array.isArray(arr) || arr.length === 0) return [];
  if (n >= arr.length) return arr.slice();

  const copy = arr.slice();
  const out = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy[idx]);
    copy[idx] = copy[copy.length - 1];
    copy.pop();
  }
  return out;
};
