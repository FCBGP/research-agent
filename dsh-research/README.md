# @basil/dsh-research

研究型 agent 的 dsh bundle（插件组合包）。**绝不修改 `deepseek-harness/` 内部代码**，
一切通过本 bundle 的 patch 层与公开 seam（`ctx.*`、`agent/*`、`tools/*` 事件、
`@deepseek-ai/dsh-*` 发布入口）叠加在 dsh 之上。

## 结构

- `src/research-director/` — 研究目标拆分与 DAG 编排（ResearchGoal → tasks）
- `src/research-loop/` — 检索 → 阅读 → 假设 → 验证 → 反证 主循环
- `src/verification-loop/` — Claim / Evidence 校验与反证
- `src/experiment-loop/` — 实验配置生成、执行、结果固话
- `src/artifact-store/` — 报告 / PPT / 数据产物仓库
- `patches/` — cordis patch：research-agent / research-tools / research-policy / research-memory
- `skills/` — 领域技能：bgp / rpki / bgpsec / fcbgp / paper-review / experiment

## 装配

profile 通过 `dsh.profile.bundles` 有序装配：`@deepseek-ai/dsh-base` 在前，
本 bundle 在后。补丁顺序见各 patch 文件头部注释。
