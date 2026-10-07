# 常用信息源清单（站点库）

> 用途：采集前先查本清单，**优先选低成本通道**。
> 采集方式优先级：`API` < `fetch` < `浏览器`（成本从低到高）。
> 最后更新：2026-10-07

---

## 一、为什么这个清单能提速

一次浏览器采集 = `navigate_page` + `evaluate_script` ≈ 2 轮对话。
一个 `npm run crawl -- fetch <url>` = 1 轮，且带 7 天缓存。
一个 `npm run collect -- geocode` = 1 轮，直接出坐标。

**结论：能在 `fetch`/`API` 层拿到的数据，绝不用浏览器。**

---

## 二、地图与坐标

| 名称 | 地址 | 用途 | 采集方式 | 状态 |
|---|---|---|---|---|
| 高德 REST geocode | `https://restapi.amap.com/v3/geocode/geo?address=&key=` | 地址→坐标 | **API** | ✅ 已验证（6 位精度） |
| 高德坐标拾取器 | `https://lbs.amap.com/tools/picker` | 人工核验坐标 | 浏览器 | ✅ 已验证（**须登录**才 6 位） |

> 坐标优先走 `npm run collect -- geocode "地址"`，不要开浏览器。

## 三、搜索引擎

| 名称 | 地址 | 用途 | 采集方式 | 状态 |
|---|---|---|---|---|
| Bing | `https://www.bing.com/search?q=` | 通用检索 | **fetch**（crawl 内置） | ✅ 已验证 |
| DuckDuckGo | `https://html.duckduckgo.com/html/?q=` | 通用检索 | **fetch**（crawl 内置） | ✅ 已验证 |
| 百度 | `https://www.baidu.com/s?wd=` | 中文检索（含 AI 总结） | 浏览器 | ✅ 已验证（JS 渲染，fetch 拿不到） |

> 检索先用 `npm run crawl -- search "<query>"`（Bing 优先），不够再上百度浏览器。

## 四、官方名录

| 名称 | 地址 | 用途 | 采集方式 | 状态 |
|---|---|---|---|---|
| 中国田径协会 | `https://www.runchina.org.cn` | 马拉松赛历/赛事目录 | fetch | ⏳ 待验证 |
| 中国田协赛事通知 | `https://www.runchina.org.cn/#/notice/industry/detail/` | 官方赛事名单 | fetch | ⏳ 待验证 |

## 五、百科（坐标已失效）

| 名称 | 地址 | 用途 | 采集方式 | 状态 |
|---|---|---|---|---|
| 百度百科 | `https://baike.baidu.com/item/` | 简介文本 | 浏览器 | ⚠️ JS 渲染；**内嵌坐标已失效**（2026-10-06 实测） |

> 百科只用来取简介，**不要指望取坐标**。

## 六、地方资讯

| 名称 | 地址 | 用途 | 采集方式 | 状态 |
|---|---|---|---|---|
| 本地宝 | `http://m.bendibao.com` | 赛事/活动细节 | fetch | ⏳ 待验证 |
| 各省文旅厅 | （分省填写） | 景区/非遗名单 | fetch | ⏳ 待验证 |

---

## 七、封锁/不可用清单（别再试）

| 名称 | 原因 |
|---|---|
| 维基百科 / Wikimedia 图床 | 网络层封锁，浏览器也无法访问（2026-10 确认） |
| 百度百科内嵌坐标 | 已不再输出 `api.map.baidu.com/marker?location=` |
| Nominatim | 本机不可达 |

---

## 八、维护约定

- 新增源时补一行，**必须填「采集方式」与「状态」**。
- 状态从 `⏳ 待验证` → 验证后改 `✅ 已验证` 或 `❌ 不可用`。
- 发现某源可用 `fetch` 直达 → 尽量改用它，减少浏览器依赖。
