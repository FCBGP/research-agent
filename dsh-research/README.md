# @basil/dsh-research

研究型 agent 的 dsh bundle（插件组合包）。**绝不修改 `deepseek-harness/` 内部代码**，
一切经本 bundle 的 patch 层与公开 seam 叠加在 dsh 之上。

## 阶段 1 已实现（核心六件，纯 TS 领域层）

`src/core/` —— 零运行时依赖，Node 24 原生类型剥离即可运行：

| 模块 | 六件对应 |
|---|---|
| `types.ts` | ResearchGoal / ResearchClaim / ResearchEvidence / Verdict / DAG 边 |
| `dag.ts` | ResearchTask DAG：按「依赖已满足 + 信息增益最高」选节点（`selectNext`/`unlock`） |
| `claim.ts` | Claim/Evidence 构造 + 置信度合成（`newClaim`/`addEvidence`/`synthConfidence`） |
| `verification.ts` | Verification Loop：Evidence Check / Counter Search / Experiment Test → verdict |
| `artifact-store.ts` | Artifact Store：统一存储、按 claim 追溯（`trace`）、归档 |

## 验证

```sh
cd dsh-research
node --test src/core/core.test.ts   # BGP 冒烟：claim → experiment → verdict → artifact
```

## 目录

- `src/core/` — 阶段 1 领域核心（本页）
- `src/research-director|loop|verification-loop|experiment-loop|artifact-store/` — 阶段 2 的 agent 化封装（占位）
- `patches/` — cordis patch：research-agent / tools / policy / memory
- `skills/` — 领域技能：bgp / rpki / bgpsec / fcbgp / paper-review / experiment（阶段 2+）
