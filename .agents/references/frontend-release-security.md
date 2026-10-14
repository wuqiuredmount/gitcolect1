# 网页前端开发与内测安全指引

> 用途：规范「把网页给别人看」的全流程，防止源码泄露、内部数据泄露、工作流泄露。
> 适用范围：对外展示 / 内测 / 演示 / 局域网分享 / 客户预览。
> 触发：任何「给别人看网页」「打包发布」「内测」「演示」「分享链接」任务开始前必读。
> 依据：2026-10-08 对 dev(5173) 与 preview(4173) 的实测取证。
> 最后更新：2026-10-08

---

## 一、三条铁律（违反即事故）

1. dev 模式绝不对外。npm run dev（含 --host）会把 src/ 下的源文件以明文暴露在 HTTP 上。实测：GET /src/App.vue 直接返回带注释的源码；GET /package.json 返回完整依赖清单。dev server 从设计上就只服务开发者自己。
2. 对外只用 npm run build 的 dist/。产物经压缩混淆、注释剥离、无 sourcemap。实测：find dist -name '*.map' 为空；源码注释标记（🚨 / 🖊️）搜不到；变量被压成单字母。
3. public/ 是公开白名单。public/ 下的一切都会被原样拷进 dist/ 并可被任何人按 URL 访问。放入 public/ 前必须自问：「这条能公开吗？」

---

## 二、为什么 dev 会泄露（原理，勿忘）

Vite dev 用浏览器原生 ES Module：浏览器自己请求 /src/App.vue，Vite 现场编译返回。后果是项目根目录 = 网站根目录，src/ 下每个文件都成了可访问 URL。叠加三个条件即必然泄露：

1. 源文件在服务目录内；
2. URL 可预测（/src/xxx.vue 即相对路径）；
3. 零鉴权。

攻击者用 F12 Network 面板即可看到全部源文件路径，或从 main.js 顺着 import 递归爬取整站源码。

构建产物堵在哪：文件内容被混淆、注释被删、路径变哈希（assets/index-I6F9nnj2.js）、依赖被合并、无 sourcemap。对方拿到的是「能运行的程序」，不是「你的工程源码」。

> 边界认知：前端代码注定要下发到浏览器，理论上都能被逆向。真正的密钥 / 核心算法必须放后端。判断标准不是「能否被偷」，而是「偷到的值不值得」。

---

## 三、对外发布标准流程

  1) npm run build                          构建
  2) node scripts/release-public.mjs --strict   剔除内部文件
  3) npm run preview -- --host              本地预览
  4) 按第七节逐条验证敏感路径确实不可访问

端口说明：dev = 5173，preview = 4173。分享给别人的是 http://<你的IP>:4173/

---

## 四、必须隐藏的清单（2026-10-08 实测）

### A 类：内部工作文件 —— 任何对外发布都应剔除（无运行时依赖，删了不坏）

| 路径（相对 dist/） | 内容 | 为何隐藏 |
|---|---|---|
| ai-import/_all_names.txt | 全量名称清单 | 内部工作产物 |
| ai-import/_existing_305.txt | 已有 305 条 | 内部统计 |
| ai-import/_existing_names.txt | 已有名称 | 内部统计 |
| ai-import/_new.txt | 待新增清单 | 内部草稿 |
| ai-import/5a-verify-3.json | 校验中间产物 | 内部过程 |
| ai-import/README.md | 采集到导入完整工作流 | 暴露数据管道机制 |
| ai-import/shards/ | 分片采集目录 | 暴露多 AI 协作机制 |
| ai-import/commands/README.md | 指令投放机制 | 暴露回收站机制 |
| ai-import/commands/delete-sports-nov.json | 一次性内部指令 | 内部操作 |

### B 类：内部功能数据 —— 彻底对外时剔除，但需先关闭对应面板（否则运行时报错）

| 路径 | 运行时依赖方 | 前置条件 |
|---|---|---|
| ai-import/（整目录） | AiImportPanel.vue / aiImporter.js | 先关闭「AI批量导入」面板 |
| ai-import/commands/ | RecycleBinModal.vue | 先关闭「回收站」面板 |
| pending-unplaced/ | PendingUnplacedModal.vue | 先关闭「待放置」面板 |

> 代码层开关（**已实施** 2026-10-08）：`src/featureFlags.js` 导出 `INTERNAL_TOOLS`，
> 由构建期变量 `VITE_INTERNAL_TOOLS` 决定（`.env.release` 置 `false`）。
> 受控入口：`BaseMapTool.showAiImportPanel`、`WhiteboardTool` 的 AI 按钮与面板、
> `GisApp` 顶栏回收站/待处理弹窗。
>
> **内测预览需保留内部工具时**：用 `npm run share:internal`（普通 build，含 AI 面板与 ai-import 数据）；
> `npm run share` 仍为 release（对外分享用，隐藏内部工具并由插件剔除 `dist/ai-import`）。
>
> ⚠️ 已知瑕疵：`GisApp.vue:50` 顶栏「待处理未放置信息库」按钮未加 `INTERNAL_TOOLS` 守卫，
> release 下按钮可见但弹窗被隐藏（点击无反应），见 PROJECT_MEMO §六 第 27 轮遗留。

### C 类：正常运行资源（保留）

maps/中国地图0003.png（底图）、fonts/（Excalidraw 自托管字体）、assets/（构建产物）、icon.png / splash.png / favicon.svg / icons.svg / eagle-earth.png（UI 素材）。

---

## 五、剔除脚本用法

默认 safe：仅剔除 A 类内部草稿，保留运行时依赖，应用功能不受影响
  node scripts/release-public.mjs

strict：连同 B 类整目录剔除（未关闭内部面板时会报错，见第四节说明）
  node scripts/release-public.mjs --strict

脚本位于 scripts/release-public.mjs，只操作 dist/（构建产物），不动 public/ 源文件，因此不影响开发流程。

---

## 六、内测（局域网分享）指引

1. 必须用 preview，不用 dev：npm run build 然后 npm run preview -- --host。
2. 给出 Network 地址：形如 http://10.x.x.x:4173/，对方需在同一 WiFi / 局域网。
3. 防火墙：首次监听若 Windows 弹窗，勾选「专用网络」允许。补规则（管理员 PowerShell）：
     New-NetFirewallRule -DisplayName "Vite Preview 4173" -Direction Inbound -Protocol TCP -LocalPort 4173 -Action Allow
4. 可信网络：咖啡馆 / 访客 WiFi 等不可信环境不建议直接分享。
5. 用完即停：preview 是常驻进程，演示结束后立即中断，避免长期敞开。
6. AP 隔离：部分路由器开启客户端隔离，同 WiFi 也互不通，换热点可判断。

---

## 七、发布前自查清单（逐条打勾）

- [ ] 用的是 npm run build + npm run preview，没有开 dev？
- [ ] 已跑 node scripts/release-public.mjs --strict？
- [ ] dist/ 下无 *.map？（find dist -name '*.map' 应为空）
- [ ] 抽查 curl http://127.0.0.1:4173/src/App.vue 返回 index.html，不是源码？
- [ ] 抽查 curl http://127.0.0.1:4173/package.json 拿不到依赖清单？
- [ ] 抽查 curl http://127.0.0.1:4173/ai-import/README.md 返回 404？
- [ ] public/ 新增的文件都确认过「能公开」？
- [ ] 演示结束已停止 preview 进程？

---

## 八、内测实时更新（开发中让别人跟着看新版）

需求：我这边持续开发，对方浏览器刷新即见新版，且源码不暴露。

### 为什么不能用 dev 做实时更新

dev 的 HMR 实时推送，前提是浏览器加载源模块 —— 这与「源码不暴露」是同一机制的两面，无法兼得。故对外内测一律走「watch 重建 + 手动刷新」。

### 标准流程（两个终端）

终端 A（watch 构建，改代码自动重建）：
  npm run build:release -- --watch

终端 B（静态服务）：
  npm run preview -- --host

对方访问 http://<你的IP>:4173/ ，你改代码后对方手动刷新即见新版。

### 自动剔除（关键）

vite build --watch 每次重建都会重新拷贝 public/，把内部文件恢复。
为此在 vite.config.js 追加了 stripInternalAfterBuild 插件（2026-10-08）：
  · 仅当 config.mode === 'release' 时生效
  · 每次 closeBundle 自动删除 dist/ai-import 与 dist/pending-unplaced
  · dev 与普通 build 完全不受影响

验证：watch 重建日志末尾应出现
  🔒 [release] 已自动剔除 2 个内部目录（ai-import / pending-unplaced）

### 注意

1. 端口 4173 需放行防火墙。
2. 对方刷新才见新版（无自动推送）。
3. 演示结束停掉两个终端。
4. 若手动跑过 release-public.mjs --strict，watch 重建后会由插件再次剔除，幂等无害。

---

## 九、变更历史

| 日期 | 变更 |
|---|---|
| 2026-10-08 | 首版：铁律 + dev 泄露原理 + 三色清单 + 剔除脚本 + 内测指引 + 自查清单 |
| 2026-10-08 | 追加：内测实时更新流程（build:release --watch + 自动剔除插件） |
