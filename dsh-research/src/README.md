# dsh-research/src — 插件源码

bundle 运行时代码入口（TypeScript/Cordis 插件）。当前为占位骨架，含义见各子目录：

- `research-director/` — ResearchGoal 接收 → 任务 DAG 拆解与调度（`agent/*` 事件钩子）
- `research-loop/` — 检索引擎 → 阅读 → 假设生成 → 证据收集 → 反证 主循环
- `verification-loop/` — Claim/Evidence 校验、成本质控与反证（subagent + 事件钩子）
- `experiment-loop/` — 实验配置生成、`ctx.shell`/`ctx.jobs` 执行、结果固化到 artifact store
- `artifact-store/` — 报告 / PPT / 数据产物读写（复用旧 `src/research_agent/` 的 md2docx / worddoc 逻辑）

约定：只消费公开 seam（`ctx.*`、`agent/*`、`tools/*` 事件、`@deepseek-ai/dsh-*` 发布包），
绝不 import `deepseek-harness/` 内部路径。
