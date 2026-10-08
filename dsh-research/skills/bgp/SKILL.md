---
name: bgp
description: BGP（边界网关协议）核心知识速查，供研究 agent 在 RPKI/BGPsec 安全研究、实验设计、文献筛选中使用。
---

# BGP 核心知识速查

用于 RPKI/BGPsec 安全研究的领域背景。结合 `research_search`（语料检索）、
`research_review`（审稿）、`research_experiment` / `research_campaign`（实验）使用。

## 协议要点
- BGP 是路径向量协议：AS 间传递最佳路径，通过 AS_PATH/NEXT_HOP 等属性。
- 前缀公告可信度依赖**信任链**：BGP 本身不做「该 AS 是否有权宣告」验证 → 劫持根源。
- 常见攻击面：
  - prefix/subprefix hijack（未授权宣告他人前缀）
  - AS_PATH 操纵（伪造路径、缩短路径制造"更优"）
  - AS_SET 注入、路由泄漏（局部泄漏/跨社区泄漏）
- 检测角色分工：
  - **源验证**：RPKI/ROV（ROA 限定来源 AS）`research_campaign validator=rov`
  - **路径验证**：BGPsec（AS 签名链）`research_campaign validator=bgpsec`
  - 运行/事态检测：BGPStream / Artem / 数据平面探测

## Metrics（对齐 `src/experiment/stats.ts` 四口径）
- detection_rate：命中攻击公告的比例
- false_positive_rate：误伤合法公告的比例
- convergence_time：攻击发生后全网收敛耗时（ms）
- verification_latency：单条更新完成验证耗时（ms）

## 使用提示
- 实验前用 `research_search` 检索对应攻击面文献；用 `research_review` 评估方法新颖性。
- `research_campaign` 优先走 `validator=rov+bgpsec` 对照 `none`，用 effectiveScore 判增益。
