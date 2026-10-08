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

### 运行时插件（`src/plugin.ts`，Cordis 形态）— ✅ 已端到端挂载实测

- `export const name = 'dsh-research'` + `export const inject = ['tools']` + `export function apply(ctx, config)`
- `ctx.provide('researchCore', …)` 挂载 claim / verify / plan / artifact 领域服务
- `ctx.tools.register()` 注册 `research_verify` / `research_record` 工具
- 依赖生命周期挂在 fiber effect 上：profile 卸载即回收
- bundle patch（`patches/research-agent.yml`）以行 `dsh-research-core` 插入 profile 组合树；
  插件的行 `config` 由此进入（`tools.enabled` 开关等）

**验证（在 dsh 真实运行时内，非 mock）：**

```sh
# 1) 部署 profile（复制模板 + symlink 本包到 $DSH_HOME/profiles/research）
DSH_HOME=/tmp/dsh-home ./scripts/deploy-profile.sh

# 2) 组合树含本 bundle 行
DSH_HOME=/tmp/dsh-home dsh --profile research --dump-config | grep -A3 dsh-research

# 3) 运行时冒烟：researchCore 提供 / 2 个工具注册 / BGP claim→verify 闭环
DSH_HOME=/tmp/dsh-home node scripts/runtime-smoke.mjs   # → SMOKE PASS
```

## 验证（不依赖 dsh）

```sh
cd dsh-research
node --test src/            # core（2）+ plugin（1）自检全绿
```

## 目录

- `src/core/` — 阶段 1 领域核心
- `src/plugin.ts` — dsh 运行时插件入口（researchCore + research_* 工具）
- `src/plugin.test.ts` — 插件自检（内存假 ctx，不依赖 dsh）
- `scripts/deploy-profile.sh` — 把 research profile 部署到 `$DSH_HOME`
- `scripts/runtime-smoke.mjs` — in-dsh 运行时冒烟
- `src/research-director|loop|verification-loop|experiment-loop|artifact-store/` — 阶段 2 的 agent 化封装（占位）
- `patches/` — bundle patch：`research-agent.yml`（已接入）；tools / policy / memory 为占位（合法空数组）
- `skills/` — 领域技能：bgp / rpki / bgpsec / fcbgp / paper-review / experiment（阶段 2+）
