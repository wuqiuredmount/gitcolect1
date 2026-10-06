# 采集员分片目录

本目录由「信息采集员」写入，主 AI 负责校验并登记到上级 `manifest.json`。

## 命名

    <类别>-<片区>-<采集员>.json

示例：`4a-hebei-a.json`（4A / 河北 / 采集员A）

## 格式

与正式批次文件一致：

    {
      "batchName": "河北4A级景区 · 冀北",
      "group": "中国4A级景区",
      "markerColor": "#1890ff",
      "items": [ ... ]
    }

item 字段：name / lat / lng / intro（100-1000字）/ time（时间敏感数据必填）/ images。

## 规则

1. 采集员只写本目录，**不改 manifest**，不写上级根目录。
2. 编号不要自己编，导入器会统一预留。
3. 完工后按协作协议第六节的格式向主 AI 汇报。
4. 主 AI 校验通过后，把 `shards/xxx.json` 登记进上级 manifest。

详见 `.agents/references/multi-ai-collab.md`。
