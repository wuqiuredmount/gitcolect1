# 常用信息源清单（站点库）

> 用途：采集前先查本清单，**优先选低成本通道**。
> 采集方式优先级：`API` < `fetch` < `浏览器`（成本从低到高）。
> 最后更新：2026-10-07（E4 补录：发现 athletics.org.cn / cnmarathon.com）

---

## 一、为什么这个清单能提速

一次浏览器采集 = `navigate_page` + `evaluate_script` ≈ 2 轮对话。
一个 `npm run crawl -- fetch <url>` = 1 轮，且带 7 天缓存。
一个 `npm run collect -- geocode` = 1 轮，直接出坐标。

**结论：能在 `fetch`/`API` 层拿到的数据，绝不用浏览器。**

---

## 二、马拉松赛事源（重点，已验证）

### ★ chinamarathon.com（中国马拉松）—— 首选

- **地址**：`https://chinamarathon.com`
- **采集方式**：`fetch`（SSR 渲染，crawl 可直接抓）✅ 已验证
- **价值**：首页直接输出「赛事名 + 日期 + 地点」三元组，**地点细到场馆**
- **格式样例**：

      2026武夷山马拉松
      2026年11月22日
      福建・南平市武夷山市・武夷广场

- **用途**：赛事清单 + 起终点字符串 → 直接喂 `collect geocode`
- **注意**：`/events/{id}` 详情页抓不到（404 或渲染问题），只用首页

### runninginchina.org（跑IN中国）—— 补充源

- **地址**：`https://www.runninginchina.org`
- **采集方式**：`fetch` ✅ 已验证
- **价值**：赛事列表 + 报名状态（「报名正在进行」）
- **局限**：部分赛事地点为空，不如 chinamarathon 完整

---

## 三、地图与坐标

| 名称 | 地址 | 用途 | 采集方式 | 状态 |
|---|---|---|---|---|
| 高德 REST geocode | `https://restapi.amap.com/v3/geocode/geo?address=&key=` | 地址→坐标 | **API** | ✅ 已验证（6 位精度） |
| 高德坐标拾取器 | `https://lbs.amap.com/tools/picker` | 人工核验 | 浏览器 | ✅ 已验证（**须登录**才 6 位） |

> **⚠️ 高德 QPS 限制（2026-10-07 实测）**：连续快速请求会报 `CUQPS_HAS_EXCEEDED_THE_LIMIT`。
> 这是**每秒查询数**限制（非日额度耗尽），批量编码时**节流间隔需 ≥350ms**。

## 四、搜索引擎

| 名称 | 地址 | 用途 | 采集方式 | 状态 |
|---|---|---|---|---|
| Bing | `https://www.bing.com/search?q=` | 通用检索 | **fetch**（crawl 内置） | ✅ 已验证（见下注） |
| DuckDuckGo | `https://html.duckduckgo.com/html/?q=` | 通用检索 | — | ❌ 本机 0 结果 |

> **⚠️ Bing 查询用词（2026-10-07 实测）**：
> - **长自然语言查询会语义漂移**：如「2026年12月全国马拉松赛事日程」→ 返回节假日/政府报告
> - **短关键词查询精准**：如「上海马拉松 2026」→ 官网/详情页/新闻/百科全部命中
> - **规则：用「主体 + 年份」短查询，不要用长句子**
| 百度 | `https://www.baidu.com/s?wd=` | 中文检索（含 AI 总结） | 浏览器 | ✅ 已验证（JS 渲染） |

## 五、官方名录与资讯

| 名称 | 地址 | 用途 | 采集方式 | 状态 |
|---|---|---|---|---|
| **中国田径协会官网** | `https://www.athletics.org.cn` | 官方新闻/通知/竞赛 | **fetch** | ✅ 已验证（3353字） |
| 中国马拉松资讯 | `https://cnmarathon.com` | 赛事资讯/定档消息 | **fetch** | ✅ 已验证（11364字） |
| 中国田协（旧域） | `https://www.runchina.org.cn` | 官方赛历 | — | ⚠️ 首页 JS 渲染，fetch 空 |
| 上马网 | `https://www.shang-ma.com` | 上海马拉松官方 | — | ⚠️ JS 应用，fetch 仅 3 字 |
| 田协目录转载（澎湃） | `https://m.thepaper.cn` | 492场完整目录 | 待测 | ⏳ 待验证 |

## 六、百科

| 名称 | 地址 | 用途 | 采集方式 | 状态 |
|---|---|---|---|---|
| 百度百科 | `https://baike.baidu.com/item/` | 简介文本 | 浏览器 | ⚠️ JS 渲染；内嵌坐标已失效 |

---

## 七、封锁/不可用清单（别再试）

| 名称 | 原因 |
|---|---|
| 维基百科 / Wikimedia 图床 | 网络层封锁 |
| 百度百科内嵌坐标 | 已不再输出 marker 坐标 |
| Nominatim | 本机不可达 |
| chinarun.com | 无法访问 |
| runchina.org.cn | 首页 JS 渲染，fetch 返回空（官网改用 athletics.org.cn） |
| finance.sina.com.cn | 无法访问 |
| chinamarathon.com `/events/{id}` | 详情页抓不到 |

---

## 八、推荐采集路径（2026-10-07 更新）

    列表页 fetch（chinamarathon 首页，拿名称+日期+场馆字符串）
          ↓
    collect geocode（场馆字符串 → 6 位坐标，节流 ≥350ms）
          ↓
    拿不到的 → 浏览器兜底

**关键认知修正**：列表页可 fetch，但详情页多为 JS 渲染。因此最优路径不是「全靠浏览器」或「全靠 fetch」，而是 **fetch 列表 + geocode 场馆字符串 + 浏览器兜底**。

---

## 九、维护约定

- 新增源补一行，**必须填「采集方式」与「状态」**。
- 状态：`⏳ 待验证` → `✅ 已验证` / `❌ 不可用`。
- 发现可用 `fetch` 直达 → 优先用它。
