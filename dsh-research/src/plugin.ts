// @basil/dsh-research — 兼容 re-export（阶段 5 末步：巨型插件降级；阶段 8/9 追加 TRIZ/TRIZa）。
//
// 原 700+ 行单文件插件（11 服务 + 13 工具全在 host 平面）已拆为 7 个职责单一插件
// （TODO 阶段 5·A/B + 阶段 8·TRIZ + 阶段 9·TRIZa，服务名 / 工具 schema 语义零变化）：
//
//   host 平面（cordis.patch.yml 按行挂载，行序 = 依赖顺序）：
//     ./core        → src/plugin-core.ts        researchCore / researchMemory / researchAgents
//     ./triz        → src/plugin-triz.ts        researchTriz（TRIZ 方法论：矛盾→原理→假说）
//     ./triza       → src/plugin-triza.ts       researchTriza（TRIZa 闭环：冻结契约→类型化变换→
//                                              FI/Ideality→硬门→晋升决策→追溯）
//     ./director    → src/plugin-director.ts    researchDirector（DAG 调度）
//     ./experiment  → src/plugin-experiment.ts  researchExperiment（自动实验战役）
//     ./writer      → src/plugin-writer.ts      researchWriter（论文 / 幻灯片）
//     ./operations  → src/plugin-operations.ts  researchPolicy / researchAutonomous /
//                                              researchJobs / researchScheduler /
//                                              researchSelfImprove / researchSubagents
//   preset 平面（presets/research.patch.yml 的 research-tools 行）：
//     ./tools       → src/plugin-tools.ts       15 个 research_* 工具（只在 research 预设会话可见）
//
// package.json `main` / `.` 指向 ./src/plugin-core.ts（核心插件入口）。
// 本文件不再承载任何实现：仅保留历史模块路径（`@basil/dsh-research/src/plugin.ts`
// / `./plugin.ts`）不中断——直接 re-export plugin-core（= main 入口），另具名导出
// 其余 7 个分片便于按需引用。运行时挂载走子路径，不经本文件。
export * from './plugin-core.ts';
export * as triz from './plugin-triz.ts';
export * as triza from './plugin-triza.ts';
export * as director from './plugin-director.ts';
export * as experiment from './plugin-experiment.ts';
export * as writer from './plugin-writer.ts';
export * as operations from './plugin-operations.ts';
export * as tools from './plugin-tools.ts';
