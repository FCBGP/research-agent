# @basil/dsh-research

研究型 agent 的 dsh bundle（插件组合包）。**绝不修改 `deepseek-harness/` 内部代码**，
一切经本 bundle 的 patch 层与公开 seam 叠加在 dsh 之上。

## 已实现

### 阶段 1 · 核心六件（纯 TS 领域层，`src/core/`，零运行时依赖）

| 模块 | 六件对应 |
|---|---|
| `types.ts` | ResearchGoal / ResearchClaim / ResearchEvidence / Verdict / DAG 边 |
| `dag.ts` | ResearchTask DAG：按「依赖已满足 + 信息增益最高」选节点（`selectNext`/`unlock`） |
| `claim.ts` | Claim/Evidence 构造 + 置信度合成（`newClaim`/`addEvidence`/`synthConfidence`） |
| `verification.ts` | Verification Loop：Evidence Check / Counter Search / Experiment Test → verdict |
| `artifact-store.ts` | Artifact Store：统一存储、按 claim 追溯（`trace`）、归档 |

### 阶段 2 · Research Memory + 三个角色 Agent + 调度（`src/memory|agents|research-*`，✅ 已实现并自测）

- **五类记忆**（`src/memory/`）：`semantic`（事实三元组+溯源）/ `episodic`（事件时间线）/
  `artifact`（产出检索式回忆）/ `hypothesis`（假设生命周期）/ `evidence`（证据台账）；
  `createMemory()` 门面 + `persistMemory`/`loadMemoryInto` 可选 JSON 落盘
- **Literature Agent**（`src/agents/literature.ts`）：本地种子语料（`corpus.ts`，
  9 篇 RPKI/BGPsec 经典文献）+ 关键词/词频召回；`LiteratureSource` 接口可注入真实检索
- **Reviewer Agent**（`src/agents/reviewer.ts`）：research-paper-review 8 步清单，
  评分合成 → `accept/minor-revision/major-revision/reject` 判定 + 改进建议汇总
- **Experiment Agent**（`src/agents/experiment.ts`）：claim → 实验计划（env/scenario/
  配置指纹/metrics）→ Executor 执行（当前 `StubExecutor` 占位，显式 `simulated`）→
  `analyze` 多次重复统计（均值/标准差）
- **ResearchDirector + 三条循环**（`src/research-director|research-loop|verification-loop|experiment-loop/`）：
  Goal → 任务 DAG → 按角色分派 → 记忆写入 → 产出归档；独立验证/实验循环可复用

### 阶段 3 · Executors 与产出（`src/experiment|writer/`，✅ 已实现并自测）

- **确定性模拟拓扑**（`src/experiment/topology.ts`）：`RouteEngineSim`（mulberry32 种子可复现）
  + FRR/VPP 真实守护进程适配器（`FrrTopology`/`VppTopology`，守护进程不可用时回退）；
  `TopologyExecutor` 实现 Executor 契约（`src/experiment/executors.ts`），
  攻击类别由 `inferAttack(plan.scenario)` 自动判定（hijack→prefix-hijack / bgpsec→path-manipulation…）
- **自动实验流水线**（`src/experiment/runner.ts`）：`runAutomaticExperiment` /
  `runCampaign` 实现 deploy → run(×repetitions) → collect → analyze → verify → archive，
  写回 episodic + artifact；四口径统计（`src/experiment/stats.ts`：
  均值 / 样本标准差 / 95%CI / effectiveScore）
- **Paper generation**（`src/writer/paper.ts`）：摘要 + 6 章节 + 附录 A 证据追溯，统计
  claims/verified/disputed/rejected/experiments；**PPT generation**（`src/writer/slides.ts`）：
  8 页 Marp 科研汇报，与 paper 共享同一 `PaperInput`（自测各 2 pass）

### 阶段 4 · 自治化（`src/roles|model-router|policy|autonomous/`，✅ 已完成核心）

- **多角色注册表**（`src/roles/`）：`ROLE_REGISTRY`（director / literature / reviewer /
  experimenter / writer 五角色）+ `TASK_ROLE` 分派表（task kind → 角色）
- **角色级模型路由**（`src/model-router/`）：默认 `local-interval-dsv4/dsv4flash`
  （与 profile 两层 overlay 对齐），可 `routes`/`roleModels` 覆盖
- **Research Agent Policy**（`src/policy/`）：10 条纪律（AGENTS.md §9）固化，
  `PolicyService` 支持 omit/extra/enabled，渲染 system-prompt 块
- **一键科研流水线**（`src/autonomous/`）：`buildGoal`（5 任务 DAG）+
  `runAutonomousResearch`（Director → 实验战役 → 验证折入 → Writer 论文+幻灯片 → 归档）；
  攻击语义正确：ROV 对 prefix-hijack verified（≈0.79）、对 path-manipulation rejected（≈0.33）

### 运行时插件（`src/plugin.ts`，Cordis 形态）— ✅ 已端到端挂载实测


- `export const name = 'dsh-research'` + `export const inject = ['tools']` + `export function apply(ctx, config)`
- `ctx.provide()`（8 服务）：`researchCore`、`researchMemory`、`researchAgents`、
  `researchDirector`、`researchExperiment`、`researchWriter`、`researchPolicy`、`researchAutonomous`
- `ctx.tools.register()`：10 个工具 —— `research_verify` / `research_record` /
  `research_search` / `research_review` / `research_experiment` / `research_campaign` /
  `research_paper` / `research_slides` / `research_autonomous` / `research_policy`
- 依赖生命周期挂在 fiber effect 上：profile 卸载即回收
- bundle patch（`patches/research-agent.yml`）以行 `dsh-research-core` 插入 profile 组合树；
  插件的行 `config` 由此进入（`tools.enabled` 开关、`memory.dir` 持久化等）

**验证（在 dsh 真实运行时内，非 mock）：**

```sh
# 1) 部署 profile（复制模板 + symlink 本包到 $DSH_HOME/profiles/research）
DSH_HOME=/tmp/dsh-home ./scripts/deploy-profile.sh

# 2) 组合树含本 bundle 行
DSH_HOME=/tmp/dsh-home dsh --profile research --dump-config | grep -A3 dsh-research

# 3) 运行时冒烟：8 服务 / 10 工具 / BGP claim→verify / 文献检索 / campaign / policy / autonomous
DSH_HOME=/tmp/dsh-home node scripts/runtime-smoke.mjs   # → SMOKE PASS
```

## 验证（不依赖 dsh）

```sh
cd dsh-research
node --test "src/**/*.test.ts"   # core + memory + agents + director + plugin 全绿
```

## 目录

- `src/core/` — 阶段 1 领域核心
- `src/memory/` — 阶段 2 五类记忆 + 门面/持久化
- `src/agents/` — 阶段 2 Literature / Reviewer / Experiment 三角色
- `src/research-director|research-loop|verification-loop|experiment-loop/` — 阶段 2 调度与三循环
- `src/writer/` — 阶段 3.6 论文/幻灯片生成（`paper.ts`/`slides.ts`）
- `src/roles/` `src/model-router/` `src/policy/` — 阶段 4 多角色 / 模型路由 / 纪律策略
- `src/autonomous/` — 阶段 4 一键科研流水线
- `src/plugin.ts` / `src/plugin.test.ts` — dsh 运行时插件入口与自检（内存假 ctx）
- `scripts/deploy-profile.sh` — 把 research profile 部署到 `$DSH_HOME`
- `scripts/runtime-smoke.mjs` — in-dsh 运行时冒烟
- `patches/` — bundle patch：`research-agent.yml`（已接入）；tools / policy / memory 为占位（合法空数组）
- `skills/` — 领域技能：bgp / rpki / bgpsec / fcbgp / paper-review / experiment（阶段 2+）
