Cline to DeepSeek（第 25 轮：两处修正 + P2 已完成）

# 一、批 1：两处修正（commit `e5d9490`，4 文件 +157/-43）

## 改动文件清单

| 文件 | 改了什么 |
|---|---|
| `src/components/tools/geo/panels/MarkerDocPanel.vue` | `.doc-panel` / `.doc-editor`（含后代 `*`）/ `.title-input` 三处**显式写死** font-family |
| `src/groups/whiteboard/utils/elementSync.js` | `buildAnnotation` / `buildDefaultDocHtml` / 新增 `stripTransientFields` / `syncScene` 三处 / `registerElement` |
| `src/groups/whiteboard/WhiteboardTool.vue` | 2 处名称兜底：`item.id` → `'未命名'` |
| `src/components/tools/geo/panels/LayerListPanel.vue` | 成员名补 `m.objectName` 并列兜底 |

## 问题 1 · 字体 —— 你的三个猜测里，**第二个是真因**

- 实测：`.doc-editor` **完全没有** font-family 声明，`.doc-panel` 也没有。
- 地图侧：挂在 `GisApp.vue` 的 `.app-container` 下，后者显式设了
  `'Segoe UI','Microsoft YaHei',sans-serif` → 面板**继承到正确字体**。
- 白板侧：挂在 Excalidraw 宿主内，Excalidraw 往容器注入自己的字体栈
  → 面板继承到**错的那套**。
- ⇒ 同一组件、两套继承源，正是「鹰眼一致、白板不一致」的原因。
- **修法**：三处显式写死同一字体栈（**不依赖继承**），与 `GisApp.vue:840` 逐字一致：
  `'Segoe UI', 'Microsoft YaHei', sans-serif`；
  `.doc-editor *` 也一并声明（防富文本内的 `<b>`/`<p>` 被 Excalidraw 的
  `.excalidraw` 容器规则以更高特异性覆盖）。
- ✅ `WhiteboardTool.vue` 的 scoped CSS **没有**污染（scoped 带 data 属性，
  且不存在 `.doc-*` 选择器）—— 这条猜测排除。

## 问题 2 · 名称/默认富文本 —— 按「显示层空 vs 指纹层兜底」落地

**核心难点**：`buildFingerprint` 读 `layer.objectName || layer.title || layer.name`，
name 空 ⇒ 指纹空 ⇒ `isValidFingerprint` 失败 ⇒ **元素直接登记不上**（会被 skip）。
而 `isRegisterable` / `syncScene` 的 `if (!name)` 又都拿 name 当门槛。

**解法（关键设计）**：给中间对象挂一个**临时字段 `__fpName`**，
只服务于指纹计算，落库前统一剥除。

```
buildAnnotation(name = 用户填写值)
  ├─ title / objectName  ← displayName（匿名 = ''，落库就是这个空串）
  └─ __fpName            ← displayName || element.id   ← 仅供指纹
buildFingerprint({ ...layer, name: layer.__fpName })   ← 喂指纹
stripTransientFields(layer)                            ← 落库前剥掉 __fpName
```

为什么要 `stripTransientFields`：`__fpName` 若跟着 `appendLayers` 落进 IndexedDB，
就变成一条表外字段（JSON 里多一个 `__fpName`），与 objectName 语义重复且永不同步，
日后读 `_` 前缀字段的代码都可能被误伤。

**逐条落实你的 4 点**：

1. ✅ `buildAnnotation`：`title/objectName` 只存用户填写值（匿名 = `''`）；
   指纹走 `__fpName`（匿名 = element.id）。
2. ✅ `buildDefaultDocHtml`：删掉提示行，**恒返回 `''`**（保留签名与 2 个调用点，
   便于日后回退）。
3. ✅ UI 兜底（**只在 UI 层**，数据层保持真空白）：
   - `WhiteboardTool.vue` 列表名 `{{ item.objectName || item.title || '未命名' }}`
   - `WhiteboardTool.vue` 详情预览 2 处 `|| '未命名'`（原先回退 `item.id`）
   - `LayerListPanel.vue` 成员名 `|| '未命名图形'`（原样式表已备好该文案）
   - `InfoDatabase.vue` / `InventoryModal.vue` / `RecycleBinModal.vue` 本就有 `'未命名'`，
     **未改动**。
4. ✅ 改名链路一行未动（走既有 `moved/renamed` 分支）。

**顺带必须修的 3 个连带点（否则会引新 bug）**：

- ⚠️ **`renamed` 判定**：`syncScene` 原先 `const name = getElementName(element)`
  （带 element.id 兜底）与 `prev.objectName`（现在会是空串）比 → **每轮都判 renamed**
  → 无意义的指纹注销/重登。已改为 `getCustomName`（不含兜底）+ `String(prev.objectName||'')`。
  旧库记录 objectName 若残留 element.id，会**一次性**判 renamed 把值清成空串，之后恒等。
- ⚠️ **`next.title/objectName` 不能再用 `|| prev` 兜底**：`name || prev.title` 会让
  「用户清空名称」永远删不掉旧值。已改为直接赋值 `name`。
- ⚠️ **`if (!boundsOk || !canvasOk || !name)`** 必须去掉 `|| !name`：
  name 现在允许为空，该条件会把所有匿名元素**静默 skip**（登记率归零）。
  能否登记改由下面 `isValidFingerprint(fp)` 把关 —— 语义更准。
- `registerElement` 同理：`finalName` 拆成 `displayName`（落库）+ `fpName`（指纹门槛）。

## 约束遵守确认

- ✅ `fingerprint.js` **一行未动**（未加 `__fpName` 分支，保持 v4）。
- ✅ elementSync 的删除/更新**主体逻辑**未动（只改了上述字段赋值与判定）。
- ✅ 地图侧 6 个工具的 `MarkerDocPanel` 调用点**零改动**（只补了 CSS 声明）。

# 二、批 2：P2 回到中心点（commit `9229ea6`，2 文件 +65）

## 改了什么

- `ExcalidrawBoard.vue`：新增 `centerToContent(elements?)`，加进 `defineExpose`。
- `WhiteboardTool.vue`：状态栏（`wb-spacer` 之后）加「回到中心点」按钮
  + `handleBackToCenter`。

## 为什么没用你写的 `getApi().scrollToContent(...)` 直调式

你的指令留了口子（「若 getApi 不给 scrollToContent，ExcalidrawBoard 加 centerToContent」）。
`getApi().scrollToContent` **确实存在**（0.18.1 已逐字核对类型），
但我仍把它收进 `centerToContent`，因为直调会漏掉两件事：

1. **软删除过滤**：Excalidraw 删元素只置 `isDeleted=true`，元素仍留在
   `getSceneElements()` 数组里 → 不过滤的话「元素全删光」会被判成「有内容」，
   视口飞到一个**已删除元素**的框上。
2. **空场景保护**：`scrollToContent([])` 行为未定义（可能把视口甩到原点）。
   收进组件后「空 ⇒ 返回 false 不滚动」是一处逻辑，外部只拿布尔值。

实现（`ExcalidrawBoard.vue:132-160`）：

```js
const centerToContent = (elements) => {
  if (!api || typeof api.scrollToContent !== 'function') return false;
  let target = elements;
  if (!Array.isArray(target)) {
    if (typeof api.getSceneElements !== 'function') return false;
    target = api.getSceneElements();          // 不传参 = 用现状实况，避免调用方维护快照
  }
  const alive = target.filter(e => e && !e.isDeleted);   // ← 软删除过滤
  if (alive.length === 0) return false;                  // ← 空场景不动作
  try {
    api.scrollToContent(alive, { fitToViewport: true, animate: true });
    return true;
  } catch (e) { console.warn('[ExcalidrawBoard] 回到中心点失败:', e); return false; }
};
```

## 类型核对（逐字，不是推理）

`node_modules/@excalidraw/excalidraw/dist/types/excalidraw/components/App.d.ts:335`

```
scrollToContent: (target?: string | ExcalidrawElement | readonly ExcalidrawElement[], opts?: ({
      fitToContent?: boolean; fitToViewport?: never; ...
  } | {
      fitToContent?: never; fitToViewport?: boolean; ... animate?: boolean; duration?: number;
  }) & { minZoom?: number; ...
```

⇒ `readonly ExcalidrawElement[]` **接受数组**；opts 联合的第二支含
`fitToViewport?: boolean` + `animate?: boolean` ⇒ 我的用法合法。
（第一支的 `fitToViewport?: never` 只是「二选一」排他标记，不影响。）

## 未做的事（说明）

按钮**没有** `:disabled` 态。理由：滚动是**同步**调用（`animate` 只是视觉过渡），
不存在可观测等待期，加禁用态反而引入状态抖动。
`handleBackToCenter` 在 `api` 未就绪时**静默返回**（不抛错、不弹窗）。

# 三、build 与验证

- 批 1 后 `npm run build` → **`2.01s` 通过**；批 2 后 → **`2.13s` 通过**。
- **自动化验证（批 1，`node` 直跑真 `buildFingerprint`，6/6 通过）**：

| # | 断言 | 结果 |
|---|---|---|
| T1 | 匿名元素（objectName=''、喂 name=element.id）→ 指纹有效 | ✅ `v4-18b33725518be39f` |
| T2 | **反证**：全 empty 不喂 name → 指纹为 `''` 且无效（证明该约束真实存在） | ✅ |
| T3 | 用户命名后 → 指纹有效 | ✅ |
| T4 | 同一匿名元素跨轮 → 指纹**稳定**（element.id 不变） | ✅ |
| T5 | 坐标移动 → 指纹变化（moved 分支注销/重登依据） | ✅ |
| T6 | 兜底名「A」与显式名「A」指纹**一致**（语义等价） | ✅ |

（临时断言脚本已删除，未入库。）

# 四、需要用户实测的 5 步

1. 白板「AI 批量导入」导入几条 → 右侧「已登记元素」名称列**不再出现** nanoid，
   全部显示「未命名」（数据层是空串，UI 层兜底）。
2. 点选画布元素 → 右上角富文本面板：**文档名称输入框为空**（占位「请输入文档名称」），
   编辑器**空白**（无「由白板元素自动登记…」那行）。
3. 在面板里自己填名称 + 写内容 → 保存 → 刷新页面 → 名称与内容都在
   → 信息数据库对应记录里也只剩你填的内容。
4. **字体检查**：白板侧富文本面板的字形/字重应与地图（鹰眼）侧**完全一致**
   （不再是 Excalidraw 那套 hand-drawn 字体）。
5. **回到中心点**：状态栏点「回到中心点」→ 视口动画缩放到全部元素外接框；
   删光所有元素后再点 → **画面不动**（Console 一条 debug 提示）。
   - 补充：单元素时也会缩放到该元素（`fitToViewport` 会放大到接近满屏，属正常）。
   - 补充：画布未就绪（懒加载中）时点按钮**静默无反应**，属预期。

# 五、留给你裁决的 1 个旧问题（本轮未动）

`MarkerDocPanel.onBeforeUnmount` 的兜底保存（无编辑也写库）—— 上一轮就挂着，
本轮**未改**（不在「只改这两处」范围内）。要不要做「无变更 = 不写」？
我倾向**做**：口径是「保存按钮 / 卸载兜底都先比对 `originalHtml` 快照，
无差异直接 return」，改动约 5 行、零副作用，能显著减少无意义写库。

# 六、一句话

**已完成**：两处修正（字体显式写死 + 去技术 ID/空白默认，指纹兜底走临时字段 `__fpName`）
与 P2（回到中心点，含软删除过滤与空场景保护）均已实施、build 通过、两批分别 commit
（`e5d9490` / `9229ea6`），待用户实测 5 步。
