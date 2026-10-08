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

### 运行时插件（`src/plugin.ts`，Cordis 形态）— ✅ 已端到端挂载实测

- `export const name = 'dsh-research'` + `export const inject = ['tools']` + `export function apply(ctx, config)`
- `ctx.provide()`：`researchCore`（claim/verify/plan/artifact）、`researchMemory`、
  `researchAgents`、`researchDirector`
- `ctx.tools.register()`：5 个工具 —— `research_verify` / `research_record` /
  `research_search` / `research_review` / `research_experiment`
- 依赖生命周期挂在 fiber effect 上：profile 卸载即回收
- bundle patch（`patches/research-agent.yml`）以行 `dsh-research-core` 插入 profile 组合树；
  插件的行 `config` 由此进入（`tools.enabled` 开关、`memory.dir` 持久化等）

**验证（在 dsh 真实运行时内，非 mock）：**

```sh
# 1) 部署 profile（复制模板 + symlink 本包到 $DSH_HOME/profiles/research）
DSH_HOME=/tmp/dsh-home ./scripts/deploy-profile.sh

# 2) 组合树含本 bundle 行
DSH_HOME=/tmp/dsh-home dsh --profile research --dump-config | grep -A3 dsh-research

# 3) 运行时冒烟：4 个服务 / 5 个工具 / BGP claim→verify / 文献检索
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
- `src/plugin.ts` / `src/plugin.test.ts` — dsh 运行时插件入口与自检（内存假 ctx）
- `scripts/deploy-profile.sh` — 把 research profile 部署到 `$DSH_HOME`
- `scripts/runtime-smoke.mjs` — in-dsh 运行时冒烟
- `patches/` — bundle patch：`research-agent.yml`（已接入）；tools / policy / memory 为占位（合法空数组）
- `skills/` — 领域技能：bgp / rpki / bgpsec / fcbgp / paper-review / experiment（阶段 2+）
