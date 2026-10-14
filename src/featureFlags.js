// ===== 构建期功能开关 =====
//
// 用途：同一份源码在「日常开发 / 自用打包」与「对外发布」下表现不同。
//
//   INTERNAL_TOOLS === true   → 内部工具面板全部可用（dev / build 默认）
//   INTERNAL_TOOLS === false  → 内部工具面板全部隐藏（build:release 专用）
//
// 判定依据是 Vite 的 import.meta.env.VITE_INTERNAL_TOOLS：
//   · 只有 `vite build --mode release` 会加载 .env.release 并置为 'false'
//   · 其余情况（npm run dev / npm run build）该变量未定义，!== 'false' 成立 → true
//
// ⚠️ 不要直接改成常量 false，那会连自己开发时也一起隐藏。
//
// 依赖此开关隐藏的内部工具：
//   1. AI批量导入面板（BaseMapTool / WhiteboardTool）
//   2. 信息回收站弹窗（RecycleBinModal）
//   3. 待处理未放置弹窗（PendingUnplacedModal）
//
// 相关文档：.agents/references/frontend-release-security.md

export const INTERNAL_TOOLS = import.meta.env.VITE_INTERNAL_TOOLS !== 'false';

export default { INTERNAL_TOOLS };
