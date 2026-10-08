# dsh-research/src — 插件源码

bundle 运行时代码入口（TypeScript/Cordis 插件）。零外部运行时依赖，Node 24 类型剥离直跑。

- `core/` — 阶段 1 领域核心：types / dag / claim / verification / artifact-store
- `memory/` — 阶段 2 五类记忆：semantic / episodic / artifact / hypothesis / evidence + 门面与持久化
- `agents/` — 阶段 2 三角色：literature（+seed corpus）/ reviewer（8 步）/ experiment（计划-执行-统计）
- `research-director/` — ResearchGoal 接收 → 任务 DAG 按角色分派 → 记忆写入 → 产出归档
- `research-loop/` — 主科研循环驱动（创件 createResearchLoop）
- `verification-loop/` — Claim/Evidence 批量验证循环（写回记忆 + 归档 verdict）
- `experiment-loop/` — 实验循环：plan → run → analyze，结果折入证据记忆
- `experiment/` — 阶段 3 实验层：stats 四口径 / topology（RouteEngineSim + FRR·VPP 适配器）/
  executors（TopologyExecutor）/ runner（自动实验 deploy→run→collect→analyze→verify→archive）
- `jobs/` — 阶段 4b 长任务队列：JobRunner（submit/get/list/cancel，同步/异步执行体，完成与失败归档 episodic + artifact）
- `scheduler/` — 阶段 4b 周期科研调度：`nextOccurrence` 纯函数（at ISO / daily HH:MM / everyMs）+ `ResearchScheduler`（可注入时钟；register/unregister/due/tick；一次性 at 到期自动停用；每次触发归档 episodic + artifact）
- `artifact-store/` — 报告 / PPT / 数据产物读写

约定：只消费公开 seam（`ctx.*`、`tools/*`、`@deepseek-ai/dsh-*` 发布包），
绝不 import `deepseek-harness/` 内部路径。注意事项：Node strip-only 不支持
类构造器参数属性与 `import { type X }` 内联修饰 —— 一律用显式字段 + `import type`。
