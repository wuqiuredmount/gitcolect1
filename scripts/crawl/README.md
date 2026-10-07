# crawl —— AI 全网检索/抓取工具

用途：把「AI 联网检索 → 结构化数据 → ai-import 契约」从手工变成 CLI。
零依赖（Node 原生 fetch），带 7 天缓存，支持并发批量。
**只读外部网页，不碰 src/，不改软件功能。**

---

## 命令清单

### 1. 搜索

    npm run crawl -- search "<query>" [--limit=10] [--engine=bing|ddg|all]

- 默认 `--engine=all`：**Bing 优先，不足时 DuckDuckGo 补充**
- 输出 JSON：`{ query, count, results: [{ url, title }] }`
- 结果自动缓存 7 天

### 2. 抓正文

    npm run crawl -- fetch <url> [--text] [--maxChars=8000]

- 抓 HTML → 转纯文本（去 script/style/标签，保留段落）
- `--text` 输出纯文本；不带则输出 JSON
- 默认截断 8000 字；`--maxChars=N` 调整
- 结果自动缓存 7 天

### 3. 批量搜

    npm run crawl -- batch <keywordFile> [--limit=5] [--engine=all]

- 关键词文件：一行一个
- **并发 4 路**，速度快
- 输出 `{ total, results: [{ keyword, hits }] }`

### 4. 转成 ai-import 契约

    npm run crawl -- export <name> --from=<src.json> --to=<out.json> --group=<分组名>

- 源 JSON 支持 `[...items]` 或 `{ items: [...] }`
- 输出 `{ batchName, group, markerColor, items }`（**符合应用导入契约**）
- 默认输出到 `public/ai-import/<name>.json`
- **记得手动登记进 `public/ai-import/manifest.json`**

每个 item 最少 `{ name, lat, lng }`，可选 `{ address, intro, images, time }`

### 5. 缓存管理

    npm run crawl -- cache list
    npm run crawl -- cache clear
    npm run crawl -- cache get <type> <target>

- 缓存目录 `.cache/crawl/`（已在 `.gitignore`）
- 默认 TTL 7 天
- type 可选 search / fetch

---

## AI 工作流（推荐）

1. AI 搜索：`npm run crawl -- search "<主题>"` → 拿到候选 URL
2. AI 抓正文：`npm run crawl -- fetch <url> --text` → 自动缓存
3. AI 整理成 items 数组 → 存成 tmp.json
4. AI 导出：`npm run crawl -- export "<名称>" --from=tmp.json --group="<分组>"`
5. 手动登记 manifest.json
6. 用户在应用面板点「AI批量导入」→ 导入

---

## 边界

- 只读外部网页，不写任何外部站点
- 不碰 src/，纯工具
- 零新依赖，只用 Node 内置
- 不做登录态抓取（匿名公开网页）
- 不绕过反爬（403/429 直接失败）
- **坐标不从这里抓**——crawl 只抓文本；坐标走 geocoder.js 或高德拾取器人工核验

---

## 抓不到的情况（需 AI 兜底）

某些页面是 JS 渲染（百度百科、知乎等），Node fetch 拿不到。此时 AI 可以：

1. **改用其他源**（政府网站/文旅厅列表页多为静态）
2. **用 edge-devtools MCP 抓**（4 个浏览器实例已挂载）
3. **直接访问原文**（用户提供 URL 时）

---

## 与 geocoder.js 的分工

- crawl：抓文本（名称、简介、地址字符串）
- geocoder.js：地址 → 坐标（高德→百度→天地图→Nominatim 降级）
- 两者互不依赖，按需组合
