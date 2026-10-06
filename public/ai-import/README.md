# AI 批量导入目录

本目录用于「由 AI 生成、应用读取」的批量导入数据文件。AI 通过 webcode 把标准 JSON 写到这里，应用内的「AI批量导入」面板会读取并导入到 IndexedDB。

## 工作流

AI(联网采集) → 写入 public/ai-import/xxx.json → 更新 manifest.json → 应用面板读取 → 校验 → 写入 → 地图刷新

## 标准 JSON 结构

顶层字段：batchName(批次名)、group(分组名)、markerColor(标记色，默认 #1890ff)、items(数据数组)。

每个 item 字段：

- name：必填，景区名称，写入标记标题和文档名称
- lat / lng：必填，经纬度，AI 采集阶段必须给出精确值，不触发高德地理编码
- address：可选，地址，仅作记录
- intro：可选，简介正文，支持 HTML
- images：可选，图片外链数组，会在富文本末尾插入 img 标签

## 规则

1. 坐标必填。导入器不调用高德 geocode，避免消耗额度。
2. 图片用外链，不要用 base64，避免 IndexedDB 膨胀。
3. 增量追加，导入不覆盖已有数据。
4. 编号由导入器自动预留，AI 不要自己编 EH.xxxxx。
5. 换类别只换 JSON 文件，代码无需修改。
6. 新增 JSON 后，同步把文件名加进 manifest.json。
