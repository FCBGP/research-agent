# TODO.md — Research Agent OS 实施路线

> 由 `prompts/dsh.md` 梳理。分阶段推进：**先分析、后编码**；每项完成时勾选并附证据/产物路径。

## 阶段 0 · 架构迁移分析（先做，不改代码）

- [x] 在 vendored `deepseek-harness` 运行 `dsh --profile web --dump-config` 与 `dsh --profile web --dump-config-schema`，保存"机器实际启动的完整插件树"（`docs/baseline/`）
- [x] 产出 `docs/research-agent-architecture.md`（TL;DR 三黄金规则 + 结构保证 + 已验证挂载路径附录）
  - [x] Harness capability map / Existing capability reuse map / Required extension points
  - [x] Components that must NOT be modified（禁止改动清单，见 AGENTS.md §2）
  - [x] New research-domain packages / Data model / Agent lifecycle
  - [x] Research loop / Verification loop / Experiment loop（三条循环）
  - [~] Memory / Artifact 架构、Migration plan、MVI、上游风险 —— 顶层已覆盖，细分待补
- [ ] 产出 `docs/research-agent-data-model.md`
- [ ] 产出 `docs/research-agent-migration-plan.md`
- [ ] 现状盘点：现有 Python agent（`planning / evolve / memory / tools / debate / harness`）哪些可复用作 Executor / Knowledge Plane

## 阶段 1 · 核心六件（MVP，✅ 已完成并实测）

- [x] 1. **ResearchGoal**：Objectives 结构 = hypothesis / tasks / evidence / experiments / results / verification / counterexamples / status
- [x] 2. **ResearchTask DAG**：按"依赖已满足 + 信息增益最高"选节点（`src/core/dag.ts`）
- [x] 3. **ResearchClaim**：Type ∈ {Fact, Hypothesis, Assumption, Result, Interpretation}；含 evidence / source / confidence / verificationStatus / counterEvidence / dependencies（`src/core/types.ts`）
- [x] 4. **ResearchEvidence**：claim / source / evidence / confidence / verified / last_verified（`src/core/types.ts`）
- [x] 5. **Verification Loop**：Evidence Check / Counter Search / Experiment Test → verdict（`src/core/verification.ts`）
- [x] 6. **Artifact Store**：统一存储、按 claim 追溯、可归档（`src/core/artifact-store.ts`）
- [x] 端到端冒烟：BGP 用例跑通 "claim → 实验 → verdict → artifact"（`src/core/core.test.ts` 2 pass）
- [x] 运行时插件挂载：`src/plugin.ts`（researchCore + `research_verify`/`research_record`）
      in-dsh 实测 `SMOKE PASS`（见下面的"并行·Profile/打包"）

## 阶段 2 · Agent 与 Memory

- [x] 7. **Research Memory**：Semantic / Episodic / Artifact / Hypothesis / Evidence 五类（`src/memory/`，自测 6 pass）
- [x] 8. **Literature Agent**（RPKI/BGPsec 文献检索）：`src/agents/literature.ts` + 种子语料 `corpus.ts`（9 篇）
- [x] 9. **Reviewer Agent**（research-paper-review 8 步）：`src/agents/reviewer.ts`，8 步评分→判定+建议
- [x] 10. **Experiment Agent**（FRR / VPP 实验）：`src/agents/experiment.ts` plan→executor→analyze（阶段 3 接真实 FRR/VPP）

## 阶段 3 · Executors 与产出

- [x] 11. **FRR/VPP executor**（`src/experiment/topology.ts`：RouteEngineSim 确定性模拟 + Frr/VppTopology 真实守护进程适配器/回退；`executors.ts` TopologyExecutor 实现 Executor 契约，自测 8 pass）
- [x] 12. **automatic experiment**：`runner.ts` runAutomaticExperiment/runCampaign 实现 deploy → run(×repetitions) → collect → analyze → verify → archive，写回 episodic+artifact，插件 `research_campaign` 工具 + `researchExperiment` 服务
- [x] 13. **statistical analysis**：`experiment/stats.ts` 四口径均值/样本标准差/95%CI + summarizeDetection（effectiveScore），`metricsFor` 收敛四口径，多次重复统计（自测 + plugin + runtime-smoke 实测）
- [ ] 14. **paper generation**
- [ ] 15. **PPT generation**

## 阶段 4 · 自治化

- [ ] 16. **multi-agent**：角色化 subagent + 结构化 artifact 传递
- [ ] 17. **autonomous research loop**
- [ ] 18. **long-running jobs**
- [ ] 19. **scheduled research**
- [ ] 20. **self-improvement**

## 并行 · Profile / 打包（依托 Harness 原生机制）

- [x] `research` Profile：模板 `profiles/research/` + `cordis.patch.yml`；`dsh.profile.bundles` =
      `base + @deepseek-ai/dsh-headless + @basil/dsh-research`（headless 一次性 CLI 前端，2026-10-08 修复）
- [x] `dsh-research` bundle：`package.json` 声明 `dsh.bundle.patch`；`main` 指向 `src/plugin.ts`（Node 24 类型剥离，零外部运行时依赖）
  - [x] `src/`: core 六件 + 运行时插件 `plugin.ts`
  - [x] `patches/research-agent.yml`：`- insert:` 插入 `dsh-research-core` 行（已实测进入组合树）
  - [~] `patches/research-tools|policy|memory.yml`：占位（合法空数组），阶段 2 接入
  - [x] `src/research-director|loop|verification-loop|experiment-loop/`：阶段 2 的 agent 化封装（Director + 三循环，自测 pass）
  - [x] `skills/`: bgp / rpki / bgpsec / fcbgp / paper-review / experiment（各 SKILL.md 已填充，阶段 3）
- [x] **端到端挂载实测**（2026-10-08）：`dsh --profile research --dump-config` 组合树含
      headless-startup/headless-runner + `@basil/dsh-research`；`scripts/runtime-smoke.mjs` 在 dsh 真实
      运行树内验证 `researchCore provided YES` + 6 个 `research_*` 工具 + 自动实验战役 → `SMOKE PASS`
- [x] 一键部署脚本：`dsh-research/scripts/deploy-profile.sh`（模板 + symlink，改代码免重装）
- [ ] 多 Profile：`research` / `paper` / `experiment` / `engineering` / `reviewer`，共享 `dsh-research-core`
- [ ] **Research Agent Policy（10 条）固化为 profile 固有行为**
- [ ] `--patch` 组合：base → research policy → bgp research → experiment-specific patch
- [ ] 命名定型为 **`dsh-routing-research`**，内置领域词汇
- [ ] 一键部署：打包 `@basil/dsh-research` → `dsh plugin --profile research add @basil/dsh-research`
- [x] **真机可运行**：`profiles/research/cordis.patch.yml` 加入 web 同款 `llm-pi-ai`
      （`local-interval-dsv4`，credential-ref `LOCAL_INTERVAL_DSV4_API_KEY`）+ `agent-default-model`
      → dsv4flash；`dsh research "…"` 真机端到端实测通过（2026-10-08）
- [ ] Model Router：planner / researcher / coder / reviewer 按角色配模型

## 里程碑定义

- **Phase 1 完成** ✅ = ResearchGoal / DAG / Claim / Evidence / Verification Loop / Artifact Store + BGP 冒烟 + 运行时挂载（`SMOKE PASS`）
- **全部完成** = `dsh routing-research "研究 RPKI+BGPsec 的安全缺口"` 一键跑完整科研流水线

---

### 实施日志

- 2026-10-08：阶段 1 六件完成（`src/core/`，纯 TS）。`src/plugin.ts` Cordis 插件 + bundle patch
  `patches/research-agent.yml` 完成；profile 部署脚本与 runtime-smoke 完成，dsh 真实运行时
  `SMOKE PASS`。踩坑：Cordis 读 `ctx.tools` 需 `inject: ['tools']`（已成文于 AGENTS.md/arch 附录）。
- 2026-10-08（阶段 2）：五类记忆 + Literature/Reviewer/Experiment 三角色 + ResearchDirector/三循环完成；
  `src/plugin.ts` 扩展为 4 个服务 + 5 个工具；本地自测 core+memory+agents+director+plugin 全绿。
- 2026-10-08（阶段 2 修复）：director 调度终态改「执行成功即 done」（实验/验证/写作按设计不返回
  claim）；reviewer robust 通过线 ≥0.65；agents 统计期望修正 0.93→0.95。全套 **18/18** 绿。
- 2026-10-08（阶段 3）：`src/experiment/` 另起实验层 —— stats 四口径 / RouteEngineSim +
  FRR·VPP 适配器 / TopologyExecutor / 自动实验流水线；`src/plugin.ts` 新增 `researchExperiment`
  服务 + `research_campaign` 工具（6 个）。单测 **27/27** 绿 + runtime-smoke **SMOKE PASS**。
- 2026-10-08（阶段 3.5，Profile 前端）：`dsh research` 报 profile 不存在的根因是 profile 未部署
  到 `$DSH_HOME` + bundle 缺前端。`profiles/research/package.json` 改为
  base + `@deepseek-ai/dsh-headless` + `@basil/dsh-research`；runtime-smoke 复刻 `provideCmdline`
  使含 headless 的组合完整 boot（SMOKE PASS）。真机 CLI 端到端 boot→session→turn 已验证，
  仅剩 `~/.dsh/.credentials.yaml` 的 `DEEPSEEK_API_KEY` 401 需更换。
- 2026-10-08（阶段 3.5-b，模型层）：定位「仅剩 401」的真根因 —— web 走的是本地
  interval DSV4（`llm-pi-ai` + `local-interval-dsv4`，key 取 `LOCAL_INTERVAL_DSV4_API_KEY`），
  而 base 默认 `deepseek-official` 用占位 `DEEPSEEK_API_KEY="0731"` → 401。`profiles/research/
  cordis.patch.yml` 加 web 同款 overlay（provider + agent-default-model→dsv4flash），
  `dsh --profile research --json "RPKI 的作用?"` 真机端到端回答正确（completed）。
