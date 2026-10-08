---
name: fcbgp
description: FC-BGP（功能组合式 BGP，无人机群组网）背景速查：BGP 的 4 个功能平面与安全自动化实验意图。
---

# FC-BGP 速查

## 背景
- FC-BGP（Function-Composed BGP）把 BGP 拆分为**数据/控制/管理/服务（策略）四个功能平面**，
  面向移动/无人机自组网边缘，按功能动态组合协议行为。
- 相关概念：意图驱动网络、策略即服务、BGP 扩展可编程性、安全自动化编排。

## 与研究管线的关系
- 把「安全事态」表达为 BGP 策略意图 → 交给实验环验证（claim → 实验 → verify → archive）。
- 与 RPKI/BGPsec 正交：前者验证来源与路径，FC-BGP 提供**可编程策略面**承载这些验证动作。
- 文献检索时用 `research_search`（如 "FC-BGP"、"intent-driven BGP"），命中后
  `research_review` 8 步审稿并落盘 artifact。

## 实验建议
- 攻击类优先 `as-set-injection` / `path-manipulation`（策略组合最敏感）。
- 用 `research_campaign` 设置不同 validator 对照，输出四口径到 `CampaignReport`。
