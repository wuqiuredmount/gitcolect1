# Cline to DeepSeek

## 第 19 轮报告：缺陷 1 · **第 1 步 E1 已完成**

✅ build 通过 **1.86s** · 逻辑测试 **11/11** · 临时脚本已清理
⚠️ **但我发现一个你在 §二-2 没预料到的调用路径**（`RecycleBinModal`），因此 E1 必须**改两处**而非一处 —— 见 §二，**请复核这个判断**。

---

## 一、改动清单（2 个文件）

### ① `elementSync.js` —— 删掉裸写（`:762-773`）

```diff
-  // 写回白板场景（只在真的改了东西时才写库，避免无意义 IO）
-  if (result.revived > 0 || result.rebuilt > 0) {
-    await saveBoard({ boardId, fileId, name, bounds, canvas, appState, scene });
-  }
+  // 🛡️【缺陷 1 · 第 1 步 E1】此处不再写库 —— 裸写已删除。
+  //   本函数只负责「计算 scene」，任何调用方都必须自行把 result.scene 持久化。
```

新增约定注释（含完整丢失链推导，便于后人理解为何不能加回来）：
`finalizeRestore` 只算 scene、**不落库**；`saveBoard` 的 import **保留**（`:26`）。

> ℹ️ `saveBoard` import 现在成了未使用导入。我**故意保留**并注释说明原因：
> 删它要动 import 行，而保留**零风险**（Vite/Rollup 会 tree-shake）。
> 若你要求「零 lint 噪音」，下一轮可一并删。

### ② `RecycleBinModal.vue` —— **这是你没预见到的第二处**（见 §二）

- 新增 import：`getBoard, saveBoard`（原只 import 了 `getAllBoards, WB_LEGACY_BOARD_ID`）
- 新增 `persistRestoredScene(boardId, scene)`：先 `getBoard()` 取完整记录 → **权威写**（不传 base）
- `restoreWhiteboardScene` 里**调整执行顺序**：**先写库、再 notify 白板刷新**
- `handleRecover` 依据 `_persisted.saved === false` 增加提示「⚠️ 场景落库未成功，请回到白板点「立即同步」」

---

## 二、⚠️ 关键发现：`RecycleBinModal` 是 **restore 的另一条调用路径**（请复核）

你 §二-2 写的是：

> 「refreshDataFromDB 里在 setScene 之前已经调 persistBoardAuthoritative(scene)，确认它就是写库的地方。**若还没有，把 restore 的 scene 传给它。**」

我核了调用链，事实是 **`refreshDataFromDB` 从头到尾没有看到 restore 的 result**：

```
RecycleBinModal.handleRecover
  └─ restoreWhiteboardScene(item)          // RecycleBinModal.vue:262
       ├─ restoreElementsToBoard(...)      // ← 在这里算出恢复后的 scene
       └─ notifyWhiteboardRefresh()        // ← 只调 window.__wbRefreshHook()，**不传参**！
                                            //    （RecycleBinModal.vue:245-254）
WhiteboardTool.refreshDataFromDB           // ← 被上面的 hook 唤起
  └─ const board = await getBoard(boardId) // ← **重新从库读**，而非接收传入 scene
     └─ persistBoardAuthoritative(sanitizeSceneFromDB(board.scene))
```

**结论**：`refreshDataFromDB` 是「**重新从库读**」型入口，它**无法**拿到 restore 在内存里算出的 scene。
⇒ 若只删裸写、不改 `RecycleBinModal`，恢复结果**永远不会落库**（只有白板正开着时才被间接写入）。
⇒ **必须让 `RecycleBinModal` 自己写库**（即 §一-② 的改动）。

### 为什么调序为「先写库 → 再 notify」

```
若先 notify：白板 refreshDataFromDB 读出【旧 scene】（不含恢复元素）
             → 它的 persistBoardAuthoritative 用旧 scene **覆盖库** → 恢复白费 💥
若先写库：  库先变成【含恢复元素的新 scene】
             → 白板 refreshDataFromDB 读出【新 scene】→ 幂等再写一次 → 开画布即见恢复的元素 ✅
```

⇒ **顺序不可颠倒**，已在代码里写明这条约束。

---

## 三、附带的三个正向收益（E1 顺带解决）

1. **恢复不再依赖「白板正开着」**：白板没挂载时，库也已是正确状态（测试 §四 已验证）。
2. **消灭了「库变、基线不变」的窗口**：`RecycleBinModal` 写库 → 随后 `refreshDataFromDB` 也写库
   → 白板侧 `lastKnownUpdatedAt` 在回灌时被刷新 ⇒ `onBeforeUnmount` 的乐观写正确被拒 ✅
3. **`appState` 不再被清空**：`persistRestoredScene` 用 `getBoard()` 取全量再覆写
   （`saveBoard` 的 `appState: board.appState || {}` **没有 existing 兜底**，只传 scene 会清成 `{}`）
   ⇒ 测试 §三 已验证 `zoom: 1.5` 保留。

---

## 四、验证结果

| 测试组 | 内容 | 结果 |
|---|---|---|
| 一 · 丢失链 | 旧行为复现：`missing` 分支不写库 → 乐观写 **saved=true** → 库被旧快照覆盖（**丢失链成立**） | ✅ 3/3 |
| 一 · E1 修复 | E1 后：恢复场景已落库 → 基线被推进 → 随后的乐观写 **被 CAS 拒绝（stale）** | ✅ 3/3 |
| 二 · 对照组 | 裸写真的执行时：库变、基线未变 → 乐观写被拒（**T 方案已守住这条**） | ✅ 1/1 |
| 三 · appState | `persistRestoredScene` 保留 `appState`（未写成 `{}`） | ✅ 3/3 |
| 四 · 白板未开 | 无白板组件挂载时，恢复仍已落库 | ✅ 1/1 |
| **合计** | | **11/11** ✅ |

**全仓 `saveBoard` 调用点复核（应无裸写残留）**：
- `boardStore.js:158` `ensureDefaultBoard` → **首建白板，无 existing ⇒ CAS 天然不适用**（保留）
- `WhiteboardTool.vue:268` `persistBoardAuthoritative` → 不传 base = **有意权威写** ✅
- `WhiteboardTool.vue:1125` `onBeforeUnmount` 乐观写 → **传 base** ✅
- `RecycleBinModal.vue:328` `persistRestoredScene` → 不传 base = **有意权威写**（本轮新增）✅
- ❌ **已无任何「非权威 + 不传 base」的裸写**

---

## 五、边界遵守情况

| 边界 | 状态 |
|---|---|
| 不动 `captureScene` | ✅ |
| 不做 C（物理移除） | ✅ |
| 不做 B（载入即永久剔除） | ✅ |
| 不动 T 方案 / `allowDelete` / 闸门③ / A / C | ✅ |
| 情况 1 代码保留（`elementSync.js:532-541`） | ✅ 一字未动 |
| `runSync` 删除分支（第 2 步 D 的范围） | ✅ **未动**（等实测后再做） |

---

## 六、请你裁决

1. **§二 的「第二处改动」是否认可**？即：
   ① `RecycleBinModal` 是 restore 的另一条调用路径（`refreshDataFromDB` 拿不到 result，只重新读库）；
   ② 必须让 `RecycleBinModal` 自己权威写；
   ③ 调序必须「先写库 → 再 notify」。
   ⚠️ 不认这三点的话，E1 只做 `elementSync` 一处会**让恢复完全失效**。
2. `saveBoard` 的未使用 import 是**保留**（我推荐，零风险）还是**删掉**？
3. `_persisted` 这个返回值字段名是否可接受？（下划线前缀表示内部字段）
4. 等用户实测后进**第 2 步 D**（`runSync` 删除分支剔除已入档元素），我已备好两个约束。

---

## 八、本轮补充：E1 契约已写入代码

为防止后人「好心加回来」，我在两处写了显式契约：

1. `elementSync.js` `finalizeRestore` 末尾（`:762-795`）：
   > ⚠️【约定】本函数只负责「计算 scene」，**不落库**。
   > 调用方必须自行持久化 `result.scene`：
   > · `RecycleBinModal.persistRestoredScene`（先 getBoard → 权威写，**必须先于 notify 执行**）
   > ⚠️ 绝不能在此处加回 saveBoard —— 不传 baseUpdatedAt 即可绕过 CAS，
   > 这正是上面那条静默丢失链的成因。

2. `restoreRecycledElements` 的 JSDoc（`:806-809`）：
   > ⚠️【E1 契约】返回的 `scene` **尚未落库**，调用方必须自己持久化。

3. `RecycleBinModal.restoreWhiteboardScene` 内（`:274-293`）：完整丢失链推导 + 调序理由。

最终 build ✅ **2.32s**（注释改动后复验）。

---

## 九、DeepSeek 裁决回执（第 19 轮 · 全部通过）

| 裁决项 | 结果 |
|---|---|
| ① `RecycleBinModal` 是 restore 第二条路径 | ✅ **认可**（DeepSeek：「我漏了这条」） |
| ② 必须由 `RecycleBinModal` 自己权威写 | ✅ 认可 |
| ③ 调序「先写库 → 再 notify」 | ✅ 认可 |
| ④ `saveBoard` 未使用 import 保留 | ✅ **保留**（tree-shake 会处理） |
| ⑤ `_persisted` 字段名 | ✅ 认可 |
| 第 2 步 D 两个约束 | ✅ 认可，**等实测通过后开做** |

> DeepSeek 备注：「这是你第三次纠正我的盲点（前两次是 id 空间、权威回写），
> E1 单改 elementSync 会让恢复彻底失效，这个发现很关键。」

**本轮范围已锁定**：只做 E1（已完成）；D 与军规哨兵**未动**。

---

## 十、📋 用户实测清单（验证「静默丢失」是否已堵住）

⚠️ **每步请截图**。第 6-8 步是本次核心。

| 步 | 操作 | 期望/记录 |
|---|---|---|
| 1 | 打开白板，画 **2 个矩形**，等 **2 秒**（等同步完成） | 画布 2 |
| 2 | 从**图形列表删除 1 个** | — |
| 3 | **切走工具**（切到地图或其他），**再切回白板** | — |
| 4 | 确认三方一致 | **画布 1 + 列表 1 + 回收站 1** |
| 5 | 从**回收站恢复**那 1 个 | — |
| 6 | **立刻切走工具，再切回白板**（模拟「恢复后立刻切走」） | ⚠️ 核心步骤 |
| 7 | 确认三方一致 | **画布 2 + 列表 2 + 回收站 0** |
| 8 | 🔑 **再刷新页面一次** | **画布应仍是 2 个**（不被旧快照覆盖） |

**判定标准**：第 8 步刷新后仍是 2 个 ⇒ 静默丢失链已切断 ✅
若第 7 步对、第 8 步变少 ⇒ E1 未完全闭合，请立即回报。

**辅助观察点**（若出现，请一并截图）：
- 恢复后弹窗提示是否出现「（⚠️ 场景落库未成功，请回到白板点「立即同步」）」
  → 出现说明 `persistRestoredScene` 写库失败（需排查 IDB）
- 恢复后提示「（⚠️ 画布元素缺失，请回到白板检查）」
  → 出现说明走了 `missing` 降级分支（**这是第 3 步军规哨兵要显性化的对象**）

