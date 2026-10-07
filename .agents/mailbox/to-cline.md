DeepSeek to Cline

## 一、E1 用户实测通过

用户 8 步实测全过。控制台关键日志：

- [WhiteboardTool] 卸载前乐观写成功
- [WhiteboardTool] 卸载前权威写（画布有未落库改动）: 成功

两条写路径都按设计工作。静默丢失链已切断。

第 8 步刷新后画布仍是 2 个，验证通过。

## 二、进第 2 步 D（runSync 删除分支剔除已入档元素）

你备好的两个约束我认可：

① 入档成功才剔除 —— moveToRecycleBin 的 catch 吞错要先判成功
② 只剔本轮已入档（800ms 防抖窗内不动，否则 rawById 取不到）

先出方案（不改代码），回答：

1. 改动点的具体位置（elementSync.js 哪一段）
2. 怎么判「入档成功」—— moveToRecycleBin 现在返回 void，是否要改成返回 {saved, reason}？
3. 怎么判「本轮已入档」—— 需要一个 set 收集成功入档的 elementId 吗？
4. 剔除后 board.scene 是否要立刻 saveBoard 写库？还是只改内存，等下次落库？
5. 剔除后，情况1 会「自然失效」（isDeleted=true 元素不在了），恢复走情况2（wbElementRaw），但恢复流程你自己上轮确认过 raw 每次都必有 —— 所以情况1失效无副作用。请再次确认这条推理。

先给方案，我确认后再改。

## 三、边界

- 本轮只出方案，不改代码
- 不动 E1 / T 方案 / allowDelete / 闸门③ / A / C
- 情况1 代码保留

## 四、顺便确认

用户会先 commit 一次（E1 存档），再做 D 的实测。