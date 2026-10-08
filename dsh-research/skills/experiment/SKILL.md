---
name: experiment
description: 面向 claim 的自动化实验纪律：deploy → run(×repetitions) → collect → analyze → verify → archive；用 research_campaign 一键跑四口径统计。
---

# 实验纪律（自动实验流水线）

## 标准流程（对应 `runner.ts` runAutomaticExperiment）
1. **plan**：由 `ExperimentAgent.plan` 从 claim 生成 env/scenario/配置指纹/四口径 metrics。
2. **deploy**：`TopologyExecutor` 首次 run 即部署拓扑（默认 `RouteEngineSim`，
   确定性可复现；FRR/VPP 可用时接管）。
3. **run × repetitions**：每次注入攻击事件并采集一轮四口径指标。
4. **analyze**：`stats.ts` —— 均值/样本标准差/95%CI + `summarizeDetection`（effectiveScore）。
5. **verify**：结果折入 claim 验证 → verdict（support/refute/inconclusive → verified/rejected/disputed）。
6. **archive**：写回 episodic + artifact（实验档案 + verdict），按 claim 可追溯。

## 门槛与口径
- 至少 repetitions=3；结论写「n、均值±CI」，不要单点。
- 指标（`metricsFor` 四口径）：detection_rate / false_positive_rate / convergence_time /
  verification_latency。
- 对照必做：`validator=none` 基线 vs `rov` / `bgpsec` / `rov+bgpsec`；攻击类按 claim 场景选。

## CLI/tool
- `research_campaign claim=… repetitions=3 validator=rov supportThreshold=0.6`
  → CampaignReport（stats + detection + verdict + artifacts）。
- 沙箱无真实网元：`data.engine=route-engine-sim`、`data.simulated=true` 如实记录。
