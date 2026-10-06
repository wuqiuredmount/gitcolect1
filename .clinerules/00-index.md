# 项目规则索引（Cline 常驻）

项目：app100-multifunction（良件-空间信息共享与集成）
技术栈：Vue 3 + Vite 8 + Vue Router 4 + Leaflet 1.9 + Electron
唯一记忆文件：`.agents/PROJECT_MEMO.md`

> 本文件只放「触发条件 + 硬约定」，保持精简常驻。
> 大段流程说明一律不写在这里，改为命中时用 read_file 按需读取。

---

## 一、触发式加载（不要预先读取，命中才读）

| 命中条件 | 必须先读取 |
|---|---|
| 任何开发 / 数据 / 代码 / 调试任务 | `.agents/PROJECT_MEMO.md` |
| 修改、新增、删除代码文件 | `.agents/skills/代码修改返还完整代码/SKILL.md` |
| 批量导入点位（5A/4A/景区/文保/门店等） | `.agents/skills/ai-import-geo-markers/SKILL.md` |
| 删除数据 / 回收站 / 恢复 / 清理 | `.agents/skills/ai-recycle-bin-ops/SKILL.md` |
| 创建或更新 skill | `.webcode/builtin-skills/create-skills/SKILL.md` |

加载方式：用 read_file 读取对应文件后，再按其中流程执行，不要凭记忆操作。

---

## 二、硬约定（必须常驻遵守）

1. **只追加，不改既有逻辑**——除非用户明确要求改动。
2. **改代码返回完整文件代码**，不输出片段。
3. **高德额度零消耗**——坐标由采集阶段提供，导入器不调用 geocode。
4. **图片用外链**（Wikimedia 等），不使用 base64。
5. **IndexedDB 不换存储系统**。
6. **AI 无法直接写浏览器 IndexedDB**，只能通过指令文件间接操作。
7. **语言中文；风格直接给结果，少铺垫。**

---

## 三、每轮任务结束前必做

1. 更新 `.agents/PROJECT_MEMO.md` 的「四、数据现状」与「六、待办」，并刷新「最后更新」日期。
2. 若发现新坑，补进 MEMO 的「五、踩过的坑」。
3. 确认改动已 `npm run build` 通过。
4. 调用写入类工具后，用 search_code 或文件时间戳确认已落盘。

---

## 四、环境提醒

- 新增 `.js` 文件后 Vite HMR 可能不生效，需 **Ctrl+Shift+R** 强制刷新验证。
- IndexedDB 按域名隔离，只能在应用页面（localhost）调试，勿在 AI 页面控制台读取。
